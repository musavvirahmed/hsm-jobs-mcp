import { ashbyBoardFeedUrl, parseAshbyBoard, type BoardFeedResponse } from "./ashby-board";
import { extractHonesty } from "./honesty";
import type { BoardSeed, OpeningRecord, RegisterJoinStrength, WritableJobsIndex } from "./jobs-index";
import type { RegisterSource, RegisterSponsor } from "./register-source";
import {
  resolveOfficialWebsite,
  type PageGetResult,
  type ResolvedVia,
  type WebsiteResolutionProviders,
} from "./website-resolution";

export type { WebsiteResolutionProviders } from "./website-resolution";
export type { BoardFeedResponse } from "./ashby-board";

export const RENTMAN_ASHBY_BOARD_SEED: BoardSeed = {
  kvk: "60733144",
  ats_family: "ashby",
  board_token: "rentman",
  public_board_feed_url: ashbyBoardFeedUrl("rentman"),
};

export type WebsiteIngestResult = {
  kvk: string;
  name: string;
  official_website_host: string | null;
  terminal_outcome: "unresolved_website" | null;
  resolved_via: ResolvedVia;
};

export type WebsiteIngestReport = {
  results: WebsiteIngestResult[];
};

export type OpeningDraft = Omit<
  OpeningRecord,
  "honesty_salary" | "honesty_dutch_required" | "honesty_sponsorship_willingness"
> & {
  /** Structured ATS compensation only. Not FAQ, culture, or company visa pages. */
  ats_compensation?: string | null;
  /** Other structured ATS fields (language, visa, eligibility) joined as text. */
  ats_structured_fields?: string | null;
};

export function openingFromDraft(draft: OpeningDraft): OpeningRecord {
  const { ats_compensation, ats_structured_fields, ...stored } = draft;
  return {
    ...stored,
    ...extractHonesty({
      jdBody: draft.jd_extract,
      atsCompensation: ats_compensation ?? null,
      atsStructuredFields: ats_structured_fields ?? null,
    }),
  };
}

export async function ingestOpening(
  index: WritableJobsIndex,
  draft: OpeningDraft,
): Promise<OpeningRecord> {
  const opening = openingFromDraft(draft);
  await index.upsertOpening(opening);
  return opening;
}

export async function ingestWebsiteResolutions(opts: {
  register: RegisterSource;
  index: WritableJobsIndex;
  providers: WebsiteResolutionProviders;
  now?: () => string;
}): Promise<WebsiteIngestReport> {
  const now = opts.now ?? (() => new Date().toISOString());
  const stamp = now();
  const register = await opts.register.load();
  const results: WebsiteIngestResult[] = [];

  for (const sponsor of register.sponsors) {
    const override = await opts.index.getWebsiteOverride(sponsor.kvk);
    const resolved = await resolveOfficialWebsite(sponsor, opts.providers, override);
    await opts.index.recordWebsiteResolution({
      kvk: sponsor.kvk,
      official_website_host: resolved.official_website_host,
      now: stamp,
      replaceClosed: resolved.resolved_via === "override_force_unresolved",
    });
    results.push({
      kvk: sponsor.kvk,
      name: sponsor.name,
      official_website_host: resolved.official_website_host,
      terminal_outcome: resolved.official_website_host ? null : "unresolved_website",
      resolved_via: resolved.resolved_via,
    });
  }

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });

  return { results };
}

export type BoardIngestResult = {
  kvk: string;
  ats_family: string;
  board_token: string;
  status: "indexed" | "fetch_failed" | "unsupported_family";
  openings_written: number;
  openings_removed: number;
};

export type BoardIngestReport = {
  results: BoardIngestResult[];
};

export async function ingestFromBoardSeeds(opts: {
  register: RegisterSource;
  index: WritableJobsIndex;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  getPage: WebsiteResolutionProviders["getPage"];
  now?: () => string;
}): Promise<BoardIngestReport> {
  const now = opts.now ?? (() => new Date().toISOString());
  const stamp = now();
  const register = await opts.register.load();
  const sponsors = new Map(register.sponsors.map((row) => [row.kvk, row]));
  const seeds = await opts.index.listBoardSeeds();
  const results: BoardIngestResult[] = [];
  let anySuccess = false;

  for (const seed of seeds) {
    const result = await ingestOneBoardSeed({
      seed,
      sponsor: sponsors.get(seed.kvk) ?? null,
      index: opts.index,
      fetchBoardFeed: opts.fetchBoardFeed,
      getPage: opts.getPage,
      stamp,
    });
    results.push(result);
    if (result.status === "indexed") anySuccess = true;
  }

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });
  if (anySuccess) {
    await opts.index.setLastSuccessfulCrawl(stamp);
  }

  return { results };
}

