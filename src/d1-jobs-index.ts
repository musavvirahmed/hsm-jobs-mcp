import {
  EMPTY_COVERAGE_NOTE,
  emptyPartialSnapshot,
  type HonestyDutchRequired,
  type IndexPass,
  type IndexSnapshot,
  type JobsIndex,
  type OpeningRecord,
  type RegisterJoinStrength,
  type SearchOpeningsArgs,
  type SourceClass,
  type SponsorshipWillingness,
  type TerminalCareersOutcome,
  type WritableJobsIndex,
} from "./jobs-index";

/** Narrow D1 surface so the adapter does not depend on Workers types at the jobs-tools seam. */
export type JobsIndexDatabase = {
  prepare(query: string): D1Statement;
};

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
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

type OpeningRow = {
  identity: string;
  primary_url: string;
  careers_url: string | null;
  ats_url: string | null;
  title: string;
  location: string | null;
  jd_extract: string | null;
  source_class: SourceClass;
  honesty_salary: string;
  honesty_dutch_required: string;
  honesty_sponsorship_willingness: SponsorshipWillingness;
  register_name: string | null;
  register_kvk: string | null;
  register_join_strength: RegisterJoinStrength | null;
  ats_family: string | null;
  board_token: string | null;
  posting_id: string | null;
};

const OPENING_COLUMNS = `identity, primary_url, careers_url, ats_url, title, location, jd_extract,
       source_class, honesty_salary, honesty_dutch_required, honesty_sponsorship_willingness,
       register_name, register_kvk, register_join_strength, ats_family, board_token, posting_id`;

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
        .prepare(
          `SELECT COUNT(*) AS n FROM (
             SELECT kvk FROM terminal_careers_outcomes
             UNION
             SELECT kvk FROM official_websites
           )`,
        )
        .first<CountRow>();
      const withOpenings = await db
        .prepare("SELECT COUNT(*) AS n FROM terminal_careers_outcomes WHERE outcome = 'openings_indexed'")
        .first<CountRow>();
      const pass = meta.pass === "full_careers_pass" ? "full_careers_pass" : "partial";
      const lastSuccessfulCrawl = meta.last_successful_crawl;
      return {
        jobs_count: Number(jobs?.n ?? 0),
        last_successful_crawl: lastSuccessfulCrawl,
        stale: lastSuccessfulCrawl === null,
        coverage_note: EMPTY_COVERAGE_NOTE,
        source_policy: meta.source_policy,
        register_join_note: meta.register_join_note,
        index_scope: {
          pass,
          sponsors_attempted: Number(attempted?.n ?? 0),
          sponsors_with_openings: Number(withOpenings?.n ?? 0),
          register_size: meta.register_size,
          register_as_of: meta.register_as_of,
          omissions_possible: pass === "partial",
        },
      };
    },
    async searchOpenings(args: SearchOpeningsArgs) {
      const result = await db
        .prepare(
          `SELECT ${OPENING_COLUMNS}
           FROM openings
           WHERE (?1 IS NULL OR register_kvk = ?1)
             AND (?2 IS NULL OR location LIKE '%' || ?2 || '%' COLLATE NOCASE)
             AND (
               ?3 IS NULL
               OR title LIKE '%' || ?3 || '%' COLLATE NOCASE
             )
           ORDER BY
             CASE WHEN ?3 IS NOT NULL AND title LIKE '%' || ?3 || '%' COLLATE NOCASE THEN 0 ELSE 1 END,
             title COLLATE NOCASE
           LIMIT ?4`,
        )
        .bind(args.kvk ?? null, args.location ?? null, args.query ?? null, args.limit)
        .all<OpeningRow>();
      return result.results.map(openingFromRow);
    },
    async getOpening(primaryUrl: string) {
      const row = await db
        .prepare(`SELECT ${OPENING_COLUMNS} FROM openings WHERE primary_url = ?`)
        .bind(primaryUrl)
        .first<OpeningRow>();
      return row ? openingFromRow(row) : null;
    },
  };
}

type OutcomeRow = {
  kvk: string;
  outcome: TerminalCareersOutcome["outcome"];
  official_website_host: string | null;
  updated_at: string;
};

type OfficialWebsiteRow = { host: string };

type OverrideRow = { mode: "pin" | "force_unresolved"; pin_host: string | null };

