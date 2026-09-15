import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { FIXTURE_SNAPSHOT, RENTMAN_PRODUCT_DESIGNER_URL } from "../src/fixtures/jobs-index";
import { createMemoryJobsIndex } from "../src/jobs-index";
import { createStubHsmMcp, type HsmMcpAdapter } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import type { JobsToolsDeps } from "../src/jobs-tools";
import { createSeededD1JobsIndex } from "./seeded-d1-jobs-index";

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

function seededDeps(hsmMcp: HsmMcpAdapter = createStubHsmMcp()): JobsToolsDeps {
  return {
    jobsIndex: createSeededD1JobsIndex(),
    hsmMcp,
  };
}

async function connectTools(deps: JobsToolsDeps): Promise<Connected> {
  const handler = createMcpHandler(() => createJobsMcpServer(deps));
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

function connectEmptyIndex(): Promise<Connected> {
  return connectTools({
    jobsIndex: createMemoryJobsIndex(),
    hsmMcp: createStubHsmMcp(),
  });
}

function connectSeededIndex(hsmMcp?: HsmMcpAdapter): Promise<Connected> {
  return connectTools(seededDeps(hsmMcp));
}

let connected: Connected | undefined;

afterEach(async () => {
  if (connected) {
    await connected.close();
    connected = undefined;
  }
});

test("search_jobs on an empty jobs index returns no openings with omissions_possible", async () => {
  connected = await connectEmptyIndex();
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer" },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toEqual({
    openings: [],
    index_scope: {
      pass: "partial",
      sponsors_attempted: 0,
      sponsors_with_openings: 0,
      register_size: 0,
      register_as_of: null,
      omissions_possible: true,
    },
    register_join_status: "ok",
    results_truncated: false,
    result_note:
      "Partial index so far — more sponsors still being checked. Sponsor matches look current.",
  });
  expect(JSON.stringify(result.structuredContent)).not.toMatch(/jd_extract|jd_body|description/);
});

test("get_job miss on an empty jobs index is a structured found:false", async () => {
  connected = await connectEmptyIndex();
  const result = await connected.client.callTool({
    name: "get_job",
    arguments: { primary_url: "https://rentman.io/jobs/product-designer" },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toEqual({
    found: false,
    index_scope: {
      pass: "partial",
      sponsors_attempted: 0,
      sponsors_with_openings: 0,
      register_size: 0,
      register_as_of: null,
      omissions_possible: true,
    },
  });
});

test("get_index_status on an empty jobs index reports partial coverage", async () => {
  connected = await connectEmptyIndex();
  const result = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    jobs_count: 0,
    stale: true,
    last_successful_crawl: null,
    source_policy: "first-party careers/ATS only",
    index_scope: {
      pass: "partial",
      sponsors_attempted: 0,
      sponsors_with_openings: 0,
      register_size: 0,
      register_as_of: null,
      omissions_possible: true,
    },
  });
  const text = result.content.find((block) => block.type === "text");
  expect(text?.type === "text" ? JSON.parse(text.text) : null).toEqual(result.structuredContent);
  expect(result.structuredContent).not.toHaveProperty("ind_last_updated");
  expect(result.structuredContent).not.toHaveProperty("row_count");
});

test("search_jobs rejects calls that omit both query and kvk", async () => {
  connected = await connectEmptyIndex();
  const result = await connected.client.callTool({ name: "search_jobs", arguments: {} });
  expect(result.isError).toBe(true);
});

test("search_jobs accepts an 8-digit kvk on an empty index", async () => {
  connected = await connectEmptyIndex();
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    openings: [],
    index_scope: { pass: "partial", omissions_possible: true },
    register_join_status: "ok",
  });
});

test("the server advertises exactly the three v1 jobs tools", async () => {
  connected = await connectEmptyIndex();
  const listed = await connected.client.listTools();
  expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
    "get_index_status",
    "get_job",
    "search_jobs",
  ]);
  expect(listed.tools.some((tool) => tool.name.includes("-"))).toBe(false);
  const search = listed.tools.find((tool) => tool.name === "search_jobs");
  const getJob = listed.tools.find((tool) => tool.name === "get_job");
  expect(search?.description).toMatch(/primary_url/);
  expect(search?.description).toMatch(/clickable link/i);
  expect(search?.description).toMatch(/result_note/);
  expect(getJob?.description).toMatch(/primary_url/);
  expect(getJob?.description).toMatch(/clickable link/i);
});

