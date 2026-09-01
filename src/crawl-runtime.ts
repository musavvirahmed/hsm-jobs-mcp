import { createAshbyBoardFeedFetcher } from "./ashby-board";
import {
  createPlaywrightPageGetter,
  type PlaywrightPageGetter,
} from "./browser-harvest";
import { awaitWithTimeout, DEFAULT_RUNTIME_CLOSE_TIMEOUT_MS } from "./fetch-timeout";
import {
  createNetworkHsmMcpRegisterClient,
  createStreamableHsmMcpRegisterTransport,
  type StreamableHsmMcpClientOptions,
} from "./hsm-mcp-register-client";
import type { BoardFeedResponse } from "./opening-ingest";
import {
  createHsmMcpRegisterSource,
  type HsmRegisterClient,
  type RegisterSource,
} from "./register-source";
import {
  createHttpsPageGetter,
  createWikidataSparqlLookup,
  type WebsiteResolutionProviders,
} from "./website-resolution";

export type ProductionCrawlRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  registerClient?: HsmRegisterClient;
  hsmMcpTransportOptions?: StreamableHsmMcpClientOptions;
  fetchImpl?: typeof fetch;
  /** Injected in tests; default launches Chromium lazily on first last-resort fetch. */
  createPageGetter?: () => Promise<PlaywrightPageGetter>;
  /** Override shutdown race (default 8s). */
  closeTimeoutMs?: number;
};

export type ProductionCrawlRuntime = {
  register: RegisterSource;
  providers: WebsiteResolutionProviders;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  getBrowserPage?: WebsiteResolutionProviders["getPage"];
  close: () => Promise<void>;
};

/** Non-smoke operator crawl: live hsm-mcp register + real website resolution providers. */
export async function createProductionCrawlRuntime(
  options: ProductionCrawlRuntimeOptions = {},
): Promise<ProductionCrawlRuntime> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const transport = createStreamableHsmMcpRegisterTransport({
    ...options.hsmMcpTransportOptions,
    fetchImpl,
    origin: options.env?.HSM_MCP_ORIGIN?.trim() || options.hsmMcpTransportOptions?.origin,
  });
  const registerClient = options.registerClient ?? createNetworkHsmMcpRegisterClient(transport);
  const createPageGetter = options.createPageGetter ?? createPlaywrightPageGetter;
  const closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_RUNTIME_CLOSE_TIMEOUT_MS;
  let browser: PlaywrightPageGetter | null | undefined;
  const ensureBrowser = async (): Promise<PlaywrightPageGetter | null> => {
    if (browser !== undefined) return browser;
    browser = await createPageGetter().catch(() => null);
    return browser;
  };
  return {
    register: createHsmMcpRegisterSource(registerClient),
    providers: {
      wikidata: createWikidataSparqlLookup(fetchImpl),
      getPage: createHttpsPageGetter(fetchImpl),
    },
    fetchBoardFeed: createAshbyBoardFeedFetcher(fetchImpl),
    getBrowserPage: async (url) => {
      const instance = await ensureBrowser();
      return instance ? instance.getPage(url) : null;
    },
    close: async () => {
      try {
        await awaitWithTimeout(
          transport.close(),
          closeTimeoutMs,
          "hsm-mcp transport close",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[crawl] ${message} — continuing shutdown`);
      }
      if (browser) {
        try {
          await awaitWithTimeout(
            browser.close(),
            closeTimeoutMs,
            "playwright close",
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[crawl] ${message} — continuing shutdown`);
        }
      }
    },
  };
}
