import { expect, test } from "vitest";
import {
  parseCrawlRefreshMaxSeeds,
  selectBoardSeedsForOpeningRefresh,
  type BoardSeedRefreshRow,
} from "../src/board-seed-refresh";

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
