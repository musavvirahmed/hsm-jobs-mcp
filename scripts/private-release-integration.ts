/**
 * Full private-release loop: live crawl → ephemeral local D1 → wrangler dev → verify → teardown.
 *
 * Usage:
 *   npm run private-release:integration
 *
 * Env:
 *   PRIVATE_RELEASE_PORT — local dev port (default 8787)
 *   PRIVATE_RELEASE_ORIGIN — verify base URL (derived from port when unset)
 *
 * Exit codes:
 *   0 — crawl + dev + golden verify passed
 *   1 — any stage failed (crawl report / verify stderr logged)
 */
import {
  formatPrivateReleaseIntegrationFailure,
  runPrivateReleaseIntegration,
} from "../src/private-release-integration";

async function main(): Promise<void> {
  const result = await runPrivateReleaseIntegration();
  if (result.ok) {
    console.log(
      `[private-release:integration] ready at ${result.origin}/mcp\n` +
        JSON.stringify(result.crawlReport, null, 2),
    );
    return;
  }

  console.error(formatPrivateReleaseIntegrationFailure(result));
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
