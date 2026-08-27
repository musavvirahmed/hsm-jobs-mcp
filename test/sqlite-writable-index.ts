import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createD1WritableJobsIndex, type JobsIndexDatabase } from "../src/d1-jobs-index";
import type { WritableJobsIndex } from "../src/jobs-index";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export function createEmptyWritableJobsIndex(): WritableJobsIndex {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return createD1WritableJobsIndex(wrapSqlite(sqlite));
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