test("search_jobs omits careers_url and ats_url when equal to primary_url and keeps a distinct ATS URL", async () => {
  const atsOnly = "https://jobs.ashbyhq.com/fixture/ats-only-1";
  const careers = "https://careers.example.test/jobs/ux";
  const atsDistinct = "https://jobs.ashbyhq.com/fixture/ux-1";
  connected = await connectTools({
    jobsIndex: createMemoryJobsIndex({
      openings: [
        {
          identity: "ashby:fixture:ats-only",
          primary_url: atsOnly,
          careers_url: null,
          ats_url: atsOnly,
          title: "ATS Only Designer",
          location: "Amsterdam",
          jd_extract: null,
          source_class: "ats_board",
          honesty_salary: "unknown",
          honesty_dutch_required: "unknown",
          honesty_sponsorship_willingness: "unknown",
          register_name: "Ats Only B.V.",
          register_kvk: "20000001",
          register_join_strength: "exact_kvk",
          ats_family: "ashby",
          board_token: "fixture",
          posting_id: "ats-only-1",
        },
        {
          identity: "ashby:fixture:distinct",
          primary_url: careers,
          careers_url: careers,
          ats_url: atsDistinct,
          title: "Distinct URL Designer",
          location: "Utrecht",
          jd_extract: null,
          source_class: "ats_board",
          honesty_salary: "unknown",
          honesty_dutch_required: "unknown",
          honesty_sponsorship_willingness: "unknown",
          register_name: "Distinct B.V.",
          register_kvk: "20000002",
          register_join_strength: "exact_kvk",
          ats_family: "ashby",
          board_token: "fixture",
          posting_id: "ux-1",
        },
      ],
      snapshot: FIXTURE_SNAPSHOT,
    }),
    hsmMcp: createStubHsmMcp(),
  });

  const atsResult = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "ATS Only" },
  });
  const atsCard = (atsResult.structuredContent as { openings: Array<Record<string, unknown>> })
    .openings[0];
  expect(atsCard).toMatchObject({ primary_url: atsOnly, title: "ATS Only Designer" });
  expect(atsCard).not.toHaveProperty("ats_url");
  expect(atsCard).not.toHaveProperty("careers_url");
  expect(atsCard).not.toHaveProperty("url");

  const distinctResult = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "Distinct URL" },
  });
  const distinctCard = (
    distinctResult.structuredContent as { openings: Array<Record<string, unknown>> }
  ).openings[0];
  expect(distinctCard).toMatchObject({
    primary_url: careers,
    ats_url: atsDistinct,
    title: "Distinct URL Designer",
  });
  expect(distinctCard).not.toHaveProperty("careers_url");
  expect(distinctCard).not.toHaveProperty("url");
});

test("get_job returns a found Opening card for the Rentman Product Designer URL", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({
    name: "get_job",
    arguments: { primary_url: RENTMAN_PRODUCT_DESIGNER_URL },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    found: true,
    primary_url: RENTMAN_PRODUCT_DESIGNER_URL,
    title: "Product Designer",
    location: "Utrecht",
    register_join: {
      name: "Rentman B.V.",
      kvk: "60733144",
      strength: "exact_kvk",
    },
    source_class: "ats_board",
    honesty_salary: "unknown",
    honesty_dutch_required: "unknown",
    honesty_sponsorship_willingness: "unknown",
    jd_extract: "Rentman is hiring a Product Designer in Utrecht. Competitive salary. Fluent English.",
    index_scope: {
      pass: "partial",
      omissions_possible: true,
    },
    register_join_status: "ok",
  });
});