export function createD1WritableJobsIndex(db: JobsIndexDatabase): WritableJobsIndex {
  const readable = createD1JobsIndex(db);
  return {
    snapshot: () => readable.snapshot(),
    searchOpenings: (args) => readable.searchOpenings(args),
    getOpening: (primaryUrl) => readable.getOpening(primaryUrl),
    async recordWebsiteResolution(input) {
      if (input.official_website_host) {
        await db
          .prepare(
            `INSERT INTO official_websites (kvk, host, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(kvk) DO UPDATE SET host = excluded.host, updated_at = excluded.updated_at`,
          )
          .bind(input.kvk, input.official_website_host, input.now)
          .run();
        await db
          .prepare(
            `DELETE FROM terminal_careers_outcomes WHERE kvk = ?1 AND outcome = 'unresolved_website'`,
          )
          .bind(input.kvk)
          .run();
        return;
      }
      await db.prepare("DELETE FROM official_websites WHERE kvk = ?1").bind(input.kvk).run();
      const existing = await db
        .prepare("SELECT outcome FROM terminal_careers_outcomes WHERE kvk = ?1")
        .bind(input.kvk)
        .first<{ outcome: string }>();
      if (existing && existing.outcome !== "unresolved_website" && !input.replaceClosed) {
        return;
      }
      await db
        .prepare(
          `INSERT INTO terminal_careers_outcomes (kvk, outcome, official_website_host, updated_at)
           VALUES (?1, 'unresolved_website', NULL, ?2)
           ON CONFLICT(kvk) DO UPDATE SET
             outcome = 'unresolved_website',
             official_website_host = NULL,
             updated_at = excluded.updated_at`,
        )
        .bind(input.kvk, input.now)
        .run();
    },
    async getOfficialWebsite(kvk) {
      const row = await db
        .prepare("SELECT host FROM official_websites WHERE kvk = ?1")
        .bind(kvk)
        .first<OfficialWebsiteRow>();
      return row?.host ?? null;
    },
    async getTerminalOutcome(kvk) {
      const row = await db
        .prepare(
          `SELECT kvk, outcome, official_website_host, updated_at
           FROM terminal_careers_outcomes WHERE kvk = ?1`,
        )
        .bind(kvk)
        .first<OutcomeRow>();
      return row ?? null;
    },
    async setWebsiteOverride(kvk, override, now) {
      const pinHost = override.mode === "pin" ? override.host : null;
      await db
        .prepare(
          `INSERT INTO website_overrides (kvk, mode, pin_host, updated_at) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(kvk) DO UPDATE SET
             mode = excluded.mode,
             pin_host = excluded.pin_host,
             updated_at = excluded.updated_at`,
        )
        .bind(kvk, override.mode, pinHost, now)
        .run();
      return;
    },
    async getWebsiteOverride(kvk) {
      const row = await db
        .prepare("SELECT mode, pin_host FROM website_overrides WHERE kvk = ?1")
        .bind(kvk)
        .first<OverrideRow>();
      if (!row) return null;
      if (row.mode === "pin") {
        if (!row.pin_host) return null;
        return { mode: "pin", host: row.pin_host };
      }
      return { mode: "force_unresolved" };
    },
    async setRegisterMeta(meta) {
      await db
        .prepare(
          `UPDATE index_meta
           SET register_size = ?1, register_as_of = ?2
           WHERE singleton = 1`,
        )
        .bind(meta.register_size, meta.register_as_of)
        .run();
    },
  };
}

function openingFromRow(row: OpeningRow): OpeningRecord {
  return {
    identity: row.identity,
    primary_url: row.primary_url,
    careers_url: row.careers_url,
    ats_url: row.ats_url,
    title: row.title,
    location: row.location,
    jd_extract: row.jd_extract,
    source_class: row.source_class,
    honesty_salary: row.honesty_salary,
    honesty_dutch_required: parseDutchRequired(row.honesty_dutch_required),
    honesty_sponsorship_willingness: row.honesty_sponsorship_willingness,
    register_name: row.register_name,
    register_kvk: row.register_kvk,
    register_join_strength: row.register_join_strength ?? "unmatched",
    ats_family: row.ats_family,
    board_token: row.board_token,
    posting_id: row.posting_id,
  };
}

function parseDutchRequired(value: string): HonestyDutchRequired {
  if (value === "true") return true;
  if (value === "false") return false;
  return "unknown";
}
