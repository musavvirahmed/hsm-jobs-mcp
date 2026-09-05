import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createAshbyBoardFeedFetcher } from "../src/ashby-board";
import { RENTMAN_PRODUCT_DESIGNER_URL } from "../src/fixtures/jobs-index";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import {
  ingestFromBoardSeeds,
  ingestWebsiteResolutions,
  RENTMAN_ASHBY_BOARD_SEED,
  type BoardFeedResponse,
} from "../src/opening-ingest";
import { createFixtureRegister } from "../src/register-source";
import { createHttpsPageGetter, type WebsiteResolutionProviders } from "../src/website-resolution";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

const RENTMAN = { kvk: "60733144", name: "Rentman B.V." };
const NOW = "2026-08-27T12:00:00Z";
const ASHBY_RENTMAN_FEED_URL =
  "https://api.ashbyhq.com/posting-api/job-board/rentman?includeCompensation=true";
const PRODUCT_DESIGNER_ATS_URL =
  "https://jobs.ashbyhq.com/rentman/86561042-c8f9-4a2c-9d93-c51ba421e6e7";
const PRODUCT_DESIGNER_ID = "86561042-c8f9-4a2c-9d93-c51ba421e6e7";
const HEAD_OF_PM_ATS_URL = "https://jobs.ashbyhq.com/rentman/eea66737-f02b-4bbe-97b4-6e34d3c281a9";

const RECORDED_ASHBY_FEED = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/fixtures/ashby-rentman-board.json"),
  "utf8",
);

const RENTMAN_HOME = "<html><body><h1>Rentman</h1><p>Event rental software.</p></body></html>";
const PRODUCT_DESIGNER_CAREERS =
  "<html><head><title>Product Designer</title></head><body><h1>Product Designer</h1><p>Utrecht</p></body></html>";

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

test("golden: board-seed Ashby rentman ingest returns the Product Designer careers URL via jobs tools", async () => {
  const fetched: string[] = [];
  const { index } = await ingestRentmanGoldenPath({ fetchBoardFeed: recordedAshbyFeed(fetched) });

  expect(fetched).toEqual([ASHBY_RENTMAN_FEED_URL]);
  expect(await index.getOfficialWebsite("60733144")).toBe("rentman.io");
  expect(await index.getTerminalOutcome("60733144")).toMatchObject({
    kvk: "60733144",
    outcome: "openings_indexed",
    official_website_host: "rentman.io",
  });

  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer" },
  });
  expect(searched.isError).toBeFalsy();
  expect(searched.structuredContent).toMatchObject({
    openings: [
      {
        title: "Product Designer",
        url: RENTMAN_PRODUCT_DESIGNER_URL,
        location: "Utrecht",
        careers_url: RENTMAN_PRODUCT_DESIGNER_URL,
        ats_url: PRODUCT_DESIGNER_ATS_URL,
        register_join: { name: "Rentman B.V.", kvk: "60733144", strength: "exact_kvk" },
        source_class: "ats_board",
        honesty_salary: "unknown",
        honesty_dutch_required: "unknown",
        honesty_sponsorship_willingness: "unknown",
      },
    ],
    index_scope: {
      pass: "partial",
      sponsors_with_openings: 1,
      register_size: 1,
      register_as_of: "2026-08-03",
      omissions_possible: true,
    },
  });
  expect(JSON.stringify(searched.structuredContent)).not.toMatch(/jd_extract|jd_body|description/);

  const detailed = await connected.client.callTool({
    name: "get_job",
    arguments: { url: RENTMAN_PRODUCT_DESIGNER_URL },
  });
  expect(detailed.structuredContent).toMatchObject({
    found: true,
    url: RENTMAN_PRODUCT_DESIGNER_URL,
    title: "Product Designer",
    register_join: { name: "Rentman B.V.", kvk: "60733144", strength: "exact_kvk" },
    source_class: "ats_board",
  });
  const detailPayload = detailed.structuredContent as { jd_extract: string | null };
  expect(detailPayload.jd_extract).toMatch(/Competitive salary based on experience/);

  const byKvk = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  const kvkPayload = byKvk.structuredContent as { openings: Array<{ url: string; title: string }> };
  expect(kvkPayload.openings.map((opening) => opening.title).sort()).toEqual([
    "Head of Product Marketing",
    "Product Designer",
  ]);
  expect(kvkPayload.openings.find((opening) => opening.title === "Product Designer")?.url).toBe(
    RENTMAN_PRODUCT_DESIGNER_URL,
  );

  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    jobs_count: 2,
    stale: false,
    last_successful_crawl: NOW,
    source_policy: "first-party careers/ATS only",
    index_scope: { sponsors_attempted: 1, sponsors_with_openings: 1 },
  });

  expect(fetched).toEqual([ASHBY_RENTMAN_FEED_URL]);
});

