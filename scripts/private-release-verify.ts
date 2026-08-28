/**
 * Private-release readiness check over Streamable HTTP `/mcp` on localhost.
 *
 * Usage:
 *   npm run dev                    # wrangler dev (default http://127.0.0.1:8787)
 *   npm run crawl                  # refresh local D1 first
 *   npm run private-release:verify
 *
 * Env:
 *   PRIVATE_RELEASE_ORIGIN — base URL (default http://127.0.0.1:8787)
 *
 * Exit codes:
 *   0 — ready (golden test + index scope checks passed)
 *   1 — not ready (connection/MCP init failure or verify assertion failure)
 */
import {
  connectPrivateReleaseMcp,
  formatPrivateReleaseFailures,
  privateReleaseOriginFromEnv,
  verifyPrivateRelease,
} from "../src/private-release-verify";

async function main(): Promise<void> {
  const origin = privateReleaseOriginFromEnv();
  let close: (() => Promise<void>) | undefined;
  try {
    const connected = await connectPrivateReleaseMcp(origin);
    close = connected.close;
    const result = await verifyPrivateRelease(connected.client);
    if (!result.ok) {
      console.error(formatPrivateReleaseFailures(result.failures));
      process.exitCode = 1;
      return;
    }
    console.log(`[private-release:verify] ready at ${origin}/mcp`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `[private-release:verify] connection failed at ${origin}/mcp: ${detail}\n` +
        "Start wrangler dev and ensure npm run crawl populated local D1 first.",
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
