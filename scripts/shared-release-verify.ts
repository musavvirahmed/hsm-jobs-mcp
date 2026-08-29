/**
 * Shared-release readiness check against the public origin (default ADR 0009 host).
 *
 * Usage:
 *   npm run shared-release:verify
 *
 * Env:
 *   SHARED_RELEASE_ORIGIN — base URL (default https://hsmjobs.musavvir.work)
 *
 * Exit codes:
 *   0 — ready (full careers pass + health + /mcp initialize)
 *   1 — not ready (network/MCP failure or verify assertion failure)
 */
import {
  connectSharedReleaseMcp,
  formatSharedReleaseFailures,
  sharedReleaseOriginFromEnv,
  verifySharedRelease,
} from "../src/shared-release-verify";

async function main(): Promise<void> {
  const origin = sharedReleaseOriginFromEnv();
  let close: (() => Promise<void>) | undefined;
  try {
    const connected = await connectSharedReleaseMcp(origin);
    close = connected.close;
    const result = await verifySharedRelease(connected.client, { origin });
    if (!result.ok) {
      console.error(formatSharedReleaseFailures(result.failures));
      process.exitCode = 1;
      return;
    }
    console.log(`[shared-release:verify] ready at ${origin}/mcp`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `[shared-release:verify] connection failed at ${origin}/mcp: ${detail}\n` +
        "Complete the production full careers pass before pointing MCP clients at the public URL.",
    );
    process.exitCode = 1;
  } finally {
    if (close) {
      await close();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
