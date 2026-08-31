import {
  ingestExtractionLadder,
  ingestFromBoardSeeds,
  ingestWebsiteResolutions,
  type BoardFeedResponse,
  type BoardIngestReport,
  type LadderIngestReport,
  type WebsiteIngestReport,
  type WebsiteResolutionProviders,
} from "./opening-ingest";
import { listMissingTerminalOutcomeKvks, reconcileIndexPass } from "./index-pass";
import type { WritableJobsIndex } from "./jobs-index";
import { createRegisterFromSponsors, type RegisterSource } from "./register-source";

export const DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD = 2;

export type CrawlAlert = {
  kind: "repeated_crawl_failure";
  consecutive_failures: number;
  message: string;
};

export type CrawlAlertHook = (alert: CrawlAlert) => void | Promise<void>;

export type OutOfBandCrawlReport = {
  re_partialed: boolean;
  missing_terminal_outcomes_before: number;
  missing_terminal_outcomes_after: number;
  openings_refresh: BoardIngestReport;
  website_ingest: WebsiteIngestReport | null;
  ladder_ingest: LadderIngestReport | null;
  crawl_failure_streak: number;
  alerts: CrawlAlert[];
};

/**
 * Out-of-band Opening refresh + register-refresh re-partial.
 * MCP tools stay read-only; this plane writes the durable jobs index.
 * Restores `full_careers_pass` when every current-register KvK has a terminal
 * careers outcome (same reconcile as the full careers pass runner).
 */
export async function runOutOfBandCrawl(opts: {
  register: RegisterSource;
  index: WritableJobsIndex;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  providers: WebsiteResolutionProviders;
  getBrowserPage?: WebsiteResolutionProviders["getPage"];
  now?: () => string;
  alert?: CrawlAlertHook;
  failureAlertThreshold?: number;
}): Promise<OutOfBandCrawlReport> {
  const now = opts.now ?? (() => new Date().toISOString());
  const threshold = opts.failureAlertThreshold ?? DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD;
  const getPage = opts.providers.getPage;
  const register = await opts.register.load();

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });

  const missingBefore = await listMissingTerminalOutcomeKvks(opts.index, register.sponsors);

  let rePartialed = false;
  if (missingBefore.length > 0) {
    await opts.index.setPass("partial");
    rePartialed = true;
  }

  const openingsRefresh = await ingestFromBoardSeeds({
    register: opts.register,
    index: opts.index,
    fetchBoardFeed: opts.fetchBoardFeed,
    getPage,
    now,
  });

  let websiteIngest: WebsiteIngestReport | null = null;
  let ladderIngest: LadderIngestReport | null = null;

  const stillMissing = await listMissingTerminalOutcomeKvks(opts.index, register.sponsors);
  if (stillMissing.length > 0) {
    const missingRegister = createRegisterFromSponsors(
      register.sponsors,
      register.asOf,
      new Set(stillMissing),
    );
    websiteIngest = await ingestWebsiteResolutions({
      register: missingRegister,
      index: opts.index,
      providers: opts.providers,
      now,
      updateRegisterMeta: false,
    });

    const afterWebsite = await listMissingTerminalOutcomeKvks(opts.index, register.sponsors);
    const withWebsite = [];
    for (const kvk of afterWebsite) {
      if (await opts.index.getOfficialWebsite(kvk)) {
        withWebsite.push(kvk);
      }
    }
    if (withWebsite.length > 0) {
      ladderIngest = await ingestExtractionLadder({
        register: createRegisterFromSponsors(register.sponsors, register.asOf, new Set(withWebsite)),
        index: opts.index,
        fetchBoardFeed: opts.fetchBoardFeed,
        getPage,
        getBrowserPage: opts.getBrowserPage,
        now,
        updateRegisterMeta: false,
      });
    }
  }

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });

  const streak = await updateCrawlFailureStreak(opts.index, openingsRefresh);
  const alerts: CrawlAlert[] = [];
  if (streak >= threshold && opts.alert) {
    const alert: CrawlAlert = {
      kind: "repeated_crawl_failure",
      consecutive_failures: streak,
      message: `Repeated out-of-band crawl failure: ${streak} consecutive runs with no successful known-path refresh`,
    };
    await opts.alert(alert);
    alerts.push(alert);
  }

  const reconciled = await reconcileIndexPass(opts.index, register.sponsors);
  return {
    re_partialed: rePartialed,
    missing_terminal_outcomes_before: missingBefore.length,
    missing_terminal_outcomes_after: reconciled.missing_terminal_outcomes,
    openings_refresh: openingsRefresh,
    website_ingest: websiteIngest,
    ladder_ingest: ladderIngest,
    crawl_failure_streak: streak,
    alerts,
  };
}

async function updateCrawlFailureStreak(
  index: WritableJobsIndex,
  openingsRefresh: BoardIngestReport,
): Promise<number> {
  if (openingsRefresh.results.length === 0) {
    return index.getCrawlFailureStreak();
  }

  const anySuccess = openingsRefresh.results.some(
    (row) => row.status === "indexed" || row.status === "empty_board",
  );
  if (anySuccess) {
    await index.setCrawlFailureStreak(0);
    return 0;
  }

  const anyFailure = openingsRefresh.results.some((row) => row.status === "fetch_failed");
  if (!anyFailure) {
    return index.getCrawlFailureStreak();
  }

  const next = (await index.getCrawlFailureStreak()) + 1;
  await index.setCrawlFailureStreak(next);
  return next;
}
