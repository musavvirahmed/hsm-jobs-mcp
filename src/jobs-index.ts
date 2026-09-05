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

export type RegisterJoinStrength = "exact_kvk" | "strong_name" | "weak" | "unmatched";
export type SourceClass = "careers_site" | "ats_board" | "aggregator" | "unknown";
export type SponsorshipWillingness = "stated_yes" | "stated_no" | "unknown";
export type HonestyDutchRequired = boolean | "unknown";

export type RegisterJoin = {
  name: string | null;
  kvk: string | null;
  strength: RegisterJoinStrength;
};

export type OpeningRecord = {
  identity: string;
  primary_url: string;
  careers_url: string | null;
  ats_url: string | null;
  title: string;
  location: string | null;
  jd_extract: string | null;
  source_class: SourceClass;
  honesty_salary: string;
  honesty_dutch_required: HonestyDutchRequired;
  honesty_sponsorship_willingness: SponsorshipWillingness;
  register_name: string | null;
  register_kvk: string | null;
  register_join_strength: RegisterJoinStrength;
  ats_family: string | null;
  board_token: string | null;
  posting_id: string | null;
};

export interface JobsIndex {
  snapshot(): Promise<IndexSnapshot>;
  searchOpenings(args: SearchOpeningsArgs): Promise<OpeningRecord[]>;
  getOpening(primaryUrl: string): Promise<OpeningRecord | null>;
}

export type TerminalCareersOutcomeKind =
  | "openings_indexed"
  | "unresolved_website"
  | "no_careers_site"
  | "no_matching_public_board"
  | "blocked"
  | "unsupported_extractor";

export type TerminalCareersOutcome = {
  kvk: string;
  outcome: TerminalCareersOutcomeKind;
  official_website_host: string | null;
  updated_at: string;
};

export type WebsiteOverride =
  | { mode: "pin"; host: string }
  | { mode: "force_unresolved" };

export type BoardSeed = {
  kvk: string;
  ats_family: string;
  board_token: string;
  public_board_feed_url: string | null;
};

/** Operator/ingest write plane. Jobs tools remain read-only against `JobsIndex`. */
export interface WritableJobsIndex extends JobsIndex {
  recordWebsiteResolution(input: {
    kvk: string;
    official_website_host: string | null;
    now: string;
    replaceClosed?: boolean;
  }): Promise<void>;
  getOfficialWebsite(kvk: string): Promise<string | null>;
  getTerminalOutcome(kvk: string): Promise<TerminalCareersOutcome | null>;
  /** All KvKs that already have a recorded terminal careers outcome (one round-trip). */
  listTerminalOutcomeKvks(): Promise<string[]>;
  recordTerminalOutcome(input: {
    kvk: string;
    outcome: TerminalCareersOutcomeKind;
    official_website_host: string | null;
    now: string;
  }): Promise<void>;
  setWebsiteOverride(kvk: string, override: WebsiteOverride, now: string): Promise<void>;
  getWebsiteOverride(kvk: string): Promise<WebsiteOverride | null>;
  setBoardSeed(seed: BoardSeed, now: string): Promise<void>;
  listBoardSeeds(): Promise<BoardSeed[]>;
  /** Seeds plus `updated_at` and whether that board currently has Openings. */
  listBoardSeedRefreshQueue(): Promise<
    Array<BoardSeed & { updated_at: string; has_openings: boolean }>
  >;
  listOpeningsByBoard(atsFamily: string, boardToken: string): Promise<OpeningRecord[]>;
  listOpeningsByKvk(kvk: string): Promise<OpeningRecord[]>;
  removeOpening(identity: string): Promise<void>;
  recordBoardGuessMiss(input: {
    kvk: string;
    ats_family: string;
    board_token: string;
    official_website_host: string;
    now: string;
  }): Promise<void>;
  hasBoardGuessMiss(input: {
    kvk: string;
    ats_family: string;
    board_token: string;
    official_website_host: string;
  }): Promise<boolean>;
  clearBoardGuessMisses(kvk: string): Promise<void>;
  setRegisterMeta(meta: {
    register_size: number;
    register_as_of: string | null;
  }): Promise<void>;
  setLastSuccessfulCrawl(now: string): Promise<void>;
  setPass(pass: IndexPass): Promise<void>;
  getCrawlFailureStreak(): Promise<number>;
  setCrawlFailureStreak(streak: number): Promise<void>;
  upsertOpening(opening: OpeningRecord): Promise<void>;
}

export const EMPTY_COVERAGE_NOTE =
  "Jobs index is a partial index; a full careers pass is required before empty results can be treated as complete.";
export const FULL_COVERAGE_NOTE =
  "Full Work-register coverage: every current Work-register sponsor has been checked. An empty search means no title/location match in the index.";
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

export type MemoryJobsIndexSeed = {
  openings?: OpeningRecord[];
  snapshot?: IndexSnapshot;
};

function matchesSearch(opening: OpeningRecord, args: SearchOpeningsArgs): boolean {
  if (args.kvk !== undefined && opening.register_kvk !== args.kvk) {
    return false;
  }
  if (args.location !== undefined) {
    if (!opening.location || !containsInsensitive(opening.location, args.location)) {
      return false;
    }
  }
  if (args.query !== undefined && !containsInsensitive(opening.title, args.query)) {
    return false;
  }
  return true;
}

function rankSearchHits(openings: OpeningRecord[], query: string | undefined): OpeningRecord[] {
  if (query === undefined) {
    return [...openings].sort((a, b) => a.title.localeCompare(b.title));
  }
  return [...openings].sort((a, b) => {
    const aTitle = containsInsensitive(a.title, query) ? 0 : 1;
    const bTitle = containsInsensitive(b.title, query) ? 0 : 1;
    if (aTitle !== bTitle) {
      return aTitle - bTitle;
    }
    return a.title.localeCompare(b.title);
  });
}

export function registerJoinFromOpening(opening: OpeningRecord): RegisterJoin {
  return {
    name: opening.register_name,
    kvk: opening.register_kvk,
    strength: opening.register_join_strength,
  };
}

function containsInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function createMemoryJobsIndex(seed: MemoryJobsIndexSeed = {}): JobsIndex {
  const openings = seed.openings ?? [];
  const snapshot = seed.snapshot ?? emptyPartialSnapshot();
  return {
    snapshot: async () => snapshot,
    searchOpenings: async (args) => {
      const matched = openings.filter((opening) => matchesSearch(opening, args));
      return rankSearchHits(matched, args.query).slice(0, args.limit);
    },
    getOpening: async (primaryUrl) =>
      openings.find((opening) => opening.primary_url === primaryUrl) ?? null,
  };
}