test("Opening identity is ATS family, board token, and posting id", async () => {
  const { index } = await ingestRentmanGoldenPath();
  const openings = await index.listOpeningsByBoard("ashby", "rentman");
  const productDesigner = openings.find((opening) => opening.title === "Product Designer");
  expect(productDesigner).toMatchObject({
    identity: `ashby:rentman:${PRODUCT_DESIGNER_ID}`,
    ats_family: "ashby",
    board_token: "rentman",
    posting_id: PRODUCT_DESIGNER_ID,
  });
  const seeds = await index.listBoardSeeds();
  expect(seeds).toEqual([RENTMAN_ASHBY_BOARD_SEED]);
});

test("primary link falls back to the ATS URL when the careers URL does not resolve", async () => {
  const pages = rentmanPages();
  delete pages["https://rentman.io/jobs/product-designer"];
  delete pages["https://rentman.io/jobs/product-designer/"];
  pages["https://rentman.io/jobs/product-designer"] = { status: 404, bodyText: "Not found" };

  const { index } = await ingestRentmanGoldenPath({ getPage: fakeGetPage(pages) });
  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer" },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [{ title: "Product Designer", url: PRODUCT_DESIGNER_ATS_URL, ats_url: PRODUCT_DESIGNER_ATS_URL }],
  });
  expect(JSON.stringify(searched.structuredContent)).not.toMatch(/rentman\.io\/jobs\/product-designer/);
});

test("a successful authoritative fetch drops Openings absent from the feed", async () => {
  const { index } = await ingestRentmanGoldenPath();
  await ingestFromBoardSeeds({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: true, status: 200, body: productDesignerOnlyFeed() }),
    getPage: fakeGetPage(rentmanPages()),
    now: () => NOW,
  });

  connected = await connectIndex(index);
  const byKvk = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  expect(byKvk.structuredContent).toMatchObject({
    openings: [{ title: "Product Designer", url: RENTMAN_PRODUCT_DESIGNER_URL }],
  });
  const missing = await connected.client.callTool({
    name: "get_job",
    arguments: { url: HEAD_OF_PM_ATS_URL },
  });
  expect(missing.structuredContent).toMatchObject({ found: false });
  expect((await index.listOpeningsByBoard("ashby", "rentman")).map((row) => row.posting_id)).toEqual([
    PRODUCT_DESIGNER_ID,
  ]);
});

test("reingesting a known posting reuses the stored careers URL and does not re-probe the page", async () => {
  const { index } = await ingestRentmanGoldenPath();
  const probed: string[] = [];
  const inner = fakeGetPage(rentmanPages());
  await ingestFromBoardSeeds({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: recordedAshbyFeed([]),
    getPage: async (url) => {
      probed.push(url);
      return inner(url);
    },
    now: () => "2026-08-28T00:00:00Z",
  });
  expect(probed.some((url) => url.includes("/jobs/product-designer"))).toBe(false);
  expect(probed.some((url) => url.includes("/jobs/head-of-product-marketing"))).toBe(false);
});

test("a failed board fetch does not clear known Openings", async () => {
  const { index } = await ingestRentmanGoldenPath();
  const failed = await ingestFromBoardSeeds({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 500 }),
    getPage: fakeGetPage(rentmanPages()),
    now: () => "2026-08-27T13:00:00Z",
  });
  expect(failed.results[0]).toMatchObject({ status: "fetch_failed", openings_removed: 0 });

  connected = await connectIndex(index);
  const byKvk = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  const titles = (
    byKvk.structuredContent as { openings: Array<{ title: string }> }
  ).openings.map((opening) => opening.title);
  expect(titles.sort()).toEqual(["Head of Product Marketing", "Product Designer"]);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    jobs_count: 2,
    last_successful_crawl: NOW,
  });
});

