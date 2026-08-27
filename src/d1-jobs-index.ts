import {
  EMPTY_COVERAGE_NOTE,
  emptyPartialSnapshot,
  type IndexPass,
  type IndexSnapshot,
  type JobsIndex,
  type SearchOpeningsArgs,
} from "./jobs-index";

/** Narrow D1 surface so the adapter does not depend on Workers types at the jobs-tools seam. */
export type JobsIndexDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): D1Statement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  };
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};

type MetaRow = {
  pass: IndexPass;
  register_size: number;
  register_as_of: string | null;
  last_successful_crawl: string | null;
  source_policy: string;
  register_join_note: string;
};

type CountRow = { n: number };

export function createD1JobsIndex(db: JobsIndexDatabase): JobsIndex {
  return {
    async snapshot(): Promise<IndexSnapshot> {
      const meta = await db
        .prepare(
          `SELECT pass, register_size, register_as_of, last_successful_crawl, source_policy, register_join_note
           FROM index_meta WHERE singleton = 1`,
        )
        .first<MetaRow>();
      if (!meta) {
        return emptyPartialSnapshot();
      }
      const jobs = await db.prepare("SELECT COUNT(*) AS n FROM openings").first<CountRow>();
      const attempted = await db
        .prepare("SELECT COUNT(*) AS n FROM terminal_careers_outcomes")
        .first<CountRow>();
      const withOpenings = await db
        .prepare("SELECT COUNT(*) AS n FROM terminal_careers_outcomes WHERE outcome = 'openings_indexed'")
        .first<CountRow>();
      const pass = meta.pass === "full_careers_pass" ? "full_careers_pass" : "partial";
      const lastSuccessfulCrawl = meta.last_successful_crawl;
      return {
        jobs_count: jobs?.n ?? 0,
        last_successful_crawl: lastSuccessfulCrawl,
        stale: lastSuccessfulCrawl === null,
        coverage_note: EMPTY_COVERAGE_NOTE,
        source_policy: meta.source_policy,
        register_join_note: meta.register_join_note,
        index_scope: {
          pass,
          sponsors_attempted: attempted?.n ?? 0,
          sponsors_with_openings: withOpenings?.n ?? 0,
          register_size: meta.register_size,
          register_as_of: meta.register_as_of,
          omissions_possible: pass === "partial",
        },
      };
    },
    async searchOpenings(args: SearchOpeningsArgs) {
      const result = await db
        .prepare("SELECT primary_url FROM openings LIMIT ?")
        .bind(args.limit)
        .all<{ primary_url: string }>();
      return result.results;
    },
    async getOpening(primaryUrl: string) {
      const row = await db
        .prepare("SELECT primary_url FROM openings WHERE primary_url = ?")
        .bind(primaryUrl)
        .first<{ primary_url: string }>();
      return row ?? null;
    },
  };
}
