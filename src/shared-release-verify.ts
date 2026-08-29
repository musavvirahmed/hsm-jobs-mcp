import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { SHARED_RELEASE_ORIGIN } from "./packaging";
import { SERVER_NAME } from "./mcp-server";

/**
 * Minimum Work-register size for shared-release verify on production.
 * Rejects fixture-sized indexes accidentally pointed at the public origin.
 */
export const MIN_PLAUSIBLE_REGISTER_SIZE = 1000;

export type SharedReleaseVerifyFailure = {
  check: string;
  detail: string;
};

export type SharedReleaseVerifyResult =
  | { ok: true }
  | { ok: false; failures: SharedReleaseVerifyFailure[] };

export function sharedReleaseOriginFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.SHARED_RELEASE_ORIGIN?.trim() || SHARED_RELEASE_ORIGIN;
}

export function formatSharedReleaseFailures(failures: SharedReleaseVerifyFailure[]): string {
  return failures
    .map((failure) => `[shared-release:verify] ${failure.check}: ${failure.detail}`)
    .join("\n");
}

export function indexScopeReadyForSharedRelease(scope?: {
  pass?: string;
  omissions_possible?: boolean;
  register_size?: number;
}): SharedReleaseVerifyFailure | null {
  if (scope?.pass !== "full_careers_pass") {
    return {
      check: "get_index_status pass",
      detail: `expected index_scope.pass "full_careers_pass", got ${String(scope?.pass)}`,
    };
  }
  if (scope.omissions_possible !== false) {
    return {
      check: "get_index_status omissions_possible",
      detail: "expected index_scope.omissions_possible false on a shared-release index",
    };
  }
  const registerSize = scope.register_size ?? 0;
  if (registerSize < MIN_PLAUSIBLE_REGISTER_SIZE) {
    return {
      check: "get_index_status register_size",
      detail: `expected index_scope.register_size >= ${MIN_PLAUSIBLE_REGISTER_SIZE} (plausible Work register), got ${registerSize}`,
    };
  }
  return null;
}

export async function checkSharedReleaseHealth(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SharedReleaseVerifyFailure | null> {
  const healthUrl = `${origin.replace(/\/$/, "")}/health`;
  try {
    const response = await fetchImpl(healthUrl);
    if (response.status !== 200) {
      return {
        check: "/health",
        detail: `expected HTTP 200 from ${healthUrl}, got ${response.status}`,
      };
    }
    const payload = (await response.json()) as { status?: unknown };
    if (typeof payload.status !== "string") {
      return {
        check: "/health",
        detail: `expected JSON body with string status from ${healthUrl}`,
      };
    }
    if (payload.status === "degraded") {
      return {
        check: "/health",
        detail: `health status is degraded — jobs index may be unreadable at ${healthUrl}`,
      };
    }
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      check: "/health",
      detail: `failed to fetch ${healthUrl}: ${detail}`,
    };
  }
}

export async function connectSharedReleaseMcp(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const base = origin.replace(/\/$/, "");
  const mcpUrl = new URL("/mcp", `${base}/`);
  const probe = await fetchImpl(mcpUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "shared-release-verify-probe", version: "1.0.0" },
      },
    }),
  });
  if (probe.status === 503) {
    throw new Error(
      `POST ${mcpUrl} returned 503 — shared /mcp is blocked until pass is full_careers_pass`,
    );
  }
  if (!probe.ok) {
    throw new Error(`POST ${mcpUrl} initialize probe failed with HTTP ${probe.status}`);
  }

  const transport = new StreamableHTTPClientTransport(mcpUrl, { fetch: fetchImpl });
  const client = new Client(
    { name: "shared-release-verify", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  const serverVersion = client.getServerVersion();
  if (serverVersion?.name !== SERVER_NAME) {
    await client.close();
    throw new Error(
      `Expected MCP serverInfo.name "${SERVER_NAME}" at ${mcpUrl}, got ${serverVersion?.name ?? "none"}`,
    );
  }
  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

export async function verifySharedRelease(
  client: Client,
  options: {
    origin?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<SharedReleaseVerifyResult> {
  const failures: SharedReleaseVerifyFailure[] = [];
  const origin = options.origin ?? sharedReleaseOriginFromEnv();
  const fetchImpl = options.fetchImpl ?? fetch;

  const healthFailure = await checkSharedReleaseHealth(origin, fetchImpl);
  if (healthFailure) {
    failures.push(healthFailure);
  }

  const status = await client.callTool({ name: "get_index_status", arguments: {} });
  if (status.isError) {
    failures.push({
      check: "get_index_status",
      detail: "tool returned an MCP error",
    });
  } else {
    const statusPayload = status.structuredContent as {
      index_scope?: {
        pass?: string;
        omissions_possible?: boolean;
        register_size?: number;
      };
    };
    const scopeFailure = indexScopeReadyForSharedRelease(statusPayload.index_scope);
    if (scopeFailure) {
      failures.push(scopeFailure);
    }
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
