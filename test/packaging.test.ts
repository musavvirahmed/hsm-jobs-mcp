import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { createMemoryJobsIndex } from "../src/jobs-index";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { handleRequest } from "../src/http";
import {
  CLIENT_KEY,
  EXAMPLE_ASKS,
  GITHUB_ABOUT,
  HSM_MCP_CLIENT_KEY,
  HSM_MCP_ORIGIN,
  READING_THE_ANSWERS_GIST,
  SERVER_NAME,
  SHARED_RELEASE_ORIGIN,
  SHARED_RELEASE_WIP_MARKER,
  V1_JOBS_TOOLS,
} from "../src/packaging";
import { SERVER_CARD_DESCRIPTION } from "../src/server-card";

const readme = readFileSync(resolve(import.meta.dirname, "../README.md"), "utf8");
const developerReadme = readFileSync(
  resolve(import.meta.dirname, "../docs/README-developers.md"),
  "utf8",
);

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
  expect(html).toContain(SHARED_RELEASE_WIP_MARKER);
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

test("GET / uses TUI discovery chrome (variant B winner)", async () => {
  const response = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/`),
    emptyDeps(),
  );
  const html = await response.text();
  expect(html).toContain('class="tui-header"');
  expect(html).toContain('class="tui-box"');
  expect(html).toContain("data-title=\"Connect (Streamable HTTP)\"");
});

test("GET /.well-known/mcp.json serves a server card", async () => {
  const response = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/.well-known/mcp.json`),
    emptyDeps(),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toMatch(/application\/json/);
  expect(response.headers.get("cache-control")).toMatch(/max-age=3600/);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  const card = (await response.json()) as {
    name: string;
    description: string;
    version: string;
    remotes: Array<{ type: string; url: string }>;
  };
  expect(card.name).toBe(SERVER_NAME);
  expect(card.description).toBe(SERVER_CARD_DESCRIPTION);
  expect(card.version).toBeTruthy();
  expect(card.remotes).toEqual([
    { type: "streamable-http", url: `${SHARED_RELEASE_ORIGIN}/mcp` },
  ]);
  const body = JSON.stringify(card);
  expect(body).not.toContain(HSM_MCP_CLIENT_KEY);
  expect(body).not.toContain(HSM_MCP_ORIGIN);
  expect(body).not.toMatch(/hsm-mcp/i);
});

test("GET /.well-known/mcp/server-card.json mirrors the server card", async () => {
  const mcpJson = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/.well-known/mcp.json`),
    emptyDeps(),
  );
  const serverCardJson = await handleRequest(
    new Request(`${SHARED_RELEASE_ORIGIN}/.well-known/mcp/server-card.json`),
    emptyDeps(),
  );
  expect(serverCardJson.status).toBe(200);
  expect(await serverCardJson.json()).toEqual(await mcpJson.json());
});

test("README is a human-first product README", () => {
  expect(readme).toContain(SERVER_NAME);
  expect(readme).toContain(`${SHARED_RELEASE_ORIGIN}/mcp`);
  expect(readme).toContain(SHARED_RELEASE_WIP_MARKER);
  expect(readme).toContain(CLIENT_KEY);
  expect(readme).toContain(HSM_MCP_CLIENT_KEY);
  expect(readme).not.toMatch(/plan,\s*don.?t do/i);
  expect(readme).not.toMatch(/do not implement/i);
  expect(readme).not.toMatch(/golden test/i);
  for (const tool of V1_JOBS_TOOLS) {
    expect(readme).toContain(tool.name);
  }
  expect(readme).toMatch(/how to read the answers/i);
  expect(readme).toMatch(/## Use/i);
  expect(readme).toMatch(/## Architecture/i);
  expect(readme).toMatch(/```mermaid/);
  expect(readme).toMatch(/\| `GET \/`/);
  expect(readme).toMatch(/\| `\/mcp` \|/);
  expect(readme).toMatch(/\| `\/health` \|/);
  expect(readme).toMatch(/## Local \/ private release/i);
  expect(readme).toMatch(/git clone/);
  expect(readme).toMatch(/npm run crawl/);
  expect(readme).toMatch(/npm run dev/);
  expect(readme).toContain("http://127.0.0.1:8787/mcp");
  expect(readme).toContain("docs/README-developers.md");
  expect(readme).toMatch(/get_index_status/);
  expect(readme).not.toMatch(/node --version/);
  expect(readme).not.toMatch(/open folder/i);
  expect(readme).not.toMatch(/private-release:verify/);
});

test("packaging module locks GitHub About copy", () => {
  expect(GITHUB_ABOUT).toContain("IND recognised sponsors");
  expect(GITHUB_ABOUT.length).toBeGreaterThan(40);
  expect(GITHUB_ABOUT.length).toBeLessThanOrEqual(350);
});

test("developer README documents operator loop and architecture", () => {
  expect(developerReadme).toMatch(/local \/ private release/i);
  expect(developerReadme).toContain("JOBS_INDEX_TARGET");
  expect(developerReadme).toContain("JOBS_INDEX_LOCAL_D1_STATE");
  expect(developerReadme).toContain("PRIVATE_RELEASE_ORIGIN");
  expect(developerReadme).toMatch(/npm run crawl/);
  expect(developerReadme).toMatch(/private-release:verify/);
  expect(developerReadme).toMatch(/shared-release:verify/);
  expect(developerReadme).toMatch(/503|full careers pass/i);
  expect(developerReadme).not.toMatch(/golden test/i);
  expect(developerReadme).toContain("private-release-integration.yml");
  expect(developerReadme).toMatch(/```mermaid/);
  expect(developerReadme).toMatch(/\| `GET \/`/);
  expect(developerReadme).toMatch(/\| `GET \/.well-known\/mcp\.json`/);
  expect(developerReadme).toMatch(/\| `GET \/.well-known\/mcp\/server-card\.json`/);
  expect(developerReadme).toMatch(/\| `\/mcp` \|/);
  expect(developerReadme).toMatch(/\| `\/health` \|/);
});
