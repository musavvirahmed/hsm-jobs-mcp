import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { handleRequest } from "../src/http";
import { runFullCareersPass } from "../src/full-careers-pass";
import { createJobsMcpServer } from "../src/mcp-server";
import { createFixtureRegister } from "../src/register-source";
import type { WebsiteResolutionProviders } from "../src/website-resolution";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

const ACME = { kvk: "12345678", name: "Acme B.V." };
const BETA = { kvk: "87654321", name: "Beta B.V." };
const NOW = "2026-08-27T18:00:00Z";

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

let connected: Connected | undefined;

afterEach(async () => {
  if (connected) {
    await connected.close();
    connected = undefined;
  }
});

test("full careers pass runner records a terminal outcome for every register KvK and unlocks full_careers_pass", async () => {
  const index = createEmptyWritableJobsIndex();

  const report = await runFullCareersPass({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: async () => null,
    },
    now: () => NOW,
  });

  expect(report.pass).toBe("full_careers_pass");
  expect(await index.getTerminalOutcome(ACME.kvk)).toMatchObject({
    kvk: ACME.kvk,
    outcome: "unresolved_website",
  });

  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    coverage_note:
      "Jobs index has completed a full careers pass; empty results are relevance misses, not a coverage gap.",
    index_scope: {
      pass: "full_careers_pass",
      omissions_possible: false,
      register_size: 1,
      register_as_of: "2026-08-03",
    },
  });

  const emptySearch = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer" },
  });
  expect(emptySearch.structuredContent).toMatchObject({
    openings: [],
    index_scope: { pass: "full_careers_pass", omissions_possible: false },
  });
  const miss = await connected.client.callTool({
    name: "get_job",
    arguments: { url: "https://missing.example/jobs/none" },
  });
  expect(miss.structuredContent).toMatchObject({
    found: false,
    index_scope: { pass: "full_careers_pass", omissions_possible: false },
  });
});

test("full pass keeps a stored official website and climbs the ladder instead of re-unresolving", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: ACME.kvk,
    official_website_host: "acme.example",
    now: NOW,
  });

  const report = await runFullCareersPass({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: fakeGetPage({
        "https://acme.example/jobs": {
          bodyText:
            '<html><body><h1>Jobs</h1><a href="/jobs/product-designer">Product Designer</a></body></html>',
        },
        "https://acme.example/jobs/product-designer": {
          bodyText: "<html><body><h1>Product Designer</h1><p>Amsterdam</p></body></html>",
        },
      }),
    },
    now: () => NOW,
  });

  expect(await index.getOfficialWebsite(ACME.kvk)).toBe("acme.example");
  expect(await index.getTerminalOutcome(ACME.kvk)).toMatchObject({ outcome: "openings_indexed" });
  expect(report.pass).toBe("full_careers_pass");

  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: ACME.kvk },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [{ title: "Product Designer", source_class: "careers_site" }],
    index_scope: { pass: "full_careers_pass", omissions_possible: false },
  });
});

test("an incomplete pass leaves status partial so shared release stays out of policy", async () => {
  const index = createEmptyWritableJobsIndex();

  const report = await runFullCareersPass({
    register: createFixtureRegister([ACME, BETA], "2026-09-01"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: async () => null,
    },
    now: () => NOW,
    maxAttempts: 1,
  });

  expect(report.re_partialed).toBe(true);
  expect(report.pass).toBe("partial");
  expect(report.attempted).toBe(1);
  expect(report.missing_terminal_outcomes_after).toBe(1);

  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    index_scope: {
      pass: "partial",
      omissions_possible: true,
      register_size: 2,
      register_as_of: "2026-09-01",
    },
  });
});

test("catching up remaining KvKs after a register gap restores full_careers_pass", async () => {
  const index = createEmptyWritableJobsIndex();
  const providers = {
    wikidata: { websiteForKvk: async () => null },
    getPage: async () => null,
  };

  await runFullCareersPass({
    register: createFixtureRegister([ACME, BETA], "2026-09-01"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers,
    now: () => NOW,
    maxAttempts: 1,
  });
  expect((await index.snapshot()).index_scope.pass).toBe("partial");

  const caught = await runFullCareersPass({
    register: createFixtureRegister([ACME, BETA], "2026-09-01"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers,
    now: () => NOW,
  });
  expect(caught.pass).toBe("full_careers_pass");
  expect(caught.missing_terminal_outcomes_after).toBe(0);

  connected = await connectIndex(index);
  const emptySearch = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: BETA.kvk },
  });
  expect(emptySearch.structuredContent).toMatchObject({
    openings: [],
    index_scope: { pass: "full_careers_pass", omissions_possible: false },
  });
});

