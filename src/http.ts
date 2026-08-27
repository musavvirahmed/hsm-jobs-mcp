import { createMcpHandler } from "@modelcontextprotocol/server";
import type { JobsToolsDeps } from "./jobs-tools";
import { createJobsMcpServer } from "./mcp-server";

export type CoarseHealth = "up" | "degraded" | "stale";

export async function handleRequest(request: Request, deps: JobsToolsDeps): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return healthResponse(deps);
  }
  if (url.pathname === "/mcp") {
    const handler = createMcpHandler(() => createJobsMcpServer(deps));
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
