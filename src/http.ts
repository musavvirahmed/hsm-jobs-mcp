import { createMcpHandler } from "@modelcontextprotocol/server";
import { discoveryPageResponse } from "./discovery-page";
import { faviconResponse, isFaviconPath } from "./favicon";
import { isSharedReleaseHost, sharedReleaseAllowed } from "./index-pass";
import type { JobsToolsDeps } from "./jobs-tools";
import { createJobsMcpServer } from "./mcp-server";
import { SERVER_CARD_PATHS, serverCardResponse } from "./server-card";

export type CoarseHealth = "up" | "degraded" | "stale";

export async function handleRequest(request: Request, deps: JobsToolsDeps): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/" && request.method === "GET") {
    return discoveryPageResponse(url.origin);
  }
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    isFaviconPath(url.pathname)
  ) {
    const response = faviconResponse();
    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: response.headers });
    }
    return response;
  }
  if (
    request.method === "GET" &&
    (SERVER_CARD_PATHS as readonly string[]).includes(url.pathname)
  ) {
    return serverCardResponse(url.origin);
  }
  if (url.pathname === "/health") {
    return healthResponse(deps);
  }
  if (url.pathname === "/mcp") {
    if (isSharedReleaseHost(url.hostname) && !(await sharedReleaseInPolicy(deps))) {
      return new Response("Shared release waits for a full careers pass", { status: 503 });
    }
    const handler = createMcpHandler(() => createJobsMcpServer(deps, url.origin));
    return handler.fetch(request);
  }
  return new Response("Not found", { status: 404 });
}

async function healthResponse(deps: JobsToolsDeps): Promise<Response> {
  try {
    const snapshot = await deps.jobsIndex.snapshot();
    const status: CoarseHealth = snapshot.stale ? "stale" : "up";
    return Response.json({ status });
  } catch {
    return Response.json({ status: "degraded" satisfies CoarseHealth }, { status: 503 });
  }
}

async function sharedReleaseInPolicy(deps: JobsToolsDeps): Promise<boolean> {
  try {
    const snapshot = await deps.jobsIndex.snapshot();
    return sharedReleaseAllowed(snapshot.index_scope.pass);
  } catch {
    return false;
  }
}
