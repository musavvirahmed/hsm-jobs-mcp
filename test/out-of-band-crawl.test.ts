import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import {
  DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD,
  runOutOfBandCrawl,
  type CrawlAlert,
} from "../src/out-of-band-crawl";
import {
  ingestFromBoardSeeds,
  ingestWebsiteResolutions,
  RENTMAN_ASHBY_BOARD_SEED,
  type BoardFeedResponse,
  type WebsiteResolutionProviders,
} from "../src/opening-ingest";
import { createFixtureRegister } from "../src/register-source";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

const RENTMAN = { kvk: "60733144", name: "Rentman B.V." };
const ACME = { kvk: "12345678", name: "Acme B.V." };
const NOW = "2026-08-27T12:00:00Z";
const LATER = "2026-08-28T04:00:00Z";
const ASHBY_RENTMAN_FEED_URL =
  "https://api.ashbyhq.com/posting-api/job-board/rentman?includeCompensation=true";
const PRODUCT_DESIGNER_ID = "86561042-c8f9-4a2c-9d93-c51ba421e6e7";
const RENTMAN_PRODUCT_DESIGNER_URL = "https://rentman.io/jobs/product-designer";
const RENTMAN_HOME = "<html><body><h1>Rentman</h1><p>Event rental software.</p></body></html>";
const PRODUCT_DESIGNER_CAREERS =
  "<html><head><title>Product Designer</title></head><body><h1>Product Designer</h1><p>Utrecht</p></body></html>";

const RECORDED_ASHBY_FEED = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/fixtures/ashby-rentman-board.json"),
  "utf8",
);

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

type FakePage = {
  status?: number;
  redirectTo?: string;
  tlsValid?: boolean;
  bodyText?: string;
};

let connected: Connected | undefined;

afterEach(async () => {
  if (connected) {
    await connected.close();
    connected = undefined;
  }
});

test("out-of-band daily refresh updates crawl freshness via get_index_status without scrape-inside-tool", async () => {
  const { index } = await seedRentmanBoard();
  const fetched: string[] = [];

  const report = await runOutOfBandCrawl({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: recordedAshbyFeed(fetched),
    providers: rentmanProviders(),
    now: () => LATER,
  });

  expect(report.re_partialed).toBe(false);
  expect(fetched).toEqual([ASHBY_RENTMAN_FEED_URL]);

  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    jobs_count: 2,
    stale: false,
    last_successful_crawl: LATER,
    index_scope: {
      pass: "full_careers_pass",
      register_size: 1,
      register_as_of: "2026-08-03",
      omissions_possible: false,
    },
  });

  const tools = await connected.client.listTools();
  expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
    "get_index_status",
    "get_job",
    "search_jobs",
  ]);
  await expect(
    connected.client.callTool({ name: "ingest_jobs", arguments: {} }),
  ).rejects.toThrow(/ingest_jobs not found/);
});

test("successful authoritative refresh drops Openings absent from the feed; failed fetch does not", async () => {
  const { index } = await seedRentmanBoard();

  await runOutOfBandCrawl({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: true, status: 200, body: productDesignerOnlyFeed() }),
    providers: rentmanProviders(),
    now: () => LATER,
  });

  connected = await connectIndex(index);
  const afterSuccess = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  expect(afterSuccess.structuredContent).toMatchObject({
    openings: [{ title: "Product Designer", url: RENTMAN_PRODUCT_DESIGNER_URL }],
  });

  await runOutOfBandCrawl({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 500 }),
    providers: rentmanProviders(),
    now: () => "2026-08-28T05:00:00Z",
  });

  const afterFail = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  expect(afterFail.structuredContent).toMatchObject({
    openings: [{ title: "Product Designer" }],
  });
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({ last_successful_crawl: LATER });
});

test("register refresh with a new KvK forces partial and attempts the missing terminal careers outcome", async () => {
  const { index } = await seedRentmanBoard();
  await index.setPass("full_careers_pass");
  expect((await index.snapshot()).index_scope.pass).toBe("full_careers_pass");

  const report = await runOutOfBandCrawl({
    register: createFixtureRegister([RENTMAN, ACME], "2026-09-01"),
    index,
    fetchBoardFeed: recordedAshbyFeed([]),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: async () => null,
    },
    now: () => LATER,
  });

  expect(report.re_partialed).toBe(true);
  expect(report.missing_terminal_outcomes_before).toBe(1);
  expect(await index.getTerminalOutcome(ACME.kvk)).toMatchObject({
    kvk: ACME.kvk,
    outcome: "unresolved_website",
  });

  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    last_successful_crawl: LATER,
    index_scope: {
      pass: "full_careers_pass",
      omissions_possible: false,
      register_size: 2,
      register_as_of: "2026-09-01",
    },
  });
});