test("index-time register join stays unmatched without inventing a KvK when the seed KvK is off-register", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.recordWebsiteResolution({
    kvk: "60733144",
    official_website_host: "rentman.io",
    now: NOW,
  });
  await ingestFromBoardSeeds({
    register: createFixtureRegister([], "2026-08-03"),
    index,
    fetchBoardFeed: recordedAshbyFeed([]),
    getPage: fakeGetPage(rentmanPages()),
    now: () => NOW,
  });
  connected = await connectIndex(index);
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer" },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [
      {
        title: "Product Designer",
        url: RENTMAN_PRODUCT_DESIGNER_URL,
        register_join: { name: null, kvk: null, strength: "unmatched" },
      },
    ],
  });
});

test("jobs tools stay read-only and do not fetch the public board feed on ask", async () => {
  const fetched: string[] = [];
  const { index } = await ingestRentmanGoldenPath({ fetchBoardFeed: recordedAshbyFeed(fetched) });
  expect(fetched).toHaveLength(1);

  connected = await connectIndex(index);
  const listed = await connected.client.listTools();
  expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
    "get_index_status",
    "get_job",
    "search_jobs",
  ]);
  await expect(
    connected.client.callTool({ name: "ingest_jobs", arguments: {} }),
  ).rejects.toThrow(/ingest_jobs not found/);
  await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer" },
  });
  await connected.client.callTool({
    name: "get_job",
    arguments: { url: RENTMAN_PRODUCT_DESIGNER_URL },
  });
  expect(fetched).toEqual([ASHBY_RENTMAN_FEED_URL]);
});

test.skipIf(process.env.LIVE_ASHBY !== "1")(
  "optional live Ashby rentman ingest returns a URL for the Product Designer posting",
  async () => {
    const index = createEmptyWritableJobsIndex();
    await ingestWebsiteResolutions({
      register: createFixtureRegister([RENTMAN], "2026-08-03"),
      index,
      providers: {
        wikidata: { websiteForKvk: async () => null },
        getPage: createHttpsPageGetter(fetch),
      },
      now: () => NOW,
    });
    await index.setBoardSeed(RENTMAN_ASHBY_BOARD_SEED, NOW);
    await ingestFromBoardSeeds({
      register: createFixtureRegister([RENTMAN], "2026-08-03"),
      index,
      fetchBoardFeed: createAshbyBoardFeedFetcher(fetch),
      getPage: createHttpsPageGetter(fetch),
      now: () => NOW,
    });
    connected = await connectIndex(index);
    const searched = await connected.client.callTool({
      name: "search_jobs",
      arguments: { query: "product designer", kvk: "60733144" },
    });
    const urls = (searched.structuredContent as { openings: Array<{ url: string }> }).openings.map(
      (opening) => opening.url,
    );
    expect(urls).toContain(RENTMAN_PRODUCT_DESIGNER_URL);
  },
);

type FakePage = {
  status?: number;
  redirectTo?: string;
  tlsValid?: boolean;
  bodyText?: string;
};

async function ingestRentmanGoldenPath(opts?: {
  fetchBoardFeed?: (url: string) => Promise<BoardFeedResponse>;
  getPage?: WebsiteResolutionProviders["getPage"];
}) {
  const index = createEmptyWritableJobsIndex();
  const getPage = opts?.getPage ?? fakeGetPage(rentmanPages());
  await ingestWebsiteResolutions({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage,
    },
    now: () => NOW,
  });
  await index.setBoardSeed(RENTMAN_ASHBY_BOARD_SEED, NOW);
  await ingestFromBoardSeeds({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    fetchBoardFeed: opts?.fetchBoardFeed ?? recordedAshbyFeed([]),
    getPage,
    now: () => NOW,
  });
  return { index };
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

function recordedAshbyFeed(fetched: string[]) {
  return async (url: string): Promise<BoardFeedResponse> => {
    fetched.push(url);
    if (url !== ASHBY_RENTMAN_FEED_URL) {
      return { ok: false, status: 404 };
    }
    return { ok: true, status: 200, body: RECORDED_ASHBY_FEED };
  };
}

function productDesignerOnlyFeed(): string {
  const payload = JSON.parse(RECORDED_ASHBY_FEED) as { jobs: unknown[] };
  payload.jobs = payload.jobs.filter(
    (job) => typeof job === "object" && job !== null && (job as { id?: string }).id === PRODUCT_DESIGNER_ID,
  );
  return JSON.stringify(payload);
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