async function ingestOneBoardSeed(opts: {
  seed: BoardSeed;
  sponsor: RegisterSponsor | null;
  index: WritableJobsIndex;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  getPage: WebsiteResolutionProviders["getPage"];
  stamp: string;
}): Promise<BoardIngestResult> {
  const { seed, sponsor, index, stamp } = opts;
  if (seed.ats_family !== "ashby") {
    return {
      kvk: seed.kvk,
      ats_family: seed.ats_family,
      board_token: seed.board_token,
      status: "unsupported_family",
      openings_written: 0,
      openings_removed: 0,
    };
  }

  const feedUrl = seed.public_board_feed_url ?? ashbyBoardFeedUrl(seed.board_token);
  const fetched = await opts.fetchBoardFeed(feedUrl);
  if (!fetched.ok) {
    return {
      kvk: seed.kvk,
      ats_family: seed.ats_family,
      board_token: seed.board_token,
      status: "fetch_failed",
      openings_written: 0,
      openings_removed: 0,
    };
  }

  const parsed = parseAshbyBoard(fetched.body);
  if (!parsed) {
    return {
      kvk: seed.kvk,
      ats_family: seed.ats_family,
      board_token: seed.board_token,
      status: "fetch_failed",
      openings_written: 0,
      openings_removed: 0,
    };
  }

  const officialHost = await index.getOfficialWebsite(seed.kvk);
  const join = registerJoinAtIndexTime(sponsor);
  const seen = new Set<string>();
  let written = 0;

  for (const job of parsed.jobs) {
    const identity = `${seed.ats_family}:${seed.board_token}:${job.id}`;
    seen.add(identity);
    const careersUrl = officialHost
      ? await careersUrlIfLive(officialHost, job.title, opts.getPage)
      : null;
    const primaryUrl = careersUrl ?? job.jobUrl;
    await ingestOpening(index, {
      identity,
      primary_url: primaryUrl,
      careers_url: careersUrl,
      ats_url: job.jobUrl,
      title: job.title,
      location: job.location,
      jd_extract: job.descriptionPlain,
      source_class: "ats_board",
      register_name: join.name,
      register_kvk: join.kvk,
      register_join_strength: join.strength,
      ats_family: seed.ats_family,
      board_token: seed.board_token,
      posting_id: job.id,
      ats_compensation: job.compensationSummary,
    });
    written += 1;
  }

  const existing = await index.listOpeningsByBoard(seed.ats_family, seed.board_token);
  let removed = 0;
  for (const opening of existing) {
    if (!seen.has(opening.identity)) {
      await index.removeOpening(opening.identity);
      removed += 1;
    }
  }

  if (written > 0) {
    await index.recordTerminalOutcome({
      kvk: seed.kvk,
      outcome: "openings_indexed",
      official_website_host: officialHost,
      now: stamp,
    });
  }

  return {
    kvk: seed.kvk,
    ats_family: seed.ats_family,
    board_token: seed.board_token,
    status: "indexed",
    openings_written: written,
    openings_removed: removed,
  };
}

function registerJoinAtIndexTime(
  sponsor: RegisterSponsor | null,
): { name: string | null; kvk: string | null; strength: RegisterJoinStrength } {
  if (sponsor) {
    return { name: sponsor.name, kvk: sponsor.kvk, strength: "exact_kvk" };
  }
  return { name: null, kvk: null, strength: "unmatched" };
}

async function careersUrlIfLive(
  officialHost: string,
  title: string,
  getPage: WebsiteResolutionProviders["getPage"],
): Promise<string | null> {
  const slug = titleSlug(title);
  if (!slug) return null;
  const candidate = `https://${officialHost}/jobs/${slug}`;
  const page = await getPage(candidate);
  if (!pageResolvesToPosting(page, officialHost, title)) return null;
  return candidate;
}

function pageResolvesToPosting(
  page: PageGetResult | null,
  officialHost: string,
  title: string,
): boolean {
  if (!page || !page.tlsValid) return false;
  if (page.status < 200 || page.status >= 400) return false;
  if (!hostBelongsToOfficial(hostnameOf(page.finalUrl), officialHost)) return false;
  return page.bodyText.toLowerCase().includes(title.toLowerCase());
}

function hostBelongsToOfficial(finalHost: string | null, officialHost: string): boolean {
  if (!finalHost) return false;
  const host = finalHost.toLowerCase();
  const official = officialHost.toLowerCase();
  return host === official || host.endsWith(`.${official}`) || official.endsWith(`.${host}`);
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function titleSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
