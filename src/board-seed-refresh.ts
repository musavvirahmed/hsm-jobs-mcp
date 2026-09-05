import type { BoardSeed, WritableJobsIndex } from "./jobs-index";

/** Fits the production `opening-refresh` 90m budget with sequential, polite fetches. */
export const DEFAULT_CRAWL_REFRESH_MAX_SEEDS = 400;

export type BoardSeedRefreshRow = BoardSeed & {
  updated_at: string;
  has_openings: boolean;
};

/**
 * Daily Opening refresh is a bounded queue, same shape as `CRAWL_MAX_ATTEMPTS`
 * catch-up: never special-case a company. Live boards (those with Openings)
 * go first so vanished postings close on the daily clock. Remaining seeds
 * (including empty boards that may later grow jobs) follow least-recently
 * refreshed. A cap keeps one invocation inside Actions timeouts; the next
 * run continues because refresh bumps `board_seeds.updated_at`.
 *
 * `maxSeeds` 0 / Infinity means the whole table (operator full sweep).
 */
export function selectBoardSeedsForOpeningRefresh(input: {
  seeds: BoardSeedRefreshRow[];
  maxSeeds: number;
}): BoardSeedRefreshRow[] {
  const cap =
    !Number.isFinite(input.maxSeeds) || input.maxSeeds <= 0
      ? input.seeds.length
      : Math.floor(input.maxSeeds);
  const hot = input.seeds.filter((row) => row.has_openings).sort(compareRefreshQueue);
  const cold = input.seeds.filter((row) => !row.has_openings).sort(compareRefreshQueue);
  return [...hot, ...cold].slice(0, cap);
}

export function parseCrawlRefreshMaxSeeds(
  raw: string | undefined,
  fallback = DEFAULT_CRAWL_REFRESH_MAX_SEEDS,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (raw.trim() === "0") return Number.POSITIVE_INFINITY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export async function loadBoardSeedsForOpeningRefresh(
  index: WritableJobsIndex,
  opts?: { maxSeeds?: number },
): Promise<{ selected: BoardSeed[]; total: number; maxSeeds: number }> {
  const maxSeeds = opts?.maxSeeds ?? parseCrawlRefreshMaxSeeds(process.env.CRAWL_REFRESH_MAX_SEEDS);
  const seeds = await index.listBoardSeedRefreshQueue();
  const selected = selectBoardSeedsForOpeningRefresh({ seeds, maxSeeds });
  return {
    selected: selected.map(({ kvk, ats_family, board_token, public_board_feed_url }) => ({
      kvk,
      ats_family,
      board_token,
      public_board_feed_url,
    })),
    total: seeds.length,
    maxSeeds,
  };
}

function compareRefreshQueue(a: BoardSeedRefreshRow, b: BoardSeedRefreshRow): number {
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? -1 : 1;
  if (a.kvk !== b.kvk) return a.kvk < b.kvk ? -1 : 1;
  return a.ats_family < b.ats_family ? -1 : a.ats_family > b.ats_family ? 1 : 0;
}
