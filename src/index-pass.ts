import type { IndexPass, WritableJobsIndex } from "./jobs-index";
import type { RegisterSponsor } from "./register-source";

/** Locked public origin for shared release (ADR 0009). */
export const SHARED_RELEASE_HOST = "hsmjobs.musavvir.work";

export function isSharedReleaseHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/\.$/, "") === SHARED_RELEASE_HOST;
}

export function sharedReleaseAllowed(pass: IndexPass): boolean {
  return pass === "full_careers_pass";
}

export async function listMissingTerminalOutcomeKvks(
  index: WritableJobsIndex,
  sponsors: RegisterSponsor[],
): Promise<string[]> {
  // One bulk read — per-KvK getTerminalOutcome is ~300ms+ on remote D1 and
  // stalls a 12k register scan for an hour with no progress lines.
  const done = new Set(await index.listTerminalOutcomeKvks());
  return sponsors.filter((sponsor) => !done.has(sponsor.kvk)).map((sponsor) => sponsor.kvk);
}

/**
 * Pass is `full_careers_pass` iff every current-register KvK has a terminal
 * careers outcome; otherwise `partial`. Shared release follows that pass.
 */
export async function reconcileIndexPass(
  index: WritableJobsIndex,
  sponsors: RegisterSponsor[],
): Promise<{ pass: IndexPass; missing_terminal_outcomes: number }> {
  const missing = await listMissingTerminalOutcomeKvks(index, sponsors);
  const pass: IndexPass = missing.length === 0 && sponsors.length > 0 ? "full_careers_pass" : "partial";
  await index.setPass(pass);
  return {
    pass,
    missing_terminal_outcomes: missing.length,
  };
}
