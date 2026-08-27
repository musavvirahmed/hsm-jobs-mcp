import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import {
  ingestExtractionLadder,
  type BoardFeedResponse,
} from "../src/opening-ingest";
import { createFixtureRegister } from "../src/register-source";
import type { WebsiteResolutionProviders } from "../src/website-resolution";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

const ACME = { kvk: "11112222", name: "Acme Design B.V." };
const STATIC = { kvk: "33334444", name: "Static Careers B.V." };
const NOW = "2026-08-27T14:00:00Z";
const GREENHOUSE_ACME_FEED =
  "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const PRODUCT_DESIGNER_ATS = "https://boards.greenhouse.io/acme/jobs/4001001";
const PRODUCT_DESIGNER_CAREERS = "https://acme.example/jobs/product-designer";

const RECORDED_GREENHOUSE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/fixtures/greenhouse-acme-board.json"),
  "utf8",
);

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

test("Greenhouse board-seed Openings are searchable via jobs tools with source_class ats_board", async () => {
  const fetched: string[] = [];
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: ACME.kvk,
    official_website_host: "acme.example",
    now: NOW,
  });
  await index.setBoardSeed(
    {
      kvk: ACME.kvk,
      ats_family: "greenhouse",
      board_token: "acme",
      public_board_feed_url: GREENHOUSE_ACME_FEED,
    },
    NOW,
  );

  const report = await ingestExtractionLadder({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async (url) => {
      fetched.push(url);
      if (url !== GREENHOUSE_ACME_FEED) return { ok: false, status: 404 };
      return { ok: true, status: 200, body: RECORDED_GREENHOUSE };
    },
    getPage: fakeGetPage({
      "https://acme.example/jobs/product-designer": {
        bodyText: "<html><body><h1>Product Designer</h1></body></html>",
      },
      "https://acme.example/jobs/frontend-engineer": {
        bodyText: "<html><body><h1>Frontend Engineer</h1></body></html>",
      },
    }),
    now: () => NOW,
  });

  expect(report.results).toContainEqual(
    expect.objectContaining({
      kvk: ACME.kvk,
      status: "indexed",
      ats_family: "greenhouse",
      openings_written: 2,
    }),
  );
  expect(fetched).toEqual([GREENHOUSE_ACME_FEED]);

  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer", kvk: ACME.kvk },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [
      {
        title: "Product Designer",
        url: PRODUCT_DESIGNER_CAREERS,
        careers_url: PRODUCT_DESIGNER_CAREERS,
        ats_url: PRODUCT_DESIGNER_ATS,
        source_class: "ats_board",
        register_join: { name: ACME.name, kvk: ACME.kvk, strength: "exact_kvk" },
      },
    ],
  });
  const detailed = await connected.client.callTool({
    name: "get_job",
    arguments: { url: PRODUCT_DESIGNER_CAREERS },
  });
  expect(detailed.structuredContent).toMatchObject({
    found: true,
    source_class: "ats_board",
    title: "Product Designer",
  });
});

test("cautious board guess tries one host-slug token per family and negative-caches misses", async () => {
  const fetched: string[] = [];
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: ACME.kvk,
    official_website_host: "acme.example",
    now: NOW,
  });

  const pages = {
    "https://acme.example/": {
      bodyText: "<html><body><h1>Acme Design</h1><a href=\"/about\">About</a></body></html>",
    },
    "https://acme.example/careers": {
      bodyText: "<html><body><h1>Careers</h1><p>Join us.</p></body></html>",
    },
    "https://acme.example/jobs": {
      bodyText: "<html><body><h1>Jobs</h1><p>No cards yet.</p></body></html>",
    },
  };

  const first = await ingestExtractionLadder({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async (url) => {
      fetched.push(url);
      return { ok: false, status: 404 };
    },
    getPage: fakeGetPage(pages),
    now: () => NOW,
  });

  expect(first.results.some((row) => row.kvk === ACME.kvk && row.status === "no_matching_public_board")).toBe(
    true,
  );
  expect(fetched.length).toBeGreaterThan(0);
  expect(fetched.every((url) => url.includes("/acme") || url.includes(".acme."))).toBe(true);
  const afterMisses = fetched.length;

  await ingestExtractionLadder({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async (url) => {
      fetched.push(url);
      return { ok: false, status: 404 };
    },
    getPage: fakeGetPage(pages),
    now: () => "2026-08-27T15:00:00Z",
  });
  expect(fetched.length).toBe(afterMisses);

  const hit = await ingestExtractionLadder({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async (url) => {
      fetched.push(url);
      if (url === GREENHOUSE_ACME_FEED) {
        return { ok: true, status: 200, body: RECORDED_GREENHOUSE };
      }
      return { ok: false, status: 404 };
    },
    getPage: fakeGetPage({
      ...pages,
      "https://acme.example/jobs/product-designer": {
        bodyText: "<html><body><h1>Product Designer</h1></body></html>",
      },
      "https://acme.example/jobs/frontend-engineer": {
        bodyText: "<html><body><h1>Frontend Engineer</h1></body></html>",
      },
    }),
    now: () => "2026-08-27T16:00:00Z",
    // Operator invalidation clears negative cache so the same host slug can be retried.
    invalidateBoardGuessesFor: [ACME.kvk],
  });

  expect(hit.results.some((row) => row.status === "indexed" && row.ats_family === "greenhouse")).toBe(
    true,
  );
  expect(fetched.slice(afterMisses)).toContain(GREENHOUSE_ACME_FEED);

  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer", kvk: ACME.kvk },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [{ title: "Product Designer", source_class: "ats_board" }],
  });
});

