import {
  boardFeedUrl,
  fingerprintBoardTokens,
  hostSlugForBoardGuess,
  isV1BoardFamily,
  parseBoardFeed,
  V1_BOARD_FAMILIES,
  type BoardJob,
  type V1BoardFamily,
} from "./board-families";
import { ashbyBoardFeedUrl, type BoardFeedResponse } from "./ashby-board";
import {
  careersListingUrls,
  extractJobLinksFromCareersHtml,
  looksLikeJsShell,
  openingFromJobPage,
} from "./html-careers";
import { extractHonesty } from "./honesty";
import type { BoardSeed, OpeningRecord, RegisterJoinStrength, TerminalCareersOutcomeKind, WritableJobsIndex } from "./jobs-index";
import type { RegisterSource, RegisterSponsor } from "./register-source";
import { PRODUCT_USER_AGENT, robotsAllowsPath } from "./robots";
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
    const previousHost = await opts.index.getOfficialWebsite(sponsor.kvk);
    const resolved = await resolveOfficialWebsite(sponsor, opts.providers, override);
    await opts.index.recordWebsiteResolution({
      kvk: sponsor.kvk,
      official_website_host: resolved.official_website_host,
      now: stamp,
      replaceClosed: resolved.resolved_via === "override_force_unresolved",
    });
    if (previousHost !== resolved.official_website_host) {
      await opts.index.clearBoardGuessMisses(sponsor.kvk);
    }
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
  status: "indexed" | "fetch_failed" | "unsupported_family" | "empty_board";
  openings_written: number;
  openings_removed: number;
};

export type BoardIngestReport = {
  results: BoardIngestResult[];
};

export type LadderIngestResult = {
  kvk: string;
  status:
    | "indexed"
    | "fetch_failed"
    | "no_matching_public_board"
    | "no_careers_site"
    | "blocked"
    | "unsupported_extractor"
    | "skipped_no_website"
    | "unsupported_family";
  ats_family: string | null;
  board_token: string | null;
  openings_written: number;
  openings_removed: number;
  via: "board_seed" | "fingerprint" | "cautious_board_guess" | "html_careers" | null;
};