const BLOCKED = { kvk: "11111111", name: "Blocked B.V." };
const NO_CAREERS = { kvk: "22222222", name: "No Careers B.V." };
const SPA = { kvk: "33333333", name: "Spa Shell B.V." };
const QUIET = { kvk: "44444444", name: "Quiet Board B.V." };

test("full pass records blocked, no_careers_site, unsupported_extractor, and no_matching_public_board distinctly", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.setWebsiteOverride(BLOCKED.kvk, { mode: "pin", host: "blocked.example" }, NOW);
  await index.setWebsiteOverride(NO_CAREERS.kvk, { mode: "pin", host: "nocareers.example" }, NOW);
  await index.setWebsiteOverride(SPA.kvk, { mode: "pin", host: "spa.example" }, NOW);
  await index.setWebsiteOverride(QUIET.kvk, { mode: "pin", host: "quiet.example" }, NOW);

  const pages: Record<string, FakePage> = {
    "https://blocked.example/": { status: 403 },
    "https://blocked.example/jobs": { status: 403 },
    "https://blocked.example/careers": { status: 403 },
    "https://nocareers.example/": {
      bodyText: "<html><body><h1>No Careers B.V.</h1><p>Software.</p></body></html>",
    },
    "https://spa.example/": {
      bodyText: "<html><body><h1>Spa Shell B.V.</h1></body></html>",
    },
    "https://spa.example/jobs": {
      bodyText:
        '<html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
    },
    "https://quiet.example/": {
      bodyText: "<html><body><h1>Quiet Board B.V.</h1></body></html>",
    },
    "https://quiet.example/jobs": {
      bodyText: "<html><body><h1>Jobs</h1><p>No cards yet.</p></body></html>",
    },
    "https://quiet.example/careers": {
      bodyText: "<html><body><h1>Careers</h1><p>Join us.</p></body></html>",
    },
  };

  const report = await runFullCareersPass({
    register: createFixtureRegister([BLOCKED, NO_CAREERS, SPA, QUIET], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: fakeGetPage(pages),
    },
    now: () => NOW,
  });

  expect(report.pass).toBe("full_careers_pass");
  expect(await index.getTerminalOutcome(BLOCKED.kvk)).toMatchObject({ outcome: "blocked" });
  expect(await index.getTerminalOutcome(NO_CAREERS.kvk)).toMatchObject({
    outcome: "no_careers_site",
  });
  expect(await index.getTerminalOutcome(SPA.kvk)).toMatchObject({
    outcome: "unsupported_extractor",
  });
  expect(await index.getTerminalOutcome(QUIET.kvk)).toMatchObject({
    outcome: "no_matching_public_board",
  });

  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    index_scope: {
      pass: "full_careers_pass",
      omissions_possible: false,
      sponsors_attempted: 4,
      sponsors_with_openings: 0,
    },
  });
});

test("shared-release host serves /mcp after a completed full careers pass", async () => {
  const index = createEmptyWritableJobsIndex();
  await runFullCareersPass({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: async () => null,
    },
    now: () => NOW,
  });

  const health = await handleRequest(new Request("https://hsmjobs.musavvir.work/health"), {
    jobsIndex: index,
    hsmMcp: createStubHsmMcp(),
  });
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: "stale" });

  const mcp = await handleRequest(
    new Request("https://hsmjobs.musavvir.work/mcp", {
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
    { jobsIndex: index, hsmMcp: createStubHsmMcp() },
  );
  expect(mcp.ok).toBe(true);
});

type FakePage = {
  status?: number;
  redirectTo?: string;
  tlsValid?: boolean;
  bodyText?: string;
};

function fakeGetPage(pages: Record<string, FakePage>): WebsiteResolutionProviders["getPage"] {
  return async (url) => {
    let current = url;
    const seen = new Set<string>();
    for (let hop = 0; hop < 10; hop += 1) {
      if (seen.has(current)) return null;
      seen.add(current);
      const page = pages[current] ?? pages[stripSlash(current)] ?? pages[withSlash(current)];
      if (!page) return null;
      if (page.tlsValid === false) {
        return { status: 0, finalUrl: current, tlsValid: false, bodyText: "" };
      }
      if (page.redirectTo) {
        current = page.redirectTo;
        continue;
      }
      return {
        status: page.status ?? 200,
        finalUrl: current,
        tlsValid: true,
        bodyText: page.bodyText ?? "",
      };
    }
    return null;
  };
}

function stripSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

async function connectIndex(
  index: ReturnType<typeof createEmptyWritableJobsIndex>,
): Promise<Connected> {
  const handler = createMcpHandler(() =>
    createJobsMcpServer({ jobsIndex: index, hsmMcp: createStubHsmMcp() }),
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: "test-harness", version: "0.0.1" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
