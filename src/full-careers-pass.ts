import {
  listMissingTerminalOutcomeKvks,
  reconcileIndexPass,
} from "./index-pass";
import type { IndexPass, WritableJobsIndex } from "./jobs-index";
import {
  ingestExtractionLadder,
  ingestWebsiteResolutions,
  type BoardFeedResponse,
  type LadderIngestReport,
  type WebsiteIngestReport,
  type WebsiteResolutionProviders,
} from "./opening-ingest";
import { createRegisterSubset, type RegisterSource } from "./register-source";

export type FullCareersPassReport = {
  pass: IndexPass;
  re_partialed: boolean;
  missing_terminal_outcomes_before: number;
  missing_terminal_outcomes_after: number;
  attempted: number;
  website_ingest: WebsiteIngestReport | null;
  ladder_ingest: LadderIngestReport | null;
};

/**
 * Operator-runnable full careers pass: drive every current Work-register KvK
 * to a queryable terminal careers outcome, then unlock `full_careers_pass`
 * (and shared-release policy) when none remain missing.
 *
 * Browser last-resort is not required for a first useful full pass; the ladder
 * records unsupported/blocked outcomes honestly instead.
 */
export async function runFullCareersPass(opts: {
  register: RegisterSource;
  index: WritableJobsIndex;
  fetchBoardFeed: (url: string) => Promise<BoardFeedResponse>;
  providers: WebsiteResolutionProviders;
  getBrowserPage?: WebsiteResolutionProviders["getPage"];
  now?: () => string;
  /** Cap how many missing KvKs this invocation attempts (resumable batches). */
  maxAttempts?: number;
}): Promise<FullCareersPassReport> {
  const now = opts.now ?? (() => new Date().toISOString());
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

  const budget = opts.maxAttempts ?? missingBefore.length;
  const batch = missingBefore.slice(0, Math.max(0, budget));

  let websiteIngest: WebsiteIngestReport | null = null;
  let ladderIngest: LadderIngestReport | null = null;

  if (batch.length > 0) {
    const needWebsite: string[] = [];
    for (const kvk of batch) {
      if (!(await opts.index.getOfficialWebsite(kvk))) {
        needWebsite.push(kvk);
      }
    }
    if (needWebsite.length > 0) {
      websiteIngest = await ingestWebsiteResolutions({
        register: createRegisterSubset(opts.register, new Set(needWebsite)),
        index: opts.index,
        providers: opts.providers,
        now,
      });
    }

    const stillMissing: string[] = [];
    for (const kvk of batch) {
      if (!(await opts.index.getTerminalOutcome(kvk)) && (await opts.index.getOfficialWebsite(kvk))) {
        stillMissing.push(kvk);
      }
    }
    if (stillMissing.length > 0) {
      ladderIngest = await ingestExtractionLadder({
        register: createRegisterSubset(opts.register, new Set(stillMissing)),
        index: opts.index,
        fetchBoardFeed: opts.fetchBoardFeed,
        getPage: opts.providers.getPage,
        getBrowserPage: opts.getBrowserPage,
        now,
      });
    }
  }

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });

  const reconciled = await reconcileIndexPass(opts.index, register.sponsors);
  return {
    pass: reconciled.pass,
    re_partialed: rePartialed,
    missing_terminal_outcomes_before: missingBefore.length,
    missing_terminal_outcomes_after: reconciled.missing_terminal_outcomes,
    attempted: batch.length,
    website_ingest: websiteIngest,
    ladder_ingest: ladderIngest,
  };
}
