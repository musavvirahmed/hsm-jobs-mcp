/**
 * Operator CLI for out-of-band Opening refresh / full careers pass.
 * Not used by Worker tool handlers — crawl stays off the request path.
 *
 * Usage:
 *   npm run crawl:smoke            # fixture refresh, no live network
 *   npm run crawl                  # CRAWL_INDEX_PATH sqlite + live fetch (operator)
 *   npm run crawl:full-pass:smoke  # fixture full careers pass, no live network
 *   npm run crawl:full-pass        # drive remaining KvKs to terminal outcomes
 *
 * Alert hook: prints repeated crawl failures to stderr (cheap free-tier ops).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAshbyBoardFeedFetcher } from "../src/ashby-board";
import { createPlaywrightPageGetter } from "../src/browser-harvest";
import { runFullCareersPass } from "../src/full-careers-pass";
import {
  DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD,
  runOutOfBandCrawl,
} from "../src/out-of-band-crawl";
import { RENTMAN_ASHBY_BOARD_SEED, type BoardFeedResponse } from "../src/opening-ingest";
import { createFixtureRegister } from "../src/register-source";
import {
  createSqliteWritableJobsIndex,
  sqliteIndexPathFromEnv,
} from "../src/sqlite-jobs-index";
import { createHttpsPageGetter, type PageGetResult } from "../src/website-resolution";

const RENTMAN = { kvk: "60733144", name: "Rentman B.V." };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASHBY_RENTMAN_FEED_URL =
  "https://api.ashbyhq.com/posting-api/job-board/rentman?includeCompensation=true";
const RECORDED_ASHBY_FEED = readFileSync(
  join(ROOT, "src/fixtures/ashby-rentman-board.json"),
  "utf8",
);
const RENTMAN_HOME = "<html><body><h1>Rentman</h1><p>Event rental software.</p></body></html>";
const PRODUCT_DESIGNER_CAREERS =
  "<html><head><title>Product Designer</title></head><body><h1>Product Designer</h1><p>Utrecht</p></body></html>";

async function main(): Promise<void> {
  const smoke = process.env.CRAWL_SMOKE === "1";
  const fullPass = process.env.CRAWL_FULL_PASS === "1";
  const maxAttempts = process.env.CRAWL_MAX_ATTEMPTS
    ? Number(process.env.CRAWL_MAX_ATTEMPTS)
    : undefined;
  const indexPath = smoke ? ":memory:" : sqliteIndexPathFromEnv();
  const index = createSqliteWritableJobsIndex(indexPath);
  const now = () => new Date().toISOString();

  if (smoke) {
    await index.recordWebsiteResolution({
      kvk: RENTMAN.kvk,
      official_website_host: "rentman.io",
      now: now(),
    });
    await index.setBoardSeed(RENTMAN_ASHBY_BOARD_SEED, now());
  }

  const getPage = smoke ? smokeGetPage() : createHttpsPageGetter(fetch);
  const fetchBoardFeed = smoke ? smokeFetchBoardFeed() : createAshbyBoardFeedFetcher(fetch);
  const browser = smoke ? null : await createPlaywrightPageGetter().catch(() => null);
  const register = createFixtureRegister(
    [RENTMAN],
    process.env.CRAWL_REGISTER_AS_OF?.trim() || "2026-08-03",
  );
  const providers = {
    wikidata: { websiteForKvk: async () => null },
    getPage,
  };

  const report = fullPass
    ? await runFullCareersPass({
        register,
        index,
        fetchBoardFeed,
        providers,
        getBrowserPage: browser?.getPage,
        maxAttempts,
      })
    : await runOutOfBandCrawl({
        register,
        index,
        fetchBoardFeed,
        providers,
        getBrowserPage: browser?.getPage,
        alert: async (alert) => {
          console.error(`[crawl-alert] ${alert.kind}: ${alert.message}`);
        },
        failureAlertThreshold: Number(
          process.env.CRAWL_FAILURE_ALERT_THRESHOLD ?? DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD,
        ),
      });

  const snapshot = await index.snapshot();
  console.log(
    JSON.stringify(
      {
        index_path: indexPath,
        smoke,
        full_pass: fullPass,
        re_partialed: report.re_partialed,
        missing_terminal_outcomes_before: report.missing_terminal_outcomes_before,
        missing_terminal_outcomes_after: report.missing_terminal_outcomes_after,
        crawl_failure_streak: "crawl_failure_streak" in report ? report.crawl_failure_streak : null,
        last_successful_crawl: snapshot.last_successful_crawl,
        index_scope: snapshot.index_scope,
        openings_refresh: "openings_refresh" in report ? report.openings_refresh.results : null,
        alerts: "alerts" in report ? report.alerts : [],
      },
      null,
      2,
    ),
  );

  if ("alerts" in report && report.alerts.length > 0) {
    process.exitCode = 2;
  }

  if (browser) {
    await browser.close();
  }
}

function smokeFetchBoardFeed() {
  return async (url: string): Promise<BoardFeedResponse> => {
    if (url !== ASHBY_RENTMAN_FEED_URL) return { ok: false, status: 404 };
    return { ok: true, status: 200, body: RECORDED_ASHBY_FEED };
  };
}

function smokeGetPage() {
  const pages: Record<string, PageGetResult> = {
    "https://rentman.io/": {
      status: 200,
      finalUrl: "https://rentman.io/",
      tlsValid: true,
      bodyText: RENTMAN_HOME,
    },
    "https://rentman.io/jobs/product-designer": {
      status: 200,
      finalUrl: "https://rentman.io/jobs/product-designer",
      tlsValid: true,
      bodyText: PRODUCT_DESIGNER_CAREERS,
    },
    "https://rentman.io/jobs/head-of-product-marketing": {
      status: 200,
      finalUrl: "https://rentman.io/jobs/head-of-product-marketing",
      tlsValid: true,
      bodyText:
        "<html><head><title>Head of Product Marketing</title></head><body><h1>Head of Product Marketing</h1></body></html>",
    },
  };
  return async (url: string): Promise<PageGetResult | null> => {
    return pages[url] ?? pages[url.replace(/\/$/, "")] ?? pages[`${url.replace(/\/$/, "")}/`] ?? null;
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
