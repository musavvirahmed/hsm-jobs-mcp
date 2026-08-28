import { afterEach, expect, test } from "vitest";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { FIXTURE_OPENINGS, RENTMAN_PRODUCT_DESIGNER_URL } from "../src/fixtures/jobs-index";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import type { JobsToolsDeps } from "../src/jobs-tools";
import {
  connectPrivateReleaseMcp,
  formatPrivateReleaseFailures,
  verifyPrivateRelease,
} from "../src/private-release-verify";
import type { Client } from "@modelcontextprotocol/client";
import { createSeededD1JobsIndex } from "./seeded-d1-jobs-index";
import { createMemoryJobsIndex } from "../src/jobs-index";

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

function seededDeps(): JobsToolsDeps {
  return {
    jobsIndex: createSeededD1JobsIndex(),
    hsmMcp: createStubHsmMcp(),
  };
}

function emptyDeps(): JobsToolsDeps {
  return {
    jobsIndex: createMemoryJobsIndex(),
    hsmMcp: createStubHsmMcp(),
  };
}

async function connectVerifyHarness(deps: JobsToolsDeps): Promise<Connected> {
  const handler = createMcpHandler(() => createJobsMcpServer(deps));
  const connected = await connectPrivateReleaseMcp("http://127.0.0.1:8787", (url, init) =>
    handler.fetch(new Request(url, init)),
  );
  return {
    client: connected.client,
    close: async () => {
      await connected.close();
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

test("verifyPrivateRelease passes on a seeded partial index over Streamable HTTP", async () => {
  connected = await connectVerifyHarness(seededDeps());
  const result = await verifyPrivateRelease(connected.client);
  expect(result).toEqual({ ok: true });
});

test("verifyPrivateRelease fails fast on an empty index with actionable checks", async () => {
  connected = await connectVerifyHarness(emptyDeps());
  const result = await verifyPrivateRelease(connected.client);
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.failures.map((failure) => failure.check)).toEqual([
    "search_jobs golden Opening",
    "get_job golden Opening",
    "get_index_status sponsors_with_openings",
  ]);
  expect(formatPrivateReleaseFailures(result.failures)).toMatch(
    /search_jobs golden Opening[\s\S]*product designer/i,
  );
  expect(formatPrivateReleaseFailures(result.failures)).toMatch(/sponsors_with_openings/i);
});

test("verifyPrivateRelease rejects unmatched register_join on the golden card", async () => {
  const goldenUnmatched = {
    ...FIXTURE_OPENINGS[0]!,
    register_name: null,
    register_kvk: null,
    register_join_strength: "unmatched" as const,
  };
  connected = await connectVerifyHarness({
    jobsIndex: createMemoryJobsIndex({
      openings: [goldenUnmatched],
      snapshot: {
        jobs_count: 1,
        last_successful_crawl: "2026-08-27T00:00:00Z",
        stale: false,
        coverage_note: "",
        source_policy: "first-party careers/ATS only",
        register_join_note: "",
        index_scope: {
          pass: "partial",
          sponsors_attempted: 1,
          sponsors_with_openings: 1,
          register_size: 1,
          register_as_of: "2026-08-03",
          omissions_possible: true,
        },
      },
    }),
    hsmMcp: createStubHsmMcp(),
  });

  const result = await verifyPrivateRelease(connected.client);
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.failures).toContainEqual({
    check: "search_jobs golden Opening",
    detail: "golden card register_join.strength is unmatched — index-time join did not survive",
  });
});

test("connectPrivateReleaseMcp targets /mcp on the configured origin", async () => {
  const seen: string[] = [];
  const handler = createMcpHandler(() => createJobsMcpServer(emptyDeps()));
  connected = await connectPrivateReleaseMcp("http://127.0.0.1:8787", (url, init) => {
    seen.push(String(url));
    return handler.fetch(new Request(url, init));
  });
  await connected.close();
  connected = undefined;
  await handler.close();
  expect(seen.some((url) => url.includes("/mcp"))).toBe(true);
});

test("formatPrivateReleaseFailures mentions the golden careers URL", async () => {
  const message = formatPrivateReleaseFailures([
    {
      check: "search_jobs golden Opening",
      detail: `expected ${RENTMAN_PRODUCT_DESIGNER_URL} among hits`,
    },
  ]);
  expect(message).toContain(RENTMAN_PRODUCT_DESIGNER_URL);
});