export type LadderIngestReport = {
  results: LadderIngestResult[];
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
    if (result.status === "indexed" || result.status === "empty_board") anySuccess = true;
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

/**
 * Extraction ladder for sponsors with an accepted official website:
 * board seed → fingerprint → cautious board guess → HTML careers fallback.
 */
export async function ingestExtractionLadder(opts: {
  register: RegisterSource;
  index: WritableJobsIndex;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  getPage: WebsiteResolutionProviders["getPage"];
  now?: () => string;
  invalidateBoardGuessesFor?: string[];
}): Promise<LadderIngestReport> {
  const now = opts.now ?? (() => new Date().toISOString());
  const stamp = now();
  const register = await opts.register.load();
  const results: LadderIngestResult[] = [];
  let anySuccess = false;

  for (const kvk of opts.invalidateBoardGuessesFor ?? []) {
    await opts.index.clearBoardGuessMisses(kvk);
  }

  for (const sponsor of register.sponsors) {
    const result = await ingestLadderForSponsor({
      sponsor,
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

async function ingestLadderForSponsor(opts: {
  sponsor: RegisterSponsor;
  index: WritableJobsIndex;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  getPage: WebsiteResolutionProviders["getPage"];
  stamp: string;
}): Promise<LadderIngestResult> {
  const { sponsor, index, stamp } = opts;
  const officialHost = await index.getOfficialWebsite(sponsor.kvk);
  if (!officialHost) {
    return {
      kvk: sponsor.kvk,
      status: "skipped_no_website",
      ats_family: null,
      board_token: null,
      openings_written: 0,
      openings_removed: 0,
      via: null,
    };
  }

  const seeds = (await index.listBoardSeeds()).filter((seed) => seed.kvk === sponsor.kvk);
  for (const seed of seeds) {
    const seeded = await ingestOneBoardSeed({
      seed,
      sponsor,
      index,
      fetchBoardFeed: opts.fetchBoardFeed,
      getPage: opts.getPage,
      stamp,
    });
    const fromSeed = await ladderResultFromBoard({
      board: seeded,
      kvk: sponsor.kvk,
      officialHost,
      stamp,
      index,
      via: "board_seed",
      atsFamily: seeded.ats_family,
      boardToken: seeded.board_token,
    });
    if (fromSeed) return fromSeed;
    if (seeded.status === "unsupported_family") {
      continue;
    }
  }

  const fingerprinted = await fingerprintFromCareersPages({
    officialHost,
    getPage: opts.getPage,
  });
  for (const hit of fingerprinted) {
    const board = await tryKnownBoard({
      kvk: sponsor.kvk,
      sponsor,
      officialHost,
      family: hit.ats_family,
      boardToken: hit.board_token,
      index,
      fetchBoardFeed: opts.fetchBoardFeed,
      getPage: opts.getPage,
      stamp,
      persistSeed: true,
    });
    const fromFingerprint = await ladderResultFromBoard({
      board,
      kvk: sponsor.kvk,
      officialHost,
      stamp,
      index,
      via: "fingerprint",
      atsFamily: hit.ats_family,
      boardToken: hit.board_token,
    });
    if (fromFingerprint) return fromFingerprint;
  }

  const slug = hostSlugForBoardGuess(officialHost);
  if (slug) {
    for (const family of V1_BOARD_FAMILIES) {
      const missed = await index.hasBoardGuessMiss({
        kvk: sponsor.kvk,
        ats_family: family,
        board_token: slug,
        official_website_host: officialHost,
      });
      if (missed) continue;

      const board = await tryKnownBoard({
        kvk: sponsor.kvk,
        sponsor,
        officialHost,
        family,
        boardToken: slug,
        index,
        fetchBoardFeed: opts.fetchBoardFeed,
        getPage: opts.getPage,
        stamp,
        persistSeed: true,
      });
      const fromGuess = await ladderResultFromBoard({
        board,
        kvk: sponsor.kvk,
        officialHost,
        stamp,
        index,
        via: "cautious_board_guess",
        atsFamily: family,
        boardToken: slug,
      });
      if (fromGuess) return fromGuess;
      if (board.status === "fetch_failed") {
        await index.recordBoardGuessMiss({
          kvk: sponsor.kvk,
          ats_family: family,
          board_token: slug,
          official_website_host: officialHost,
          now: stamp,
        });
      }
    }
  }

  const html = await ingestHtmlCareersFallback({
    sponsor,
    officialHost,
    index,
    getPage: opts.getPage,
    stamp,
  });
  if (html.openings_written > 0) {
    return {
      kvk: sponsor.kvk,
      status: "indexed",
      ats_family: null,
      board_token: null,
      openings_written: html.openings_written,
      openings_removed: html.openings_removed,
      via: "html_careers",
    };
  }

  const outcome = terminalFromHtmlProbe(html);
  await index.recordTerminalOutcome({
    kvk: sponsor.kvk,
    outcome,
    official_website_host: officialHost,
    now: stamp,
  });
  return {
    kvk: sponsor.kvk,
    status: outcome,
    ats_family: null,
    board_token: null,
    openings_written: 0,
    openings_removed: html.openings_removed,
    via: null,
  };
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
  if (!isV1BoardFamily(seed.ats_family)) {
    return {
      kvk: seed.kvk,
      ats_family: seed.ats_family,
      board_token: seed.board_token,
      status: "unsupported_family",
      openings_written: 0,
      openings_removed: 0,
    };
  }

  const family = seed.ats_family;
  const feedUrl = seed.public_board_feed_url ?? boardFeedUrl(family, seed.board_token);
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

  const parsed = parseBoardFeed(family, fetched.body);
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
  const written = await writeBoardJobs({
    jobs: parsed.jobs,
    family,
    boardToken: seed.board_token,
    sponsor,
    officialHost,
    index,
    getPage: opts.getPage,
  });

  if (written.written > 0) {
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
    status: written.written > 0 ? "indexed" : "empty_board",
    openings_written: written.written,
    openings_removed: written.removed,
  };
}

async function tryKnownBoard(opts: {
  kvk: string;
  sponsor: RegisterSponsor;
  officialHost: string;
  family: V1BoardFamily;
  boardToken: string;
  index: WritableJobsIndex;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  getPage: WebsiteResolutionProviders["getPage"];
  stamp: string;
  persistSeed: boolean;
}): Promise<BoardIngestResult> {
  const seed: BoardSeed = {
    kvk: opts.kvk,
    ats_family: opts.family,
    board_token: opts.boardToken,
    public_board_feed_url: boardFeedUrl(opts.family, opts.boardToken),
  };
  const result = await ingestOneBoardSeed({
    seed,
    sponsor: opts.sponsor,
    index: opts.index,
    fetchBoardFeed: opts.fetchBoardFeed,
    getPage: opts.getPage,
    stamp: opts.stamp,
  });
  if (opts.persistSeed && (result.status === "indexed" || result.status === "empty_board")) {
    await opts.index.setBoardSeed(seed, opts.stamp);
    await opts.index.clearBoardGuessMisses(opts.kvk);
  }
  return result;
}

async function writeBoardJobs(opts: {
  jobs: BoardJob[];
  family: V1BoardFamily;
  boardToken: string;
  sponsor: RegisterSponsor | null;
  officialHost: string | null;
  index: WritableJobsIndex;
  getPage: WebsiteResolutionProviders["getPage"];
}): Promise<{ written: number; removed: number }> {
  const join = registerJoinAtIndexTime(opts.sponsor);
  const seen = new Set<string>();
  let written = 0;

  for (const job of opts.jobs) {
    const identity = `${opts.family}:${opts.boardToken}:${job.id}`;
    seen.add(identity);
    const careersUrl = opts.officialHost
      ? await careersUrlIfLive(opts.officialHost, job.title, opts.getPage)
      : null;
    const primaryUrl = careersUrl ?? job.jobUrl;
    await ingestOpening(opts.index, {
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
      ats_family: opts.family,
      board_token: opts.boardToken,
      posting_id: job.id,
      ats_compensation: job.compensationSummary,
    });
    written += 1;
  }

  const existing = await opts.index.listOpeningsByBoard(opts.family, opts.boardToken);
  let removed = 0;
  for (const opening of existing) {
    if (!seen.has(opening.identity)) {
      await opts.index.removeOpening(opening.identity);
      removed += 1;
    }
  }
  return { written, removed };
}

async function fingerprintFromCareersPages(opts: {
  officialHost: string;
  getPage: WebsiteResolutionProviders["getPage"];
}): Promise<Array<{ ats_family: V1BoardFamily; board_token: string }>> {
  const found = new Map<string, { ats_family: V1BoardFamily; board_token: string }>();
  const robots = await loadRobots(opts.officialHost, opts.getPage);
  for (const url of [`https://${opts.officialHost}/`, ...careersListingUrls(opts.officialHost)]) {
    const path = new URL(url).pathname;
    const decision = robotsAllowsPath(robots, path, { userAgent: PRODUCT_USER_AGENT });
    if (!decision.allowed) continue;
    const page = await opts.getPage(url);
    if (!page || !page.tlsValid || page.status < 200 || page.status >= 400) continue;
    for (const hit of fingerprintBoardTokens(page.bodyText)) {
      found.set(`${hit.ats_family}:${hit.board_token}`, hit);
    }
  }
  return [...found.values()];
}

async function ingestHtmlCareersFallback(opts: {
  sponsor: RegisterSponsor;
  officialHost: string;
  index: WritableJobsIndex;
  getPage: WebsiteResolutionProviders["getPage"];
  stamp: string;
}): Promise<HtmlCareersProbe> {
  const robots = await loadRobots(opts.officialHost, opts.getPage);
  const join = registerJoinAtIndexTime(opts.sponsor);
  const seen = new Set<string>();
  let written = 0;
  let careersOk = 0;
  let careersBlocked = 0;
  let jobLinksFound = 0;
  let jsShell = false;

  for (const listingUrl of careersListingUrls(opts.officialHost)) {
    const listingPath = new URL(listingUrl).pathname;
    if (!robotsAllowsPath(robots, listingPath, { userAgent: PRODUCT_USER_AGENT }).allowed) {
      continue;
    }
    const listing = await opts.getPage(listingUrl);
    if (isBlockedPage(listing)) {
      careersBlocked += 1;
      continue;
    }
    if (!listing || listing.status < 200 || listing.status >= 400) continue;
    careersOk += 1;
    if (looksLikeJsShell(listing.bodyText)) {
      jsShell = true;
    }

    const links = extractJobLinksFromCareersHtml(listing.finalUrl, listing.bodyText, opts.officialHost);
    jobLinksFound += links.length;
    for (const jobUrl of links) {
      const jobPath = new URL(jobUrl).pathname;
      if (!robotsAllowsPath(robots, jobPath, { userAgent: PRODUCT_USER_AGENT }).allowed) {
        continue;
      }
      const page = await opts.getPage(jobUrl);
      if (isBlockedPage(page) || !page || page.status < 200 || page.status >= 400) continue;
      const draft = openingFromJobPage(jobUrl, page.bodyText);
      if (!draft) continue;
      const identity = `careers_url:${draft.primary_url}`;
      seen.add(identity);
      await ingestOpening(opts.index, {
        identity,
        primary_url: draft.primary_url,
        careers_url: draft.primary_url,
        ats_url: null,
        title: draft.title,
        location: draft.location,
        jd_extract: draft.jd_extract,
        source_class: "careers_site",
        register_name: join.name,
        register_kvk: join.kvk,
        register_join_strength: join.strength,
        ats_family: null,
        board_token: null,
        posting_id: null,
      });
      written += 1;
    }
  }

  let removed = 0;
  if (written > 0) {
    const existing = await opts.index.listOpeningsByKvk(opts.sponsor.kvk);
    for (const opening of existing) {
      if (opening.source_class !== "careers_site") continue;
      if (!seen.has(opening.identity)) {
        await opts.index.removeOpening(opening.identity);
        removed += 1;
      }
    }
    await opts.index.recordTerminalOutcome({
      kvk: opts.sponsor.kvk,
      outcome: "openings_indexed",
      official_website_host: opts.officialHost,
      now: opts.stamp,
    });
  }

  return {
    openings_written: written,
    openings_removed: removed,
    careers_ok: careersOk,
    careers_blocked: careersBlocked,
    job_links_found: jobLinksFound,
    js_shell: jsShell,
  };
}

type HtmlCareersProbe = {
  openings_written: number;
  openings_removed: number;
  careers_ok: number;
  careers_blocked: number;
  job_links_found: number;
  js_shell: boolean;
};

function terminalFromHtmlProbe(probe: HtmlCareersProbe): Exclude<
  TerminalCareersOutcomeKind,
  "openings_indexed" | "unresolved_website"
> {
  if (probe.careers_blocked > 0 && probe.careers_ok === 0) return "blocked";
  if (probe.careers_ok === 0) return "no_careers_site";
  if (probe.js_shell && probe.job_links_found === 0) return "unsupported_extractor";
  return "no_matching_public_board";
}

function isBlockedPage(page: PageGetResult | null): boolean {
  if (!page) return false;
  if (!page.tlsValid) return true;
  if (page.status === 401 || page.status === 403 || page.status === 429) return true;
  if (page.status >= 500) return true;
  return false;
}

async function ladderResultFromBoard(opts: {
  board: BoardIngestResult;
  kvk: string;
  officialHost: string;
  stamp: string;
  index: WritableJobsIndex;
  via: "board_seed" | "fingerprint" | "cautious_board_guess";
  atsFamily: string;
  boardToken: string;
}): Promise<LadderIngestResult | null> {
  if (opts.board.status !== "indexed" && opts.board.status !== "empty_board") {
    return null;
  }
  if (opts.board.status === "empty_board") {
    await opts.index.recordTerminalOutcome({
      kvk: opts.kvk,
      outcome: "no_matching_public_board",
      official_website_host: opts.officialHost,
      now: opts.stamp,
    });
  }
  return {
    kvk: opts.kvk,
    status: opts.board.status === "indexed" ? "indexed" : "no_matching_public_board",
    ats_family: opts.atsFamily,
    board_token: opts.boardToken,
    openings_written: opts.board.openings_written,
    openings_removed: opts.board.openings_removed,
    via: opts.via,
  };
}

async function loadRobots(
  officialHost: string,
  getPage: WebsiteResolutionProviders["getPage"],
): Promise<string | null> {
  const page = await getPage(`https://${officialHost}/robots.txt`);
  if (!page || !page.tlsValid || page.status < 200 || page.status >= 400) return null;
  return page.bodyText;
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
