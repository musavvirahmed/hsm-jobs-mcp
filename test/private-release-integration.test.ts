import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  DEFAULT_PRIVATE_RELEASE_PORT,
  DEFAULT_READINESS_POLL_MS,
  DEFAULT_READINESS_TIMEOUT_MS,
  buildPrivateReleaseIntegrationEnv,
  pollHealthUntilReady,
  runPrivateReleaseIntegration,
  type PrivateReleaseIntegrationDeps,
} from "../src/private-release-integration";

const projectRoot = join(import.meta.dirname, "..");

afterEach(() => {
  vi.restoreAllMocks();
});

test("buildPrivateReleaseIntegrationEnv pins crawl and dev to the same ephemeral local D1 state", () => {
  const stateDir = "/tmp/hsm-private-release-state";
  const env = buildPrivateReleaseIntegrationEnv({
    projectRoot,
    stateDir,
    port: 9876,
  });

  expect(env.JOBS_INDEX_TARGET).toBe("local-d1");
  expect(env.JOBS_INDEX_LOCAL_D1_STATE).toBe(stateDir);
  expect(env.PRIVATE_RELEASE_ORIGIN).toBe("http://127.0.0.1:9876");
  expect(env.CRAWL_SMOKE).toBeUndefined();
  expect(env.CRAWL_FIXTURE_REGISTER).toBe("1");
});

test("pollHealthUntilReady resolves when /health returns up or stale", async () => {
  const fetchImpl = vi
    .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ status: "stale" }));

  await pollHealthUntilReady("http://127.0.0.1:8787", {
    fetchImpl,
    timeoutMs: 1_000,
    pollMs: 10,
  });

  expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8787/health");
});

test("pollHealthUntilReady times out with a clear error", async () => {
  const fetchImpl = vi
    .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
    .mockRejectedValue(new Error("connection refused"));

  await expect(
    pollHealthUntilReady("http://127.0.0.1:8787", {
      fetchImpl,
      timeoutMs: 50,
      pollMs: 10,
    }),
  ).rejects.toThrow(/timed out waiting for .*\/health/i);
});

test("runPrivateReleaseIntegration tears down dev server and state on verify failure", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "hsm-private-release-int-"));
  const killed: string[] = [];
  const cleaned: string[] = [];

  const deps: PrivateReleaseIntegrationDeps = {
    projectRoot,
    port: DEFAULT_PRIVATE_RELEASE_PORT,
    createStateDir: () => stateDir,
    runCrawl: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ index_scope: { pass: "partial" } }),
      stderr: "",
    }),
    startDevServer: async () => ({
      pid: 42,
      kill: async () => {
        killed.push("dev");
      },
    }),
    waitForReady: async () => {},
    runVerify: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "[private-release:verify] search_jobs golden Opening: missing",
    }),
    cleanupStateDir: (dir) => {
      cleaned.push(dir);
      rmSync(dir, { recursive: true, force: true });
    },
  };

  const result = await runPrivateReleaseIntegration(deps);

  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.stage).toBe("verify");
  expect(result.verifyStderr).toMatch(/search_jobs golden Opening/i);
  expect(killed).toEqual(["dev"]);
  expect(cleaned).toEqual([stateDir]);
});

test("runPrivateReleaseIntegration succeeds on the happy path and cleans up", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "hsm-private-release-int-"));
  const killed: string[] = [];
  const cleaned: string[] = [];

  const deps: PrivateReleaseIntegrationDeps = {
    projectRoot,
    port: DEFAULT_PRIVATE_RELEASE_PORT,
    createStateDir: () => stateDir,
    runCrawl: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ index_scope: { pass: "partial" } }),
      stderr: "",
    }),
    startDevServer: async () => ({
      pid: 42,
      kill: async () => {
        killed.push("dev");
      },
    }),
    waitForReady: async () => {},
    runVerify: async () => ({ exitCode: 0, stdout: "[private-release:verify] ready", stderr: "" }),
    cleanupStateDir: (dir) => {
      cleaned.push(dir);
      rmSync(dir, { recursive: true, force: true });
    },
  };

  const result = await runPrivateReleaseIntegration(deps);

  expect(result).toEqual({
    ok: true,
    origin: `http://127.0.0.1:${DEFAULT_PRIVATE_RELEASE_PORT}`,
    crawlReport: { index_scope: { pass: "partial" } },
  });
  expect(killed).toEqual(["dev"]);
  expect(cleaned).toEqual([stateDir]);
});

test("runPrivateReleaseIntegration cleans up when crawl fails", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "hsm-private-release-int-"));
  const cleaned: string[] = [];

  const deps: PrivateReleaseIntegrationDeps = {
    projectRoot,
    port: DEFAULT_PRIVATE_RELEASE_PORT,
    createStateDir: () => stateDir,
    runCrawl: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "ashby fetch failed",
    }),
    cleanupStateDir: (dir) => {
      cleaned.push(dir);
      rmSync(dir, { recursive: true, force: true });
    },
  };

  const result = await runPrivateReleaseIntegration(deps);

  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.stage).toBe("crawl");
  expect(result.crawlStderr).toMatch(/ashby fetch failed/i);
  expect(cleaned).toEqual([stateDir]);
});

test("runPrivateReleaseIntegration uses default readiness polling constants", () => {
  expect(DEFAULT_READINESS_TIMEOUT_MS).toBeGreaterThan(10_000);
  expect(DEFAULT_READINESS_POLL_MS).toBeGreaterThan(0);
  expect(DEFAULT_READINESS_POLL_MS).toBeLessThan(DEFAULT_READINESS_TIMEOUT_MS);
});
