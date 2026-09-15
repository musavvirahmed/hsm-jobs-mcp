/**
 * One-shot operator re-ingest for OpenUp Technologies B.V. (KvK 76848337).
 * Requires JOBS_INDEX_TARGET=remote-d1 (or local-d1) and Cloudflare env when remote.
 * Applies website override pin + Greenhouse board seed, then indexes openings.
 */
import { createProductionCrawlRuntime } from "../src/crawl-runtime";
import {
  ingestFromBoardSeeds,
  ingestWebsiteResolutions,
  OPENUP_GREENHOUSE_BOARD_SEED,
} from "../src/opening-ingest";
import { createCrawlJobsIndex } from "../src/operator-jobs-index";
import { createRegisterSubset } from "../src/register-source";

const OPENUP_KVK = OPENUP_GREENHOUSE_BOARD_SEED.kvk;

async function main(): Promise<void> {
  let closeRuntime: (() => Promise<void>) | undefined;
  let exitCode = 0;
  try {
    const now = () => new Date().toISOString();
    const { index, targetLabel } = await createCrawlJobsIndex({});
    console.error(`[reingest-openup] jobs_index_target: ${targetLabel}`);

    const runtime = await createProductionCrawlRuntime({});
    closeRuntime = () => runtime.close();

    await index.setWebsiteOverride(
      OPENUP_KVK,
      { mode: "pin", host: "openup.com" },
      now(),
    );
    await index.setBoardSeed(OPENUP_GREENHOUSE_BOARD_SEED, now());

    const fullRegister = await runtime.register.load();
    const register = createRegisterSubset(runtime.register, new Set([OPENUP_KVK]));
    const website = await ingestWebsiteResolutions({
      register,
      index,
      providers: runtime.providers,
      now,
    });
    console.error("[reingest-openup] website:", JSON.stringify(website.results));

    const boards = await ingestFromBoardSeeds({
      register,
      index,
      fetchBoardFeed: runtime.fetchBoardFeed,
      getPage: runtime.providers.getPage,
      now,
      seeds: [OPENUP_GREENHOUSE_BOARD_SEED],
    });
    console.error("[reingest-openup] boards:", JSON.stringify(boards.results));

    // Subset ingest rewrites register_size to 1 — restore full Work-register meta.
    await index.setRegisterMeta({
      register_size: fullRegister.sponsors.length,
      register_as_of: fullRegister.asOf,
    });
    const openings = await index.listOpeningsByKvk(OPENUP_KVK);
    console.log(
      JSON.stringify(
        {
          kvk: OPENUP_KVK,
          official_website: await index.getOfficialWebsite(OPENUP_KVK),
          terminal: await index.getTerminalOutcome(OPENUP_KVK),
          openings_count: openings.length,
          sample_titles: openings.slice(0, 5).map((row) => row.title),
        },
        null,
        2,
      ),
    );
    exitCode = process.exitCode ?? 0;
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    if (closeRuntime) {
      console.error("[reingest-openup] closing runtime…");
      try {
        await closeRuntime();
      } catch (closeError) {
        console.error(closeError);
        if (exitCode === 0) exitCode = 1;
      }
    }
    console.error("[reingest-openup] process exiting");
    // Playwright/MCP sockets can keep the event loop alive after close(); exit so
    // the operator one-shot is not stuck after success *or* failure.
    process.exit(exitCode);
  }
}

main();