test("HTML careers fallback indexes first-party job cards with source_class careers_site", async () => {
  const fetchedFeeds: string[] = [];
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: STATIC.kvk,
    official_website_host: "static.example",
    now: NOW,
  });

  const jobUrl = "https://static.example/jobs/ux-designer";
  const pages: Record<string, FakePage> = {
    "https://static.example/robots.txt": {
      bodyText: "User-agent: *\nDisallow: /jobs\nDisallow: /admin\n",
    },
    "https://static.example/": {
      bodyText: "<html><body><h1>Static Careers</h1><a href=\"/jobs\">Jobs</a></body></html>",
    },
    "https://static.example/jobs": {
      bodyText: `<html><body>
        <h1>Open roles</h1>
        <a href="/jobs/ux-designer">UX Designer</a>
        <a href="https://www.linkedin.com/jobs/view/123">LinkedIn listing</a>
        <a href="https://indeed.com/viewjob?jk=abc">Indeed</a>
      </body></html>`,
    },
    [jobUrl]: {
      bodyText:
        "<html><head><title>UX Designer</title></head><body><h1>UX Designer</h1><p>Amsterdam. Build delightful UX.</p></body></html>",
    },
  };

  await ingestExtractionLadder({
    register: createFixtureRegister([STATIC], "2026-08-03"),
    index,
    fetchBoardFeed: async (url) => {
      fetchedFeeds.push(url);
      return { ok: false, status: 404 };
    },
    getPage: fakeGetPage(pages),
    now: () => NOW,
  });

  expect(await index.getTerminalOutcome(STATIC.kvk)).toMatchObject({
    outcome: "openings_indexed",
    official_website_host: "static.example",
  });

  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "ux designer", kvk: STATIC.kvk },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [
      {
        title: "UX Designer",
        url: jobUrl,
        careers_url: jobUrl,
        source_class: "careers_site",
        register_join: { name: STATIC.name, kvk: STATIC.kvk, strength: "exact_kvk" },
      },
    ],
  });
  const payload = searched.structuredContent as {
    openings: Array<{ url: string; ats_url: string | null }>;
  };
  expect(payload.openings[0]?.ats_url == null).toBe(true);
  expect(JSON.stringify(searched.structuredContent)).not.toMatch(/linkedin\.com|indeed\.com/i);

  const detailed = await connected.client.callTool({
    name: "get_job",
    arguments: { url: jobUrl },
  });
  expect(detailed.structuredContent).toMatchObject({
    found: true,
    source_class: "careers_site",
    title: "UX Designer",
  });
  expect(fetchedFeeds.length).toBeGreaterThan(0);
});

test("robots soft-ignore allows job-like Disallows but keeps unrelated Disallows", async () => {
  const requested: string[] = [];
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: STATIC.kvk,
    official_website_host: "static.example",
    now: NOW,
  });

  await ingestExtractionLadder({
    register: createFixtureRegister([STATIC], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    getPage: async (url) => {
      requested.push(url);
      if (url === "https://static.example/robots.txt") {
        return {
          status: 200,
          finalUrl: url,
          tlsValid: true,
          bodyText: "User-agent: *\nDisallow: /jobs\nDisallow: /secret\n",
        };
      }
      if (url === "https://static.example/jobs") {
        return {
          status: 200,
          finalUrl: url,
          tlsValid: true,
          bodyText:
            '<html><body><a href="/jobs/ux-designer">UX Designer</a><a href="/secret/page">Secret</a></body></html>',
        };
      }
      if (url === "https://static.example/jobs/ux-designer") {
        return {
          status: 200,
          finalUrl: url,
          tlsValid: true,
          bodyText: "<html><body><h1>UX Designer</h1></body></html>",
        };
      }
      if (url.includes("/secret")) {
        throw new Error(`should not fetch unrelated Disallow path: ${url}`);
      }
      return {
        status: 200,
        finalUrl: url,
        tlsValid: true,
        bodyText: "<html><body><h1>Static Careers</h1></body></html>",
      };
    },
    now: () => NOW,
  });

  expect(requested).toContain("https://static.example/jobs");
  expect(requested).toContain("https://static.example/jobs/ux-designer");
  expect(requested.some((url) => url.includes("/secret"))).toBe(false);

  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: STATIC.kvk },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [{ title: "UX Designer", source_class: "careers_site" }],
  });
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
    { name: "test-harness", version: "1.0.0" },
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
