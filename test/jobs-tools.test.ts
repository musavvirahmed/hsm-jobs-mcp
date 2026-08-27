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
  });
  expect(JSON.stringify(result.structuredContent)).not.toMatch(/jd_extract|jd_body|description/);
});

test("get_job miss on an empty jobs index is a structured found:false", async () => {
  connected = await connectEmptyIndex();
  const result = await connected.client.callTool({
    name: "get_job",
    arguments: { url: "https://rentman.io/jobs/product-designer" },
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
});

test("get_job returns a found Opening card for the Rentman Product Designer URL", async () => {
  connected = await connectSeededIndex();
  const result = await connected.client.callTool({
    name: "get_job",
    arguments: { url: RENTMAN_PRODUCT_DESIGNER_URL },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    found: true,
    url: RENTMAN_PRODUCT_DESIGNER_URL,
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
    arguments: { url: "https://missing.example.invalid/jobs/nope" },
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
  expect(payload.openings.map((opening) => opening.url)).toEqual([RENTMAN_PRODUCT_DESIGNER_URL]);
  expect(payload.openings[0]).toMatchObject({
    title: "Product Designer",
    url: RENTMAN_PRODUCT_DESIGNER_URL,
    location: "Utrecht",
    register_join: { name: "Rentman B.V.", kvk: "60733144", strength: "exact_kvk" },
    source_class: "ats_board",
    honesty_salary: "unknown",
    honesty_dutch_required: "unknown",
    honesty_sponsorship_willingness: "unknown",
  });
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
    openings: [{ url: RENTMAN_PRODUCT_DESIGNER_URL, register_join: { kvk: "60733144" } }],
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
  const payload = result.structuredContent as { openings: Array<{ url: string; location: string }> };
  expect(payload.openings.map((opening) => opening.url)).toEqual([RENTMAN_PRODUCT_DESIGNER_URL]);
  expect(payload.openings[0]?.location).toBe("Utrecht");
});

test("search_jobs honors limit default 10 and max 20", async () => {
  connected = await connectSeededIndex();
  const defaulted = await connected.client.callTool({
    name: "search_jobs",
    arguments: { query: "e" },
  });
  const payload = defaulted.structuredContent as { openings: unknown[] };
  expect(payload.openings.length).toBeLessThanOrEqual(10);

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
    arguments: { url: RENTMAN_PRODUCT_DESIGNER_URL },
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

