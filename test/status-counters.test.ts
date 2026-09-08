import { expect, test } from "vitest";
import type { OpeningRecord } from "../src/jobs-index";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

function opening(
  partial: Pick<OpeningRecord, "identity" | "primary_url" | "title"> & Partial<OpeningRecord>,
): OpeningRecord {
  return {
    careers_url: partial.careers_url ?? partial.primary_url,
    ats_url: partial.ats_url ?? null,
    location: partial.location ?? null,
    jd_extract: partial.jd_extract ?? null,
    source_class: partial.source_class ?? "ats_board",
    honesty_salary: partial.honesty_salary ?? "unknown",
    honesty_dutch_required: partial.honesty_dutch_required ?? "unknown",
    honesty_sponsorship_willingness: partial.honesty_sponsorship_willingness ?? "unknown",
    register_name: partial.register_name ?? "Example B.V.",
    register_kvk: partial.register_kvk ?? "12345678",
    register_join_strength: partial.register_join_strength ?? "exact_kvk",
    ats_family: partial.ats_family ?? "ashby",
    board_token: partial.board_token ?? "example",
    posting_id: partial.posting_id ?? "post-1",
    ...partial,
  };
}

test("materialized jobs_count tracks upsert and remove without recounting openings", async () => {
  const index = createEmptyWritableJobsIndex();
  expect((await index.snapshot()).jobs_count).toBe(0);

  await index.upsertOpening(
    opening({
      identity: "ashby:example:1",
      primary_url: "https://example.com/jobs/1",
      title: "One",
      posting_id: "1",
    }),
  );
  expect((await index.snapshot()).jobs_count).toBe(1);

  await index.upsertOpening(
    opening({
      identity: "ashby:example:1",
      primary_url: "https://example.com/jobs/1",
      title: "One updated",
      posting_id: "1",
    }),
  );
  expect((await index.snapshot()).jobs_count).toBe(1);

  await index.upsertOpening(
    opening({
      identity: "ashby:example:2",
      primary_url: "https://example.com/jobs/2",
      title: "Two",
      posting_id: "2",
    }),
  );
  expect((await index.snapshot()).jobs_count).toBe(2);

  await index.removeOpening("ashby:example:1");
  expect((await index.snapshot()).jobs_count).toBe(1);
});

test("materialized sponsors counters track website resolution and terminal outcomes", async () => {
  const index = createEmptyWritableJobsIndex();
  const now = "2026-09-08T12:00:00.000Z";

  await index.recordWebsiteResolution({
    kvk: "60733144",
    official_website_host: "rentman.io",
    now,
  });
  expect((await index.snapshot()).index_scope).toMatchObject({
    sponsors_attempted: 1,
    sponsors_with_openings: 0,
  });

  await index.recordTerminalOutcome({
    kvk: "60733144",
    outcome: "openings_indexed",
    official_website_host: "rentman.io",
    now,
  });
  expect((await index.snapshot()).index_scope).toMatchObject({
    sponsors_attempted: 1,
    sponsors_with_openings: 1,
  });

  await index.recordTerminalOutcome({
    kvk: "60733144",
    outcome: "no_matching_public_board",
    official_website_host: "rentman.io",
    now,
  });
  expect((await index.snapshot()).index_scope).toMatchObject({
    sponsors_attempted: 1,
    sponsors_with_openings: 0,
  });
});

test("listOpeningsByBoard returns board-scoped openings after migration index", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.upsertOpening(
    opening({
      identity: "ashby:rentman:1",
      primary_url: "https://jobs.ashbyhq.com/rentman/1",
      title: "Designer",
      ats_family: "ashby",
      board_token: "rentman",
      posting_id: "1",
    }),
  );
  await index.upsertOpening(
    opening({
      identity: "ashby:other:2",
      primary_url: "https://jobs.ashbyhq.com/other/2",
      title: "Engineer",
      ats_family: "ashby",
      board_token: "other",
      posting_id: "2",
    }),
  );

  const board = await index.listOpeningsByBoard("ashby", "rentman");
  expect(board.map((row) => row.identity)).toEqual(["ashby:rentman:1"]);
});

test("setLastSuccessfulCrawl reconciles counters to live table counts", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.upsertOpening(
    opening({
      identity: "ashby:example:1",
      primary_url: "https://example.com/jobs/1",
      title: "One",
    }),
  );
  await index.recordWebsiteResolution({
    kvk: "12345678",
    official_website_host: "example.com",
    now: "2026-09-08T12:00:00.000Z",
  });

  await index.setLastSuccessfulCrawl("2026-09-08T12:00:00.000Z");
  const snapshot = await index.snapshot();
  expect(snapshot.jobs_count).toBe(1);
  expect(snapshot.last_successful_crawl).toBe("2026-09-08T12:00:00.000Z");
  expect(snapshot.index_scope.sponsors_attempted).toBe(1);
});
