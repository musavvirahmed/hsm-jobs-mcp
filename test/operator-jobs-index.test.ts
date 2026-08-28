import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FIXTURE_OPENINGS } from "../src/fixtures/jobs-index";
import {
  createCrawlJobsIndex,
  createOperatorJobsIndex,
  createOperatorWritableJobsIndex,
  formatJobsIndexTarget,
  parseJobsIndexTarget,
} from "../src/operator-jobs-index";

const SAMPLE_OPENING = FIXTURE_OPENINGS[0]!;

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

test("remote-d1 target throws a clear not-implemented error", async () => {
  await expect(
    createOperatorWritableJobsIndex({ target: { kind: "remote-d1" } }),
  ).rejects.toThrow(/remote-d1 is not implemented/i);
});
