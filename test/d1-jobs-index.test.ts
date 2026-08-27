import { expect, test } from "vitest";
import { createD1JobsIndex, type JobsIndexDatabase } from "../src/d1-jobs-index";
import { getIndexStatus } from "../src/jobs-tools";
import { createStubHsmMcp } from "../src/hsm-mcp";

function emptyJobsIndexDb(): JobsIndexDatabase {
  return {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first<T = Record<string, unknown>>() {
          if (sql.includes("FROM index_meta")) {
            return {
              pass: "partial",
              register_size: 0,
              register_as_of: null,
              last_successful_crawl: null,
              source_policy: "first-party careers/ATS only",
              register_join_note:
                "Hybrid KvK re-validation via upstream hsm-mcp at query time; last-known join plus visible stale/error on degrade.",
            } as T;
          }
          if (sql.includes("COUNT(*)")) {
            return { n: 0 } as T;
          }
          return null;
        },
        async all<T = Record<string, unknown>>() {
          return { results: [] as T[] };
        },
      };
      return statement;
    },
  };
}

test("get_index_status against an empty D1 jobs index matches the partial empty snapshot", async () => {
  const result = await getIndexStatus({
    jobsIndex: createD1JobsIndex(emptyJobsIndexDb()),
    hsmMcp: createStubHsmMcp(),
  });
  expect(result.jobs_count).toBe(0);
  expect(result.stale).toBe(true);
  expect(result.index_scope).toEqual({
    pass: "partial",
    sponsors_attempted: 0,
    sponsors_with_openings: 0,
    register_size: 0,
    register_as_of: null,
    omissions_possible: true,
  });
});
