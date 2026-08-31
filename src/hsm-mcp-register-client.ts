import { parseIndRegisterHtml } from "./ind-register-parse";
import { DEFAULT_CRAWL_FETCH_TIMEOUT_MS, fetchWithTimeout } from "./fetch-timeout";
import { HSM_MCP_ORIGIN } from "./packaging";
import type { HsmRegisterClient, RegisterSponsor } from "./register-source";

export const DEFAULT_IND_REGISTER_URL =
  "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";

export type HsmRegisterStatus = {
  ind_last_updated: string | null;
  row_count: number | null;
  stale: boolean;
  source: string | null;
};

export type HsmMcpRegisterTransport = {
  getRegisterStatus(): Promise<HsmRegisterStatus>;
  fetchRegisterHtml(url: string): Promise<string>;
};

export function createNetworkHsmMcpRegisterClient(
  transport: HsmMcpRegisterTransport,
): HsmRegisterClient {
  return {
    async getRegisterStatus() {
      const status = await transport.getRegisterStatus();
      return { ind_last_updated: status.ind_last_updated };
    },

    async listSponsors(): Promise<RegisterSponsor[]> {
      const status = await transport.getRegisterStatus();
      if (status.stale) {
        throw new Error("hsm-mcp register is stale — refusing production crawl register load");
      }
      if (!status.row_count || status.row_count < 1000) {
        throw new Error("hsm-mcp register row_count missing or implausibly small");
      }
      const registerUrl = status.source?.trim() || DEFAULT_IND_REGISTER_URL;
      const html = await transport.fetchRegisterHtml(registerUrl);
      const parsed = parseIndRegisterHtml(html);
      if (!parsed.indUpdatedAt) {
        throw new Error("could not parse IND register last-updated date from HTML");
      }
      if (status.ind_last_updated && parsed.indUpdatedAt !== status.ind_last_updated) {
        throw new Error(
          `IND HTML date ${parsed.indUpdatedAt} does not match hsm-mcp ind_last_updated ${status.ind_last_updated}`,
        );
      }
      const valid = parsed.entries.filter((entry) => /^\d{8}$/.test(entry.kvk) && entry.name.length > 0);
      if (valid.length < 1000) {
        throw new Error(`only ${valid.length} valid register rows parsed from IND HTML`);
      }
      const rowDelta = Math.abs(valid.length - status.row_count) / status.row_count;
      if (rowDelta > 0.01) {
        throw new Error(
          `parsed row count ${valid.length} differs from hsm-mcp row_count ${status.row_count}`,
        );
      }
      return valid;
    },
  };
}

export function parseHsmRegisterStatusPayload(payload: unknown): HsmRegisterStatus {
  const record = payload as {
    ind_last_updated?: unknown;
    row_count?: unknown;
    stale?: unknown;
    source?: unknown;
  };
  return {
    ind_last_updated:
      typeof record.ind_last_updated === "string" ? record.ind_last_updated : null,
    row_count: typeof record.row_count === "number" ? record.row_count : null,
    stale: record.stale === true,
    source: typeof record.source === "string" ? record.source : null,
  };
}

export function parseMcpToolJson(result: { content?: Array<{ type?: string; text?: string }> }): unknown {
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (!text) {
    throw new Error("hsm-mcp tool response missing text content");
  }
  return JSON.parse(text);
}

export type StreamableHsmMcpClientOptions = {
  origin?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** Timeout for IND HTML register fetch (MCP tool calls use the client transport). */
  fetchTimeoutMs?: number;
};

/** Live hsm-mcp transport: MCP status + IND HTML fetch gated on that status. */
export function createStreamableHsmMcpRegisterTransport(
  options: StreamableHsmMcpClientOptions = {},
): HsmMcpRegisterTransport & { close(): Promise<void> } {
  const origin = (options.origin ?? HSM_MCP_ORIGIN).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_CRAWL_FETCH_TIMEOUT_MS;
  const userAgent =
    options.userAgent ??
    "hsm-jobs-mcp/0.1 (operator crawl; register load gated via hsm-mcp)";

  let session: {
    callTool(name: string, args: Record<string, unknown>): Promise<{ content?: Array<{ type?: string; text?: string }> }>;
    close(): Promise<void>;
  } | null = null;

  async function ensureSession() {
    if (session) return session;
    const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
    const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { fetch: fetchImpl });
    const client = new Client(
      { name: "hsm-jobs-mcp-crawl", version: "0.1.0" },
      { versionNegotiation: { mode: "auto" } },
    );
    await client.connect(transport);
    session = {
      async callTool(name, args) {
        return client.callTool({ name, arguments: args });
      },
      close: async () => {
        await client.close();
      },
    };
    return session;
  }

  return {
    async getRegisterStatus() {
      const active = await ensureSession();
      const result = await active.callTool("get_register_status", {});
      return parseHsmRegisterStatusPayload(parseMcpToolJson(result));
    },

    async fetchRegisterHtml(url: string) {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          headers: {
            "User-Agent": userAgent,
            Accept: "text/html",
            "Accept-Language": "en",
          },
        },
        { timeoutMs: fetchTimeoutMs },
      );
      if (!response.ok) {
        throw new Error(`IND register fetch failed: HTTP ${response.status}`);
      }
      return response.text();
    },

    async close() {
      if (session) {
        await session.close();
        session = null;
      }
    },
  };
}
