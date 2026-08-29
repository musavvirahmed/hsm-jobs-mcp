import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, test } from "vitest";
import { FIXTURE_OPENINGS } from "../src/fixtures/jobs-index";
import {
  createCrawlJobsIndex,
  createOperatorJobsIndex,
  createOperatorWritableJobsIndex,
  formatJobsIndexTarget,
  parseJobsIndexTarget,
} from "../src/operator-jobs-index";
import type { RemoteD1QueryClient } from "../src/remote-d1-jobs-index";
import { createRemoteD1WritableJobsIndex, remoteD1ConfigFromEnv } from "../src/remote-d1-jobs-index";

const SAMPLE_OPENING = FIXTURE_OPENINGS[0]!;
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

test("parseJobsIndexTarget accepts local-d1, remote-d1, and sqlite paths", () => {
  expect(parseJobsIndexTarget("local-d1")).toEqual({ kind: "local-d1" });
  expect(parseJobsIndexTarget("remote-d1")).toEqual({ kind: "remote-d1" });
  expect(parseJobsIndexTarget("sqlite:/tmp/jobs.sqlite")).toEqual({
    kind: "sqlite",
    path: "/tmp/jobs.sqlite",
  });
});

test("formatJobsIndexTarget round-trips parseJobsIndexTarget labels", () => {
  expect(formatJobsIndexTarget(parseJobsIndexTarget("local-d1"))).toBe("local-d1");
  expect(formatJobsIndexTarget(parseJobsIndexTarget("sqlite:/tmp/jobs.sqlite"))).toBe(
    "sqlite:/tmp/jobs.sqlite",
  );
});

test("createCrawlJobsIndex uses in-memory sqlite for smoke and resolver target otherwise", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hsm-crawl-index-"));
  const path = join(dir, "jobs.sqlite");
  try {
    const smoke = await createCrawlJobsIndex({ smoke: true });
    expect(smoke.targetLabel).toBe("memory (CRAWL_SMOKE=1)");
    await smoke.index.upsertOpening(SAMPLE_OPENING);
    expect(await smoke.index.getOpening(SAMPLE_OPENING.primary_url)).toEqual(SAMPLE_OPENING);

    const live = await createCrawlJobsIndex({
      smoke: false,
      operatorOptions: { target: { kind: "sqlite", path } },
    });
    expect(live.targetLabel).toBe(`sqlite:${path}`);
    await live.index.upsertOpening(SAMPLE_OPENING);
    expect(await live.index.getOpening(SAMPLE_OPENING.primary_url)).toEqual(SAMPLE_OPENING);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sqlite target round-trips an Opening through writable and read-only indexes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hsm-sqlite-index-"));
  const path = join(dir, "jobs.sqlite");
  try {
    const writable = await createOperatorWritableJobsIndex({
      target: { kind: "sqlite", path },
    });
    await writable.upsertOpening(SAMPLE_OPENING);

    const readable = await createOperatorJobsIndex({
      target: { kind: "sqlite", path },
    });
    const roundTrip = await readable.getOpening(SAMPLE_OPENING.primary_url);
    expect(roundTrip).toEqual(SAMPLE_OPENING);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("local-d1 target round-trips an Opening on ephemeral wrangler state", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "hsm-local-d1-"));
  try {
    const writable = await createOperatorWritableJobsIndex({
      target: { kind: "local-d1" },
      localD1StateDir: stateDir,
    });
    await writable.upsertOpening(SAMPLE_OPENING);

    const readable = await createOperatorJobsIndex({
      target: { kind: "local-d1" },
      localD1StateDir: stateDir,
    });
    const roundTrip = await readable.getOpening(SAMPLE_OPENING.primary_url);
    expect(roundTrip).toEqual(SAMPLE_OPENING);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("remote-d1 target round-trips an Opening through a stub query client", async () => {
  const client = createStubRemoteD1QueryClient();
  const writable = await createOperatorWritableJobsIndex({
    target: { kind: "remote-d1" },
    remoteD1Client: client,
    skipRemoteD1Migrations: true,
  });
  await writable.upsertOpening(SAMPLE_OPENING);

  const readable = await createOperatorJobsIndex({
    target: { kind: "remote-d1" },
    remoteD1Client: client,
    skipRemoteD1Migrations: true,
  });
  expect(await readable.getOpening(SAMPLE_OPENING.primary_url)).toEqual(SAMPLE_OPENING);
});

test("createCrawlJobsIndex labels remote-d1 in crawl JSON output", async () => {
  const client = createStubRemoteD1QueryClient();
  const crawl = await createCrawlJobsIndex({
    smoke: false,
    operatorOptions: {
      target: { kind: "remote-d1" },
      remoteD1Client: client,
      skipRemoteD1Migrations: true,
    },
  });
  expect(crawl.targetLabel).toBe("remote-d1");
});

test("remote-d1 without Cloudflare credentials throws a clear env error", () => {
  expect(() => remoteD1ConfigFromEnv({})).toThrow(
    /JOBS_INDEX_TARGET=remote-d1 requires CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CLOUDFLARE_API_TOKEN/,
  );
});

test("createRemoteD1WritableJobsIndex uses Cloudflare REST when stub fetch is wired", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const fetchFn: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { sql: string; params: unknown[] };
    calls.push(body);
    return new Response(
      JSON.stringify({
        success: true,
        result: [{ success: true, results: [] }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const index = await createRemoteD1WritableJobsIndex({
    config: {
      accountId: "acct-test",
      databaseId: "db-test-0000-0000-0000-000000000001",
      apiToken: "token-test",
    },
    fetchFn,
    skipMigrations: true,
  });
  await index.setLastSuccessfulCrawl("2026-08-29T00:00:00.000Z");
  expect(calls).toHaveLength(1);
  expect(calls[0]?.sql).toMatch(/UPDATE index_meta SET last_successful_crawl/i);
  expect(calls[0]?.params).toEqual(["2026-08-29T00:00:00.000Z"]);
});

function createStubRemoteD1QueryClient(): RemoteD1QueryClient {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return {
    async query(sql, params = []) {
      const statement = sqlite.prepare(sql);
      if (/^\s*SELECT/i.test(sql)) {
        const rows = params.length
          ? statement.all(...(params as SQLInputValue[]))
          : statement.all();
        return { success: true, results: rows as Record<string, unknown>[] };
      }
      if (params.length) statement.run(...(params as SQLInputValue[]));
      else statement.run();
      return { success: true, results: [] };
    },
  };
}
