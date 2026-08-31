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
import { createRegisterFromSponsors, type RegisterSource } from "./register-source";

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
  /** Optional progress sink (defaults to silent). Operator CLI wires stderr. */
  onProgress?: (line: string) => void;
}): Promise<FullCareersPassReport> {
  const now = opts.now ?? (() => new Date().toISOString());
  const progress = opts.onProgress ?? (() => {});

  progress("loading register…");
  const register = await opts.register.load();
  progress(`register loaded: ${register.sponsors.length} sponsors (as_of=${register.asOf ?? "null"})`);

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });

  progress("scanning terminal outcomes (bulk)…");
  const missingBefore = await listMissingTerminalOutcomeKvks(opts.index, register.sponsors);
  progress(`missing terminal outcomes: ${missingBefore.length}`);
  let rePartialed = false;
  if (missingBefore.length > 0) {
    await opts.index.setPass("partial");
    rePartialed = true;
  }

  const budget = opts.maxAttempts ?? missingBefore.length;
  const batch = missingBefore.slice(0, Math.max(0, budget));
  progress(
    `batch: attempting ${batch.length} of ${missingBefore.length} missing terminal outcomes` +
      (opts.maxAttempts != null ? ` (CRAWL_MAX_ATTEMPTS=${opts.maxAttempts})` : ""),
  );

  let websiteIngest: WebsiteIngestReport | null = null;
  let ladderIngest: LadderIngestReport | null = null;

  if (batch.length > 0) {
    const haveWebsite = new Set(await opts.index.listOfficialWebsiteKvks());
    const needWebsite = batch.filter((kvk) => !haveWebsite.has(kvk));
    if (needWebsite.length > 0) {
      progress(`website resolution: ${needWebsite.length} KvKs`);
      websiteIngest = await ingestWebsiteResolutions({
        register: createRegisterFromSponsors(register.sponsors, register.asOf, new Set(needWebsite)),
        index: opts.index,
        providers: opts.providers,
        now,
        onProgress: progress,
        updateRegisterMeta: false,
      });
      progress(`website resolution done`);
    }

    const haveOutcome = new Set(await opts.index.listTerminalOutcomeKvks());
    const haveWebsiteAfter = new Set(await opts.index.listOfficialWebsiteKvks());
    const stillMissing = batch.filter(
      (kvk) => !haveOutcome.has(kvk) && haveWebsiteAfter.has(kvk),
    );
    if (stillMissing.length > 0) {
      progress(`extraction ladder: ${stillMissing.length} KvKs`);
      ladderIngest = await ingestExtractionLadder({
        register: createRegisterFromSponsors(register.sponsors, register.asOf, new Set(stillMissing)),
        index: opts.index,
        fetchBoardFeed: opts.fetchBoardFeed,
        getPage: opts.providers.getPage,
        getBrowserPage: opts.getBrowserPage,
        now,
        onProgress: progress,
        updateRegisterMeta: false,
      });
      progress(`extraction ladder done`);
    }
  }

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });

  const reconciled = await reconcileIndexPass(opts.index, register.sponsors);
  progress(
    `done: missing_before=${missingBefore.length} attempted=${batch.length} ` +
      `missing_after=${reconciled.missing_terminal_outcomes} pass=${reconciled.pass}`,
  );
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
