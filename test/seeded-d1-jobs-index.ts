import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createD1JobsIndex, type JobsIndexDatabase } from "../src/d1-jobs-index";
import { FIXTURE_OPENINGS, FIXTURE_SNAPSHOT } from "../src/fixtures/jobs-index";
import type { JobsIndex, OpeningRecord } from "../src/jobs-index";

const MIGRATION_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations/0001_jobs_index.sql",
);

const TERMINAL_OUTCOMES: Array<{ kvk: string; outcome: string }> = [
  { kvk: "60733144", outcome: "openings_indexed" },
  { kvk: "11111111", outcome: "openings_indexed" },
  { kvk: "22222222", outcome: "openings_indexed" },
  { kvk: "20152449", outcome: "openings_indexed" },
  { kvk: "33333333", outcome: "unresolved_website" },
  { kvk: "44444444", outcome: "no_careers_site" },
  { kvk: "55555555", outcome: "no_matching_public_board" },
  { kvk: "66666666", outcome: "blocked" },
];

export function createSeededD1JobsIndex(): JobsIndex {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(MIGRATION_PATH, "utf8"));
  sqlite
    .prepare(
      `UPDATE index_meta SET
         pass = ?,
         register_size = ?,
         register_as_of = ?,
         last_successful_crawl = ?,
         source_policy = ?,
         register_join_note = ?
       WHERE singleton = 1`,
    )
    .run(
      FIXTURE_SNAPSHOT.index_scope.pass,
      FIXTURE_SNAPSHOT.index_scope.register_size,
      FIXTURE_SNAPSHOT.index_scope.register_as_of,
      FIXTURE_SNAPSHOT.last_successful_crawl,
      FIXTURE_SNAPSHOT.source_policy,
      FIXTURE_SNAPSHOT.register_join_note,
    );

  const insertOpening = sqlite.prepare(
    `INSERT INTO openings (
       identity, primary_url, careers_url, ats_url, title, location, jd_extract,
       source_class, honesty_salary, honesty_dutch_required, honesty_sponsorship_willingness,
       register_name, register_kvk, register_join_strength, ats_family, board_token, posting_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const opening of FIXTURE_OPENINGS) {
    insertOpening.run(...openingBindValues(opening));
  }

  const insertOutcome = sqlite.prepare(
    `INSERT INTO terminal_careers_outcomes (kvk, outcome, official_website_host, updated_at)
     VALUES (?, ?, NULL, '2026-08-26T00:00:00Z')`,
  );
  for (const row of TERMINAL_OUTCOMES) {
    insertOutcome.run(row.kvk, row.outcome);
  }

  return createD1JobsIndex(wrapSqlite(sqlite));
}

function openingBindValues(opening: OpeningRecord): SQLInputValue[] {
  return [
    opening.identity,
    opening.primary_url,
    opening.careers_url,
    opening.ats_url,
    opening.title,
    opening.location,
    opening.jd_extract,
    opening.source_class,
    opening.honesty_salary,
    dutchToSql(opening.honesty_dutch_required),
    opening.honesty_sponsorship_willingness,
    opening.register_name,
    opening.register_kvk,
    opening.register_join_strength,
    opening.ats_family,
    opening.board_token,
    opening.posting_id,
  ];
}

function dutchToSql(value: OpeningRecord["honesty_dutch_required"]): string {
  if (value === true) return "true";
  if (value === false) return "false";
  return "unknown";
}

function wrapSqlite(db: DatabaseSync): JobsIndexDatabase {
  return {
    prepare(query: string) {
      const statement = db.prepare(query);
      let bound: SQLInputValue[] = [];
      const api = {
        bind(...values: unknown[]) {
          bound = values as SQLInputValue[];
          return api;
        },
        async first<T = Record<string, unknown>>() {
          const row = bound.length ? statement.get(...bound) : statement.get();
          return (row as T | undefined) ?? null;
        },
        async all<T = Record<string, unknown>>() {
          const rows = bound.length ? statement.all(...bound) : statement.all();
          return { results: rows as T[] };
        },
      };
      return api;
    },
  };
}
