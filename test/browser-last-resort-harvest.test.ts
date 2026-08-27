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
} from "../src/opening-ingest";
import { createFixtureRegister } from "../src/register-source";
import type { WebsiteResolutionProviders } from "../src/website-resolution";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

const ACME = { kvk: "11112222", name: "Acme Design B.V." };
const SPA = { kvk: "55556666", name: "Spa Careers B.V." };
const NOW = "2026-08-27T22:00:00Z";
const GREENHOUSE_ACME_FEED =
  "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const RECORDED_GREENHOUSE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/fixtures/greenhouse-acme-board.json"),
  "utf8",
);

const JS_SHELL =
  '<html><head><title>Careers</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const RENDERED_LISTING =
  '<html><body><h1>Open roles</h1><a href="/jobs/ux-designer">UX Designer</a></body></html>';
const RENDERED_JOB =
  "<html><body><h1>UX Designer</h1><p>Hybrid Amsterdam</p></body></html>";

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

test("browser harvest runs after HTTP HTML is empty and indexes Openings via jobs tools", async () => {
  const browserCalls: string[] = [];
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: SPA.kvk,
    official_website_host: "spa.example",
    now: NOW,
  });

  const report = await ingestExtractionLadder({
    register: createFixtureRegister([SPA], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    getPage: fakeGetPage({
      "https://spa.example/jobs": { bodyText: JS_SHELL },
    }),
    getBrowserPage: async (url) => {
      browserCalls.push(url);
      if (url === "https://spa.example/jobs") {
        return pageResult(url, RENDERED_LISTING);
      }
      if (url === "https://spa.example/jobs/ux-designer") {
        return pageResult(url, RENDERED_JOB);
      }
      return null;
    },
    now: () => NOW,
  });

  expect(report.results[0]).toMatchObject({
    kvk: SPA.kvk,
    status: "indexed",
    via: "browser_harvest",
    openings_written: 1,
  });
  expect(browserCalls.length).toBeGreaterThan(0);

  const jobUrl = "https://spa.example/jobs/ux-designer";
  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "ux designer", kvk: SPA.kvk },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [
      {
        title: "UX Designer",
        url: jobUrl,
        careers_url: jobUrl,
        source_class: "careers_site",
        register_join: { name: SPA.name, kvk: SPA.kvk, strength: "exact_kvk" },
      },
    ],
  });

  const detailed = await connected.client.callTool({
    name: "get_job",
    arguments: { url: jobUrl },
  });
  expect(detailed.structuredContent).toMatchObject({
    found: true,
    source_class: "careers_site",
    title: "UX Designer",
  });
});

test("browser harvest is not invoked when a public board feed already indexed Openings", async () => {
  const browserCalls: string[] = [];
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
      if (url !== GREENHOUSE_ACME_FEED) return { ok: false, status: 404 };
      return { ok: true, status: 200, body: RECORDED_GREENHOUSE };
    },
    getPage: fakeGetPage({
      "https://acme.example/jobs/product-designer": {
        bodyText: "<html><body><h1>Product Designer</h1></body></html>",
      },
    }),
    getBrowserPage: async (url) => {
      browserCalls.push(url);
      return pageResult(url, RENDERED_LISTING);
    },
    now: () => NOW,
  });

  expect(report.results[0]).toMatchObject({ via: "board_seed", status: "indexed" });
  expect(browserCalls).toEqual([]);
});

test("browser harvest is not invoked when HTTP HTML careers extraction already produced Openings", async () => {
  const browserCalls: string[] = [];
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: SPA.kvk,
    official_website_host: "spa.example",
    now: NOW,
  });

  const report = await ingestExtractionLadder({
    register: createFixtureRegister([SPA], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    getPage: fakeGetPage({
      "https://spa.example/jobs": { bodyText: RENDERED_LISTING },
      "https://spa.example/jobs/ux-designer": { bodyText: RENDERED_JOB },
    }),
    getBrowserPage: async (url) => {
      browserCalls.push(url);
      return pageResult(url, RENDERED_LISTING);
    },
    now: () => NOW,
  });

  expect(report.results[0]).toMatchObject({ via: "html_careers", openings_written: 1 });
  expect(browserCalls).toEqual([]);
});

test("js shell with empty browser harvest records unsupported_extractor honestly", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: SPA.kvk,
    official_website_host: "spa.example",
    now: NOW,
  });

  const report = await ingestExtractionLadder({
    register: createFixtureRegister([SPA], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    getPage: fakeGetPage({
      "https://spa.example/jobs": { bodyText: JS_SHELL },
    }),
    getBrowserPage: async (url) => pageResult(url, JS_SHELL),
    now: () => NOW,
  });

  expect(report.results[0]).toMatchObject({
    status: "unsupported_extractor",
    openings_written: 0,
    via: null,
  });
  expect(await index.getTerminalOutcome(SPA.kvk)).toMatchObject({
    outcome: "unsupported_extractor",
    official_website_host: "spa.example",
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

function pageResult(
  url: string,
  bodyText: string,
): NonNullable<Awaited<ReturnType<WebsiteResolutionProviders["getPage"]>>> {
  return {
    status: 200,
    finalUrl: url,
    tlsValid: true,
    bodyText,
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