test("get_job miss on a seeded jobs index is a structured found:false", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({
    name: "get_job",
    arguments: { primary_url: "https://missing.example.invalid/jobs/nope" },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toEqual({
    found: false,
    index_scope: FIXTURE_SNAPSHOT.index_scope,
  });
});

test("search_jobs query returns the Rentman short card without JD body", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product designer" },
  });
  expect(result.isError).toBeFalsy();
  const payload = result.structuredContent as {
    openings: Array<Record<string, unknown>>;
    register_join_status: string;
  };
  expect(payload.register_join_status).toBe("ok");
  expect(payload.openings.map((opening) => opening.primary_url)).toEqual([RENTMAN_PRODUCT_DESIGNER_URL]);
  expect(payload.openings[0]).toMatchObject({
    title: "Product Designer",
    primary_url: RENTMAN_PRODUCT_DESIGNER_URL,
    location: "Utrecht",
    ats_url: "https://jobs.ashbyhq.com/rentman",
    register_join: { name: "Rentman B.V.", kvk: "60733144", strength: "exact_kvk" },
    source_class: "ats_board",
    honesty_salary: "unknown",
    honesty_dutch_required: "unknown",
    honesty_sponsorship_willingness: "unknown",
  });
  expect(payload.openings[0]).not.toHaveProperty("careers_url");
  expect(payload.openings[0]).not.toHaveProperty("url");
  expect(JSON.stringify(result.structuredContent)).not.toMatch(/jd_extract|jd_body|description/);
});

test("search_jobs by kvk returns Openings for that employer", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    openings: [{ primary_url: RENTMAN_PRODUCT_DESIGNER_URL, register_join: { kvk: "60733144" } }],
    index_scope: { pass: "partial", omissions_possible: true },
  });
});

test("search_jobs query matches title not location", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "Utrecht" },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({ openings: [] });
});

test("search_jobs location filter keeps Utrecht and drops Amsterdam", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "designer", location: "Utrecht" },
  });
  expect(result.isError).toBeFalsy();
  const payload = result.structuredContent as { openings: Array<{ primary_url: string; location: string }> };
  expect(payload.openings.map((opening) => opening.primary_url)).toEqual([RENTMAN_PRODUCT_DESIGNER_URL]);
  expect(payload.openings[0]?.location).toBe("Utrecht");
});

test("get_index_status on a seeded jobs index reports fixture coverage", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    jobs_count: FIXTURE_SNAPSHOT.jobs_count,
    stale: false,
    last_successful_crawl: FIXTURE_SNAPSHOT.last_successful_crawl,
    source_policy: "first-party careers/ATS only",
    index_scope: FIXTURE_SNAPSHOT.index_scope,
  });
  expect(result.structuredContent).not.toHaveProperty("ind_last_updated");
  expect(result.structuredContent).not.toHaveProperty("row_count");
});

test("search_jobs honors limit default 10 and max 20", async () => {
  connected = await connectSeededIndex();
  const defaulted = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "e" },
  });
  const payload = defaulted.structuredContent as { openings: unknown[] };
  expect(payload.openings.length).toBeGreaterThan(1);
  expect(payload.openings.length).toBeLessThanOrEqual(10);

  const truncated = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "e", limit: 1 },
  });
  expect(truncated.isError).toBeFalsy();
  expect((truncated.structuredContent as { openings: unknown[] }).openings).toHaveLength(1);

  const capped = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "e", limit: 20 },
  });
  expect(capped.isError).toBeFalsy();

  const rejected = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "e", limit: 21 },
  });
  expect(rejected.isError).toBe(true);
});

test("search_jobs result_note mentions a cap only when more matches exist", async () => {
  const openings = Array.from({ length: 5 }, (_, i) => ({
    identity: `mem-${i}`,
    primary_url: `https://example.test/jobs/${i}`,
    careers_url: `https://example.test/jobs/${i}`,
    ats_url: null,
    title: `Product Designer ${i}`,
    location: i === 0 ? "Amsterdam" : "Utrecht",
    jd_extract: null,
    source_class: "ats_board" as const,
    honesty_salary: "unknown",
    honesty_dutch_required: "unknown" as const,
    honesty_sponsorship_willingness: "unknown" as const,
    register_name: `Sponsor ${i} B.V.`,
    register_kvk: `1000000${i}`,
    register_join_strength: "exact_kvk" as const,
    ats_family: null,
    board_token: null,
    posting_id: null,
  }));
  connected = await connectTools({
    jobsIndex: createMemoryJobsIndex({
      openings,
      snapshot: {
        ...FIXTURE_SNAPSHOT,
        jobs_count: openings.length,
        index_scope: {
          ...FIXTURE_SNAPSHOT.index_scope,
          pass: "full_careers_pass",
          register_as_of: "2026-08-03",
          omissions_possible: false,
        },
        coverage_note:
          "Full Work-register coverage: every current Work-register sponsor has been checked. An empty search means no title/location match in the index.",
      },
    }),
    hsmMcp: createStubHsmMcp(),
  });

  const capped = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "Product Designer", limit: 2 },
  });
  expect(capped.isError).toBeFalsy();
  const cappedPayload = capped.structuredContent as {
    openings: unknown[];
    results_truncated: boolean;
    result_note: string;
  };
  expect(cappedPayload.openings).toHaveLength(2);
  expect(cappedPayload.results_truncated).toBe(true);
  expect(cappedPayload.result_note).toMatch(/full Work-register coverage/i);
  expect(cappedPayload.result_note).toMatch(/2026-08-03/);
  expect(cappedPayload.result_note).toMatch(/top 2/i);
  expect(cappedPayload.result_note).toMatch(/tighter|narrow|location|title/i);
  expect(cappedPayload.result_note).not.toMatch(/census|not a full/i);

  const allFits = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "Product Designer", limit: 20 },
  });
  const allPayload = allFits.structuredContent as {
    openings: unknown[];
    results_truncated: boolean;
    result_note: string;
  };
  expect(allPayload.openings).toHaveLength(5);
  expect(allPayload.results_truncated).toBe(false);
  expect(allPayload.result_note).toMatch(/full Work-register coverage/i);
  expect(allPayload.result_note).not.toMatch(/top \d+|more match|tighter|capped|census/i);
});