test("repeated crawl failure fires the alert hook once the threshold is reached", async () => {
  const { index } = await seedRentmanBoard();
  const alerts: CrawlAlert[] = [];

  const first = await runOutOfBandCrawl({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 503 }),
    providers: rentmanProviders(),
    now: () => LATER,
    alert: async (alert) => {
      alerts.push(alert);
    },
    failureAlertThreshold: DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD,
  });
  expect(first.crawl_failure_streak).toBe(1);
  expect(alerts).toEqual([]);

  const second = await runOutOfBandCrawl({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 503 }),
    providers: rentmanProviders(),
    now: () => "2026-08-28T05:00:00Z",
    alert: async (alert) => {
      alerts.push(alert);
    },
    failureAlertThreshold: DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD,
  });
  expect(second.crawl_failure_streak).toBe(2);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatchObject({
    kind: "repeated_crawl_failure",
    consecutive_failures: 2,
  });
  expect(alerts[0]?.message).toMatch(/crawl failure/i);

  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    jobs_count: 2,
    last_successful_crawl: NOW,
  });
});

test("out-of-band crawl reports register, board, and website progress", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.setBoardSeed(RENTMAN_ASHBY_BOARD_SEED, NOW);
  const progress: string[] = [];

  await runOutOfBandCrawl({
    register: createFixtureRegister([RENTMAN, ACME], "2026-08-03"),
    index,
    fetchBoardFeed: recordedAshbyFeed([]),
    providers: rentmanProviders(),
    now: () => LATER,
    onProgress: (message) => progress.push(message),
  });

  expect(progress.some((line) => /register loaded: 2 sponsors/.test(line))).toBe(true);
  expect(progress.some((line) => /board refresh/.test(line))).toBe(true);
  expect(progress.some((line) => /website \d+\/\d+/.test(line))).toBe(true);
});

async function seedRentmanBoard() {
  const index = createEmptyWritableJobsIndex();
  const getPage = fakeGetPage(rentmanPages());
  await ingestWebsiteResolutions({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    providers: { wikidata: { websiteForKvk: async () => null }, getPage },
    now: () => NOW,
  });
  await index.setBoardSeed(RENTMAN_ASHBY_BOARD_SEED, NOW);
  await ingestFromBoardSeeds({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: recordedAshbyFeed([]),
    getPage,
    now: () => NOW,
  });
  return { index };
}

function rentmanProviders(): WebsiteResolutionProviders {
  return {
    wikidata: { websiteForKvk: async () => null },
    getPage: fakeGetPage(rentmanPages()),
  };
}

function recordedAshbyFeed(fetched: string[]) {
  return async (url: string): Promise<BoardFeedResponse> => {
    fetched.push(url);
    if (url !== ASHBY_RENTMAN_FEED_URL) return { ok: false, status: 404 };
    return { ok: true, status: 200, body: RECORDED_ASHBY_FEED };
  };
}

function productDesignerOnlyFeed(): string {
  const payload = JSON.parse(RECORDED_ASHBY_FEED) as { jobs: unknown[] };
  payload.jobs = payload.jobs.filter(
    (job) =>
      typeof job === "object" && job !== null && (job as { id?: string }).id === PRODUCT_DESIGNER_ID,
  );
  return JSON.stringify(payload);
}

function rentmanPages(): Record<string, FakePage> {
  return {
    "https://rentman.nl/": { redirectTo: "https://rentman.io/nl" },
    "https://rentman.nl": { redirectTo: "https://rentman.io/nl" },
    "https://rentman.io/nl": { bodyText: RENTMAN_HOME },
    "https://rentman.io/": { bodyText: RENTMAN_HOME },
    "https://rentman.io": { bodyText: RENTMAN_HOME },
    "https://rentman.com/": { tlsValid: false },
    "https://rentman.com": { tlsValid: false },
    "https://rentman.io/jobs/product-designer": { bodyText: PRODUCT_DESIGNER_CAREERS },
    "https://rentman.io/jobs/product-designer/": { bodyText: PRODUCT_DESIGNER_CAREERS },
  };
}

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
