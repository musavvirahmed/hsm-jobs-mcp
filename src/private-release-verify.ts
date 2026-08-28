import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { RENTMAN_PRODUCT_DESIGNER_URL } from "./fixtures/jobs-index";
import { SERVER_NAME } from "./mcp-server";

/** Default local `wrangler dev` origin for private-release verify. */
export const DEFAULT_PRIVATE_RELEASE_ORIGIN = "http://127.0.0.1:8787";

export const RENTMAN_GOLDEN_KVK = "60733144";

const GOLDEN_QUERY = "product designer";

export type PrivateReleaseVerifyFailure = {
  check: string;
  detail: string;
};

export type PrivateReleaseVerifyResult =
  | { ok: true }
  | { ok: false; failures: PrivateReleaseVerifyFailure[] };

export function privateReleaseOriginFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.PRIVATE_RELEASE_ORIGIN?.trim() || DEFAULT_PRIVATE_RELEASE_ORIGIN;
}

export function formatPrivateReleaseFailures(failures: PrivateReleaseVerifyFailure[]): string {
  return failures
    .map((failure) => `[private-release:verify] ${failure.check}: ${failure.detail}`)
    .join("\n");
}

export function isGoldenOpening(opening: {
  url?: string;
  title?: string;
  register_join?: { kvk?: string | null };
}): boolean {
  if (opening.url && isGoldenOpeningUrl(opening.url)) {
    return true;
  }
  return (
    opening.register_join?.kvk === RENTMAN_GOLDEN_KVK &&
    opening.title?.trim().toLowerCase() === "product designer"
  );
}

export function indexScopeReadyForPrivateRelease(scope?: {
  pass?: string;
  omissions_possible?: boolean;
  sponsors_with_openings?: number;
}): PrivateReleaseVerifyFailure | null {
  if (!scope?.sponsors_with_openings || scope.sponsors_with_openings <= 0) {
    return {
      check: "get_index_status sponsors_with_openings",
      detail: "expected index_scope.sponsors_with_openings > 0 — index looks empty",
    };
  }
  if (scope.pass === "partial") {
    if (scope.omissions_possible !== true) {
      return {
        check: "get_index_status omissions_possible",
        detail: "expected index_scope.omissions_possible true on a partial private-release index",
      };
    }
    return null;
  }
  if (scope.pass === "full_careers_pass") {
    if (scope.omissions_possible !== false) {
      return {
        check: "get_index_status omissions_possible",
        detail:
          "expected index_scope.omissions_possible false when pass is full_careers_pass on the fixture register",
      };
    }
    return null;
  }
  return {
    check: "get_index_status pass",
    detail: `expected index_scope.pass "partial" or "full_careers_pass", got ${String(scope.pass)}`,
  };
}

export function isGoldenOpeningUrl(url: string): boolean {
  if (url === RENTMAN_PRODUCT_DESIGNER_URL) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith("rentman.io") &&
      parsed.pathname.toLowerCase().includes("product-designer")
    ) {
      return true;
    }
    return parsed.hostname === "jobs.ashbyhq.com" && parsed.pathname.startsWith("/rentman/");
  } catch {
    return false;
  }
}

export async function connectPrivateReleaseMcp(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const base = origin.replace(/\/$/, "");
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", `${base}/`), {
    fetch: fetchImpl,
  });
  const client = new Client(
    { name: "private-release-verify", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  const serverVersion = client.getServerVersion();
  if (serverVersion?.name !== SERVER_NAME) {
    await client.close();
    throw new Error(
      `Expected MCP serverInfo.name "${SERVER_NAME}" at ${base}/mcp, got ${serverVersion?.name ?? "none"}`,
    );
  }
  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

export async function verifyPrivateRelease(client: Client): Promise<PrivateReleaseVerifyResult> {
  const failures: PrivateReleaseVerifyFailure[] = [];

  const search = await client.callTool({
    name: "search_jobs",
    arguments: { query: GOLDEN_QUERY },
  });
  if (search.isError) {
    failures.push({
      check: "search_jobs",
      detail: "tool returned an MCP error — is wrangler dev running with a crawled local D1 index?",
    });
    return { ok: false, failures };
  }

  const searchPayload = search.structuredContent as {
    openings?: Array<{
      url?: string;
      title?: string;
      register_join?: { strength?: string; kvk?: string | null };
    }>;
  };
  const openings = searchPayload.openings ?? [];
  const goldenOpening = openings.find((opening) => isGoldenOpening(opening));
  if (!goldenOpening?.url) {
    failures.push({
      check: "search_jobs golden Opening",
      detail:
        openings.length === 0
          ? `no Openings for query "${GOLDEN_QUERY}" — run npm run crawl, then npm run dev`
          : `expected ${RENTMAN_PRODUCT_DESIGNER_URL} (or equivalent Rentman Product Designer URL) among hits`,
    });
  } else if (goldenOpening.register_join?.strength === "unmatched") {
    failures.push({
      check: "search_jobs golden Opening",
      detail: "golden card register_join.strength is unmatched — index-time join did not survive",
    });
  }

  const goldenUrl = goldenOpening?.url ?? RENTMAN_PRODUCT_DESIGNER_URL;
  const job = await client.callTool({
    name: "get_job",
    arguments: { url: goldenUrl },
  });
  if (job.isError) {
    failures.push({
      check: "get_job",
      detail: `tool returned an MCP error for ${goldenUrl}`,
    });
  } else {
    const jobPayload = job.structuredContent as {
      found?: boolean;
      honesty_salary?: unknown;
      honesty_dutch_required?: unknown;
      honesty_sponsorship_willingness?: unknown;
    };
    if (!jobPayload.found) {
      failures.push({
        check: "get_job golden Opening",
        detail: `found:false for ${goldenUrl} — crawl may not have persisted Openings to local D1`,
      });
    } else {
      for (const field of [
        "honesty_salary",
        "honesty_dutch_required",
        "honesty_sponsorship_willingness",
      ] as const) {
        if (!(field in jobPayload)) {
          failures.push({
            check: "get_job honesty fields",
            detail: `missing ${field} on golden Opening`,
          });
        }
      }
    }
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
        sponsors_with_openings?: number;
      };
    };
    const scope = statusPayload.index_scope;
    const scopeFailure = indexScopeReadyForPrivateRelease(scope);
    if (scopeFailure) {
      failures.push(scopeFailure);
    }
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
