import { createAshbyBoardFeedFetcher } from "./ashby-board";
import { createPlaywrightPageGetter } from "./browser-harvest";
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
  const browser = await createPlaywrightPageGetter().catch(() => null);
  return {
    register: createHsmMcpRegisterSource(registerClient),
    providers: {
      wikidata: createWikidataSparqlLookup(fetchImpl),
      getPage: createHttpsPageGetter(fetchImpl),
    },
    fetchBoardFeed: createAshbyBoardFeedFetcher(fetchImpl),
    getBrowserPage: browser?.getPage,
    close: async () => {
      await transport.close();
      if (browser) {
        await browser.close();
      }
    },
  };
}
