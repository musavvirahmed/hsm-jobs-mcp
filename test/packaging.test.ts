import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { createMemoryJobsIndex } from "../src/jobs-index";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { handleRequest } from "../src/http";
import {
  CLIENT_KEY,
  EXAMPLE_ASKS,
  HSM_MCP_CLIENT_KEY,
  HSM_MCP_ORIGIN,
  READING_THE_ANSWERS_GIST,
  SERVER_NAME,
  SHARED_RELEASE_ORIGIN,
  V1_JOBS_TOOLS,
} from "../src/packaging";

const readme = readFileSync(resolve(import.meta.dirname, "../README.md"), "utf8");

function emptyDeps() {
  return {
    jobsIndex: createMemoryJobsIndex(),
    hsmMcp: createStubHsmMcp(),
  };
}

test("GET / returns a human-readable discovery page", async () => {
  const response = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/`),
    emptyDeps(),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toMatch(/text\/html/);
  const html = await response.text();
  expect(html).toMatch(/<html/i);
  expect(html).toContain(SERVER_NAME);
});

test("GET / documents connect with hsm-jobs and required hsm-mcp pairing", async () => {
  const response = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/`),
    emptyDeps(),
  );
  const html = await response.text();
  expect(html).toContain(CLIENT_KEY);
  expect(html).toContain(`${SHARED_RELEASE_ORIGIN}/mcp`);
  expect(html).toContain(HSM_MCP_CLIENT_KEY);
  expect(html).toContain(HSM_MCP_ORIGIN);
  expect(html).toMatch(/streamable http/i);
});

test("GET / lists all v1 jobs tools and locked example asks", async () => {
  const response = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/`),
    emptyDeps(),
  );
  const html = await response.text();
  for (const tool of V1_JOBS_TOOLS) {
    expect(html).toContain(tool.name);
  }
  for (const ask of EXAMPLE_ASKS) {
    expect(html).toContain(ask);
  }
});

test("GET / includes reading-the-answers gist and freshness pointers", async () => {
  const response = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/`),
    emptyDeps(),
  );
  const html = await response.text();
  for (const line of READING_THE_ANSWERS_GIST) {
    expect(html).toContain(line);
  }
  expect(html).toContain("/health");
  expect(html).toContain("get_index_status");
});

test("GET / is connect/discovery only — no portal surfaces", async () => {
  const response = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/`),
    emptyDeps(),
  );
  const html = (await response.text()).toLowerCase();
  expect(html).not.toMatch(/<form[^>]*action/);
  expect(html).not.toContain("search_jobs(");
  expect(html).not.toMatch(/golden test/i);
  expect(html).not.toContain("```mermaid");
  expect(html).not.toMatch(/stdio/i);
});

test("README is a product README with required packaging sections", () => {
  expect(readme).toContain(SERVER_NAME);
  expect(readme).toContain(SHARED_RELEASE_ORIGIN);
  expect(readme).toContain(CLIENT_KEY);
  expect(readme).toContain(HSM_MCP_CLIENT_KEY);
  expect(readme).not.toMatch(/plan,\s*don.?t do/i);
  expect(readme).not.toMatch(/do not implement/i);
  expect(readme).not.toMatch(/golden test/i);
  for (const tool of V1_JOBS_TOOLS) {
    expect(readme).toContain(tool.name);
  }
  expect(readme).toMatch(/reading the answers/i);
  expect(readme).toMatch(/```mermaid/);
  expect(readme).toMatch(/\| `GET \/`/);
  expect(readme).toMatch(/\| `\/mcp` \|/);
  expect(readme).toMatch(/\| `\/health` \|/);
});