test("fixture cards cover register-join strengths and honesty sentinels", async () => {
  connected = await connectSeededIndex();
  const byKvk = async (kvk: string) => {
    const result = await connected!.client.callTool({ name: "search_jobs", arguments: { kvk } });
    return (result.structuredContent as { openings: Array<Record<string, unknown>> }).openings[0];
  };
  expect(await byKvk("60733144")).toMatchObject({
    register_join: { strength: "exact_kvk" },
    honesty_salary: "unknown",
    honesty_dutch_required: "unknown",
    honesty_sponsorship_willingness: "unknown",
  });
  expect(await byKvk("11111111")).toMatchObject({
    register_join: { strength: "strong_name" },
    honesty_salary: "€5,000–€6,000 per month",
    honesty_dutch_required: false,
    honesty_sponsorship_willingness: "stated_yes",
  });
  expect(await byKvk("22222222")).toMatchObject({
    register_join: { strength: "weak" },
    honesty_dutch_required: true,
    source_class: "careers_site",
  });

  const unmatched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "product design intern" },
  });
  expect(unmatched.structuredContent).toMatchObject({
    openings: [
      {
        register_join: { name: null, kvk: null, strength: "unmatched" },
        honesty_sponsorship_willingness: "stated_no",
        source_class: "unknown",
      },
    ],
  });
});

test("upstream degrade keeps last-known join and surfaces stale or error", async () => {
  connected = await connectSeededIndex(createStubHsmMcp("error"));
  const errored = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  expect(errored.structuredContent).toMatchObject({
    register_join_status: "error",
    openings: [{ register_join: { name: "Rentman B.V.", kvk: "60733144", strength: "exact_kvk" } }],
  });
  await connected.close();

  connected = await connectSeededIndex(createStubHsmMcp("stale"));
  const stale = await connected.client.callTool({
    name: "get_job",
    arguments: { primary_url: RENTMAN_PRODUCT_DESIGNER_URL },
  });
  expect(stale.structuredContent).toMatchObject({
    found: true,
    register_join_status: "stale",
    register_join: { strength: "exact_kvk", kvk: "60733144" },
  });
});

test("hybrid join never invents a stronger match than the jobs index stored", async () => {
  connected = await connectTools({
    ...seededDeps(),
    hsmMcp: {
      async revalidateKvks(kvks) {
        return { status: "ok", present: [...kvks, "22222222", "99999999"] };
      },
    },
  });
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "22222222" },
  });
  expect(result.structuredContent).toMatchObject({
    register_join_status: "ok",
    openings: [{ register_join: { strength: "weak", kvk: "22222222" } }],
  });
});

test("hybrid join marks last-known KvK unmatched when it is absent from the register", async () => {
  connected = await connectTools({
    ...seededDeps(),
    hsmMcp: {
      async revalidateKvks() {
        return { status: "ok", present: [] };
      },
    },
  });
  const result = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60733144" },
  });
  expect(result.structuredContent).toMatchObject({
    register_join_status: "ok",
    openings: [
      {
        register_join: {
          name: "Rentman B.V.",
          kvk: "60733144",
          strength: "unmatched",
        },
      },
    ],
  });
});

