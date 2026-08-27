export type IndexPass = "partial" | "full_careers_pass";

export type IndexScope = {
  pass: IndexPass;
  sponsors_attempted: number;
  sponsors_with_openings: number;
  register_size: number;
  register_as_of: string | null;
  omissions_possible: boolean;
};

export type IndexSnapshot = {
  jobs_count: number;
  last_successful_crawl: string | null;
  stale: boolean;
  coverage_note: string;
  source_policy: string;
  register_join_note: string;
  index_scope: IndexScope;
};

export type SearchOpeningsArgs = {
  query?: string;
  kvk?: string;
  location?: string;
  limit: number;
};

export interface JobsIndex {
  snapshot(): Promise<IndexSnapshot>;
  searchOpenings(args: SearchOpeningsArgs): Promise<unknown[]>;
  getOpening(primaryUrl: string): Promise<unknown | null>;
}

export const EMPTY_COVERAGE_NOTE =
  "Jobs index is a partial index; a full careers pass is required before empty results can be treated as complete.";
export const SOURCE_POLICY = "first-party careers/ATS only";
export const REGISTER_JOIN_NOTE =
  "Hybrid KvK re-validation via upstream hsm-mcp at query time; last-known join plus visible stale/error on degrade.";

export function emptyPartialSnapshot(): IndexSnapshot {
  return {
    jobs_count: 0,
    last_successful_crawl: null,
    stale: true,
    coverage_note: EMPTY_COVERAGE_NOTE,
    source_policy: SOURCE_POLICY,
    register_join_note: REGISTER_JOIN_NOTE,
    index_scope: {
      pass: "partial",
      sponsors_attempted: 0,
      sponsors_with_openings: 0,
      register_size: 0,
      register_as_of: null,
      omissions_possible: true,
    },
  };
}

export function createMemoryJobsIndex(): JobsIndex {
  return {
    snapshot: async () => emptyPartialSnapshot(),
    searchOpenings: async () => [],
    getOpening: async () => null,
  };
}
