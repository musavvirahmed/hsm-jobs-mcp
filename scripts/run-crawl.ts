import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProductionCrawlRuntime } from "../src/crawl-runtime";
import { runFullCareersPass } from "../src/full-careers-pass";
import {
  DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD,
  runOutOfBandCrawl,
} from "../src/out-of-band-crawl";
import { RENTMAN_ASHBY_BOARD_SEED, type BoardFeedResponse } from "../src/opening-ingest";
import { createFixtureRegister } from "../src/register-source";
import { createCrawlJobsIndex } from "../src/operator-jobs-index";
import { createHttpsPageGetter, type PageGetResult } from "../src/website-resolution";

const RENTMAN = { kvk: "60733144", name: "Rentman B.V." };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Load repo `.env` into process.env when present. Does not override existing vars. */
function loadDotEnvIfPresent(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnvIfPresent(join(ROOT, ".env"));

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
  const { index, targetLabel } = await createCrawlJobsIndex({ smoke });
  const now = () => new Date().toISOString();

  if (smoke) {
    await index.recordWebsiteResolution({
      kvk: RENTMAN.kvk,
      official_website_host: "rentman.io",
      now: now(),
    });
    await index.setBoardSeed(RENTMAN_ASHBY_BOARD_SEED, now());
  }

  let closeRuntime: (() => Promise<void>) | undefined;
  const runtime = smoke
    ? {
        register: createFixtureRegister(
          [RENTMAN],
          process.env.CRAWL_REGISTER_AS_OF?.trim() || "2026-08-03",
        ),
        fetchBoardFeed: smokeFetchBoardFeed(),
        providers: {
          wikidata: { websiteForKvk: async () => null },
          getPage: smokeGetPage(),
        },
        getBrowserPage: undefined as undefined | ((url: string) => Promise<PageGetResult | null>),
      }
    : await (async () => {
        const production = await createProductionCrawlRuntime({ env: process.env });
        closeRuntime = production.close;
        return production;
      })();

  const report = fullPass
    ? await runFullCareersPass({
        register: runtime.register,
        index,
        fetchBoardFeed: runtime.fetchBoardFeed,
        providers: runtime.providers,
        getBrowserPage: runtime.getBrowserPage,
        maxAttempts,
        onProgress: (line) => {
          console.error(`[crawl] ${line}`);
        },
      })
    : await runOutOfBandCrawl({
        register: runtime.register,
        index,
        fetchBoardFeed: runtime.fetchBoardFeed,
        providers: runtime.providers,
        getBrowserPage: runtime.getBrowserPage,
        alert: async (alert) => {
          console.error(`[crawl-alert] ${alert.kind}: ${alert.message}`);
        },
        failureAlertThreshold: Number(
          process.env.CRAWL_FAILURE_ALERT_THRESHOLD ?? DEFAULT_CRAWL_FAILURE_ALERT_THRESHOLD,
        ),
      });

  console.error("[crawl] writing index snapshot…");
  const snapshot = await index.snapshot();
  console.log(
    JSON.stringify(
      {
        jobs_index_target: targetLabel,
        smoke,
        full_pass: fullPass,
        re_partialed: report.re_partialed,
        missing_terminal_outcomes_before: report.missing_terminal_outcomes_before,
        missing_terminal_outcomes_after: report.missing_terminal_outcomes_after,
        attempted: "attempted" in report ? report.attempted : null,
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

  if (closeRuntime) {
    console.error("[crawl] closing runtime…");
    await closeRuntime();
  }
  console.error("[crawl] batch process exiting");
  // Playwright/MCP sockets can keep the event loop alive after close(); exit so
  // the full-pass loop can start the next batch.
  process.exit(process.exitCode ?? 0);
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
