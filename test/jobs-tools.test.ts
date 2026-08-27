import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createMemoryJobsIndex } from "../src/jobs-index";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

async function connectEmptyIndex(): Promise<Connected> {
  const handler = createMcpHandler(() =>
    createJobsMcpServer({
      jobsIndex: createMemoryJobsIndex(),
      hsmMcp: createStubHsmMcp(),
    }),
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
