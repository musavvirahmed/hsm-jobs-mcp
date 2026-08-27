import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createD1WritableJobsIndex, type JobsIndexDatabase } from "./d1-jobs-index";
import type { WritableJobsIndex } from "./jobs-index";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

/** Local/operator sqlite jobs index (same migrations as D1). */
export function createSqliteWritableJobsIndex(path = ":memory:"): WritableJobsIndex {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new DatabaseSync(path);
  applyMigrations(sqlite);
  return createD1WritableJobsIndex(wrapSqlite(sqlite));
}

/** In-memory writable jobs index for tests. */
export function createEmptyWritableJobsIndex(): WritableJobsIndex {
  return createSqliteWritableJobsIndex(":memory:");
}

function applyMigrations(sqlite: DatabaseSync): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY
    );
  `);
  const applied = new Set(
    (
      sqlite.prepare("SELECT filename FROM schema_migrations").all() as Array<{ filename: string }>
    ).map((row) => row.filename),
  );
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (applied.has(file)) continue;
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    sqlite.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(file);
  }
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
        async run() {
          if (bound.length) statement.run(...bound);
          else statement.run();
          return { success: true };
        },
      };
      return api;
    },
  };
}

export function sqliteIndexPathFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.CRAWL_INDEX_PATH?.trim() || ":memory:";
}
