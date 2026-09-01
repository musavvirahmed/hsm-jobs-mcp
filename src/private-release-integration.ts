import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LOCAL_D1_STATE_DIR } from "./operator-jobs-index";

export const DEFAULT_PRIVATE_RELEASE_PORT = 8787;
export const DEFAULT_READINESS_TIMEOUT_MS = 120_000;
export const DEFAULT_READINESS_POLL_MS = 500;

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type DevServerHandle = {
  pid: number;
  kill: () => Promise<void>;
};

export type PrivateReleaseIntegrationSuccess = {
  ok: true;
  origin: string;
  crawlReport: unknown;
};

export type PrivateReleaseIntegrationFailure = {
  ok: false;
  stage: "crawl" | "dev" | "ready" | "verify";
  origin: string;
  crawlReport?: unknown;
  crawlStdout?: string;
  crawlStderr?: string;
  readyDetail?: string;
  verifyStdout?: string;
  verifyStderr?: string;
};

export type PrivateReleaseIntegrationResult =
  | PrivateReleaseIntegrationSuccess
  | PrivateReleaseIntegrationFailure;

export type PrivateReleaseIntegrationDeps = {
  projectRoot?: string;
  port?: number;
  readinessTimeoutMs?: number;
  readinessPollMs?: number;
  createStateDir?: () => string;
  runCrawl?: (env: NodeJS.ProcessEnv) => Promise<CommandResult>;
  startDevServer?: (args: {
    projectRoot: string;
    stateDir: string;
    port: number;
    env: NodeJS.ProcessEnv;
  }) => Promise<DevServerHandle> | DevServerHandle;
  waitForReady?: (origin: string, options: { timeoutMs: number; pollMs: number }) => Promise<void>;
  runVerify?: (env: NodeJS.ProcessEnv) => Promise<CommandResult>;
  cleanupStateDir?: (stateDir: string) => void;
};

export async function pickFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a free TCP port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(port);
      });
    });
    server.on("error", reject);
  });
}

export function privateReleasePortFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PRIVATE_RELEASE_PORT?.trim();
  if (!raw) {
    return DEFAULT_PRIVATE_RELEASE_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`PRIVATE_RELEASE_PORT must be a valid TCP port, got "${raw}"`);
  }
  return port;
}

