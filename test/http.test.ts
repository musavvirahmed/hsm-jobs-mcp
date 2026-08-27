import { expect, test } from "vitest";
import { createMemoryJobsIndex } from "../src/jobs-index";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { handleRequest } from "../src/http";

function emptyDeps() {
  return {
    jobsIndex: createMemoryJobsIndex(),
    hsmMcp: createStubHsmMcp(),
  };
}

test("/health on an empty jobs index returns coarse stale", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1/health"), emptyDeps());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "stale" });
});

test("/mcp initialize reports serverInfo.name hsm-jobs-mcp", async () => {
  const response = await handleRequest(
    new Request("http://127.0.0.1/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.1" },
        },
      }),
    }),
    emptyDeps(),
  );
  expect(response.ok).toBe(true);
  const payload = await readMcpJson(response);
  expect(payload.result.serverInfo.name).toBe("hsm-jobs-mcp");
});

test("unknown paths are a boring 404", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1/"), emptyDeps());
  expect(response.status).toBe(404);
});

test("/health is degraded when the jobs index cannot be read", async () => {
  const response = await handleRequest(new Request("http://127.0.0.1/health"), {
    jobsIndex: {
      snapshot: async () => {
        throw new Error("jobs index unavailable");
      },
      searchOpenings: async () => [],
      getOpening: async () => null,
    },
    hsmMcp: createStubHsmMcp(),
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "degraded" });
});

async function readMcpJson(response: Response): Promise<{ result: { serverInfo: { name: string } } }> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (contentType.includes("text/event-stream")) {
    const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) {
      throw new Error(`no SSE data in ${body}`);
    }
    return JSON.parse(dataLine.slice(6)) as { result: { serverInfo: { name: string } } };
  }
  return JSON.parse(body) as { result: { serverInfo: { name: string } } };
}
