import { expect, test } from "vitest";
import type { OpeningRecord } from "../src/jobs-index";
import {
  loadBoardSeedsForOpeningRefresh,
  parseCrawlRefreshMaxSeeds,
  selectBoardSeedsForOpeningRefresh,
  type BoardSeedRefreshRow,
} from "../src/board-seed-refresh";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

function seed(
  kvk: string,
  token: string,
  updatedAt: string,
  hasOpenings: boolean,
): BoardSeedRefreshRow {
  return {
    kvk,
    ats_family: "ashby",
    board_token: token,
    public_board_feed_url: `https://api.ashbyhq.com/posting-api/job-board/${token}`,
    updated_at: updatedAt,
    has_openings: hasOpenings,
  };
}

test("selectBoardSeedsForOpeningRefresh prefers live boards then oldest empty boards, then caps", () => {
  const liveNew = seed("20000002", "live-new", "2026-09-04T00:00:00Z", true);
  const liveOld = seed("20000001", "live-old", "2026-08-01T00:00:00Z", true);
  const emptyOld = seed("10000001", "empty-old", "2026-07-01T00:00:00Z", false);
  const emptyMid = seed("10000002", "empty-mid", "2026-08-01T00:00:00Z", false);
  const emptyNew = seed("10000003", "empty-new", "2026-09-01T00:00:00Z", false);

  expect(
    selectBoardSeedsForOpeningRefresh({
      seeds: [emptyNew, liveNew, emptyOld, liveOld, emptyMid],
      maxSeeds: 3,
    }).map((row) => row.board_token),
  ).toEqual(["live-old", "live-new", "empty-old"]);
});

test("selectBoardSeedsForOpeningRefresh round-robins live boards when they exceed the cap", () => {
  const liveA = seed("30000001", "live-a", "2026-09-01T00:00:00Z", true);
  const liveB = seed("30000002", "live-b", "2026-08-01T00:00:00Z", true);
  const liveC = seed("30000003", "live-c", "2026-07-01T00:00:00Z", true);

  expect(
    selectBoardSeedsForOpeningRefresh({
      seeds: [liveA, liveB, liveC],
      maxSeeds: 2,
    }).map((row) => row.board_token),
  ).toEqual(["live-c", "live-b"]);
});

test("selectBoardSeedsForOpeningRefresh with maxSeeds 0 takes the whole queue", () => {
  const rows = [
    seed("10000001", "a", "2026-07-01T00:00:00Z", false),
    seed("10000002", "b", "2026-08-01T00:00:00Z", false),
  ];
  expect(selectBoardSeedsForOpeningRefresh({ seeds: rows, maxSeeds: 0 })).toHaveLength(2);
  expect(
    selectBoardSeedsForOpeningRefresh({ seeds: rows, maxSeeds: Number.POSITIVE_INFINITY }),
  ).toHaveLength(2);
});

test("parseCrawlRefreshMaxSeeds treats 0 as uncapped and blanks as the default", () => {
  expect(parseCrawlRefreshMaxSeeds(undefined)).toBe(400);
  expect(parseCrawlRefreshMaxSeeds("")).toBe(400);
  expect(parseCrawlRefreshMaxSeeds("0")).toBe(Number.POSITIVE_INFINITY);
  expect(parseCrawlRefreshMaxSeeds("250")).toBe(250);
});

test("listBoardSeedRefreshQueue joins openings in memory (live vs empty)", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.setBoardSeed(
    {
      kvk: "60733144",
      ats_family: "ashby",
      board_token: "rentman",
      public_board_feed_url: "https://api.ashbyhq.com/posting-api/job-board/rentman",
    },
    "2026-08-01T00:00:00Z",
  );
  await index.setBoardSeed(
    {
      kvk: "12345678",
      ats_family: "ashby",
      board_token: "empty-co",
      public_board_feed_url: "https://api.ashbyhq.com/posting-api/job-board/empty-co",
    },
    "2026-07-01T00:00:00Z",
  );
  await index.upsertOpening(sampleOpening({ board_token: "rentman" }));

  const queue = await index.listBoardSeedRefreshQueue();
  expect(queue).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        board_token: "rentman",
        has_openings: true,
        updated_at: "2026-08-01T00:00:00Z",
      }),
      expect.objectContaining({
        board_token: "empty-co",
        has_openings: false,
        updated_at: "2026-07-01T00:00:00Z",
      }),
    ]),
  );

  const loaded = await loadBoardSeedsForOpeningRefresh(index, { maxSeeds: 1 });
  expect(loaded.total).toBe(2);
  expect(loaded.selected.map((row) => row.board_token)).toEqual(["rentman"]);
});

function sampleOpening(
  partial: Partial<OpeningRecord> & Pick<OpeningRecord, "board_token">,
): OpeningRecord {
  return {
    identity: `ashby:${partial.board_token}:post-1`,
    primary_url: `https://example.com/jobs/${partial.board_token}`,
    careers_url: `https://example.com/jobs/${partial.board_token}`,
    ats_url: null,
    title: "Engineer",
    location: null,
    jd_extract: null,
    source_class: "ats_board",
    honesty_salary: "unknown",
    honesty_dutch_required: "unknown",
    honesty_sponsorship_willingness: "unknown",
    register_name: "Example B.V.",
    register_kvk: "60733144",
    register_join_strength: "exact_kvk",
    ats_family: "ashby",
    posting_id: "post-1",
    ...partial,
  };
}