export function privateReleaseOriginForPort(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function buildPrivateReleaseIntegrationEnv(args: {
  projectRoot: string;
  stateDir: string;
  port: number;
  env?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env = { ...(args.env ?? process.env) };
  delete env.CRAWL_SMOKE;
  // Live Ashby/HTML, but Rentman fixture register — do not load the full hsm-mcp Work
  // register in CI (that hangs private-release:integration for ~30m).
  env.CRAWL_FIXTURE_REGISTER = "1";
  env.JOBS_INDEX_TARGET = "local-d1";
  env.JOBS_INDEX_LOCAL_D1_STATE = relativeProjectPath(args.projectRoot, args.stateDir);
  env.PRIVATE_RELEASE_ORIGIN = privateReleaseOriginForPort(args.port);
  env.PRIVATE_RELEASE_PORT = String(args.port);
  env.CI = env.CI ?? "true";
  return env;
}

export async function pollHealthUntilReady(
  origin: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    pollMs?: number;
  } = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_READINESS_POLL_MS;
  const healthUrl = `${origin.replace(/\/$/, "")}/health`;
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(healthUrl);
      if (response.ok) {
        const payload = (await response.json()) as { status?: string };
        if (payload.status === "up" || payload.status === "stale") {
          return;
        }
        lastError = `unexpected health payload ${JSON.stringify(payload)}`;
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for ${healthUrl} (${lastError})`);
}

export function formatPrivateReleaseIntegrationFailure(
  result: PrivateReleaseIntegrationFailure,
): string {
  const lines = [`[private-release:integration] failed at ${result.stage} (${result.origin})`];

  if (result.crawlReport !== undefined) {
    lines.push(`crawl report:\n${JSON.stringify(result.crawlReport, null, 2)}`);
  }
  if (result.crawlStderr?.trim()) {
    lines.push(`crawl stderr:\n${result.crawlStderr.trim()}`);
  }
  if (result.readyDetail) {
    lines.push(`readiness: ${result.readyDetail}`);
  }
  if (result.verifyStderr?.trim()) {
    lines.push(`verify stderr:\n${result.verifyStderr.trim()}`);
  }
  if (result.verifyStdout?.trim()) {
    lines.push(`verify stdout:\n${result.verifyStdout.trim()}`);
  }

  return lines.join("\n\n");
}

export async function runPrivateReleaseIntegration(
  deps: PrivateReleaseIntegrationDeps = {},
): Promise<PrivateReleaseIntegrationResult> {
  const projectRoot = deps.projectRoot ?? defaultProjectRoot();
  const envBase = process.env;
  const port =
    deps.port ??
    (envBase.PRIVATE_RELEASE_PORT?.trim()
      ? privateReleasePortFromEnv(envBase)
      : await pickFreePort());
  const origin = privateReleaseOriginForPort(port);
  const readinessTimeoutMs = deps.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const readinessPollMs = deps.readinessPollMs ?? DEFAULT_READINESS_POLL_MS;
  const createStateDir = deps.createStateDir ?? (() => createEphemeralLocalD1StateDir(projectRoot));
  const runCrawl = deps.runCrawl ?? defaultRunCrawl;
  const startDevServer = deps.startDevServer ?? defaultStartDevServer;
  const waitForReady = deps.waitForReady ?? ((base, options) => pollHealthUntilReady(base, options));
  const runVerify = deps.runVerify ?? defaultRunVerify;
  const cleanupStateDir = deps.cleanupStateDir ?? defaultCleanupStateDir;

  const stateDir = createStateDir();
  const env = buildPrivateReleaseIntegrationEnv({ projectRoot, stateDir, port });
  let devServer: DevServerHandle | undefined;

  try {
    const crawl = await runCrawl(env);
    const crawlReport = parseCrawlReport(crawl.stdout);
    if (crawl.exitCode !== 0) {
      return {
        ok: false,
        stage: "crawl",
        origin,
        crawlReport,
        crawlStdout: crawl.stdout,
        crawlStderr: crawl.stderr,
      };
    }

    devServer = await Promise.resolve(startDevServer({ projectRoot, stateDir, port, env }));
    try {
      await waitForReady(origin, { timeoutMs: readinessTimeoutMs, pollMs: readinessPollMs });
    } catch (error) {
      return {
        ok: false,
        stage: "ready",
        origin,
        crawlReport,
        readyDetail: error instanceof Error ? error.message : String(error),
      };
    }

    const verify = await runVerify(env);
    if (verify.exitCode !== 0) {
      return {
        ok: false,
        stage: "verify",
        origin,
        crawlReport,
        verifyStdout: verify.stdout,
        verifyStderr: verify.stderr,
      };
    }

    return { ok: true, origin, crawlReport };
  } finally {
    if (devServer) {
      await devServer.kill().catch(() => {});
    }
    cleanupStateDir(stateDir);
  }
}

export function createEphemeralLocalD1StateDir(projectRoot: string): string {
  const baseDir = join(projectRoot, dirname(DEFAULT_LOCAL_D1_STATE_DIR));
  mkdirSync(baseDir, { recursive: true });
  return mkdtempSync(join(baseDir, "private-release-"));
}

function defaultCleanupStateDir(stateDir: string): void {
  rmSync(stateDir, { recursive: true, force: true });
}

function defaultRunCrawl(env: NodeJS.ProcessEnv): Promise<CommandResult> {
  return runTsxScript("scripts/run-crawl.ts", env);
}

function defaultRunVerify(env: NodeJS.ProcessEnv): Promise<CommandResult> {
  return runTsxScript("scripts/private-release-verify.ts", env);
}

function defaultStartDevServer(args: {
  projectRoot: string;
  stateDir: string;
  port: number;
  env: NodeJS.ProcessEnv;
}): DevServerHandle {
  const wranglerBin = join(args.projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const child = spawn(
    process.execPath,
    [
      wranglerBin,
      "dev",
      "--local",
      "--persist-to",
      args.stateDir,
      "--port",
      String(args.port),
      "--ip",
      "127.0.0.1",
      "--show-interactive-dev-session",
      "false",
      "--log-level",
      "info",
    ],
    {
      cwd: args.projectRoot,
      env: args.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );

  if (!child.pid) {
    throw new Error("Failed to start wrangler dev for private-release integration");
  }

  pipeDevLogs(child);

  return {
    pid: child.pid,
    kill: async () => {
      await killChildProcess(child);
    },
  };
}

function runTsxScript(scriptPath: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const projectRoot = defaultProjectRoot();
  const tsxBin = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return runCommand({
    command: process.execPath,
    args: [tsxBin, join(projectRoot, scriptPath)],
    env,
    cwd: projectRoot,
  });
}

function runCommand(args: {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(args.command, args.args, {
      cwd: args.cwd,
      env: args.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function killChildProcess(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return;
  }
  const pid = child.pid;
  if (!pid) {
    return;
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } else {
    child.kill("SIGTERM");
  }

  await waitForProcessExit(child, 5_000);
  if (child.exitCode === null && !child.killed) {
    if (process.platform !== "win32") {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      child.kill("SIGKILL");
    }
    await waitForProcessExit(child, 2_000);
  }
}

function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

function pipeDevLogs(child: ChildProcess): void {
  child.stdout?.on("data", (chunk: Buffer | string) => {
    process.stderr.write(`[private-release:dev] ${String(chunk)}`);
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    process.stderr.write(`[private-release:dev] ${String(chunk)}`);
  });
}

function parseCrawlReport(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return trimmed;
  }
  try {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    return trimmed;
  }
}

function relativeProjectPath(projectRoot: string, targetPath: string): string {
  const resolved = resolve(targetPath);
  const relativePath = relative(projectRoot, resolved);
  return relativePath.startsWith("..") ? resolved : relativePath;
}

function defaultProjectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
