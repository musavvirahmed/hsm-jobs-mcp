import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobsIndex, WritableJobsIndex } from "./jobs-index";
import {
  createSqliteJobsIndex,
  createSqliteWritableJobsIndex,
} from "./sqlite-jobs-index";


/** Same `database_name` as `wrangler.jsonc` — local D1 persistence key for private release. */
export const LOCAL_D1_DATABASE_NAME = "hsm-jobs-index";

/** Default operator target for private release (see Spec: Private release ops slice). */
export const DEFAULT_JOBS_INDEX_TARGET = "local-d1";

/** Default wrangler `--persist-to` directory relative to the project root. */
export const DEFAULT_LOCAL_D1_STATE_DIR = ".wrangler/state";

export type JobsIndexTarget =
  | { kind: "local-d1" }
  | { kind: "remote-d1" }
  | { kind: "sqlite"; path: string };

export type OperatorJobsIndexOptions = {
  target?: JobsIndexTarget;
  /** Wrangler local persistence root (`--persist-to`). Defaults to `<projectRoot>/.wrangler/state`. */
  localD1StateDir?: string;
  projectRoot?: string;
};

export function parseJobsIndexTarget(raw: string): JobsIndexTarget {
  if (raw === "local-d1") {
    return { kind: "local-d1" };
  }
  if (raw === "remote-d1") {
    return { kind: "remote-d1" };
  }
  if (raw.startsWith("sqlite:")) {
    const path = raw.slice("sqlite:".length);
    if (!path) {
      throw new Error("JOBS_INDEX_TARGET sqlite: requires a path (e.g. sqlite:/tmp/jobs-index.sqlite)");
    }
    return { kind: "sqlite", path };
  }
  throw new Error(
    `Unknown JOBS_INDEX_TARGET "${raw}"; expected local-d1, remote-d1, or sqlite:<path>`,
  );
}

export function jobsIndexTargetFromEnv(env: NodeJS.ProcessEnv = process.env): JobsIndexTarget {
  return parseJobsIndexTarget(env.JOBS_INDEX_TARGET?.trim() || DEFAULT_JOBS_INDEX_TARGET);
}

export function formatJobsIndexTarget(target: JobsIndexTarget): string {
  if (target.kind === "sqlite") {
    return `sqlite:${target.path}`;
  }
  return target.kind;
}

export type CrawlJobsIndex = {
  index: WritableJobsIndex;
  /** Log label for crawl JSON output (`memory (CRAWL_SMOKE=1)` or a jobs index target). */
  targetLabel: string;
};

/** Writable jobs index for `scripts/run-crawl.ts` — smoke stays in-memory; live uses the operator resolver. */
export async function createCrawlJobsIndex(options: {
  smoke: boolean;
  env?: NodeJS.ProcessEnv;
  operatorOptions?: OperatorJobsIndexOptions;
}): Promise<CrawlJobsIndex> {
  if (options.smoke) {
    return {
      index: createSqliteWritableJobsIndex(":memory:"),
      targetLabel: "memory (CRAWL_SMOKE=1)",
    };
  }
  const target = options.operatorOptions?.target ?? jobsIndexTargetFromEnv(options.env);
  const index = await createOperatorWritableJobsIndex({
    ...options.operatorOptions,
    target,
  });
  return {
    index,
    targetLabel: formatJobsIndexTarget(target),
  };
}

export function localD1StateDirFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  projectRoot = defaultProjectRoot(),
): string {
  const override = env.JOBS_INDEX_LOCAL_D1_STATE?.trim();
  if (override) {
    return resolve(projectRoot, override);
  }
  return join(projectRoot, DEFAULT_LOCAL_D1_STATE_DIR);
}

/** Operator-facing writable jobs index for crawl / ingest (ADR 0009 private release seam). */
export async function createOperatorWritableJobsIndex(
  options: OperatorJobsIndexOptions = {},
): Promise<WritableJobsIndex> {
  const target = options.target ?? jobsIndexTargetFromEnv();
  if (target.kind === "remote-d1") {
    throw new Error(
      "JOBS_INDEX_TARGET=remote-d1 is not implemented in this slice; use local-d1 or sqlite:<path>",
    );
  }
  if (target.kind === "sqlite") {
    return createSqliteWritableJobsIndex(target.path);
  }
  const sqlitePath = await prepareLocalD1SqlitePath(options);
  return createSqliteWritableJobsIndex(sqlitePath, { skipMigrations: true });
}

/** Read-only jobs index over the same operator target (query plane / verify). */
export async function createOperatorJobsIndex(
  options: OperatorJobsIndexOptions = {},
): Promise<JobsIndex> {
  const target = options.target ?? jobsIndexTargetFromEnv();
  if (target.kind === "remote-d1") {
    throw new Error(
      "JOBS_INDEX_TARGET=remote-d1 is not implemented in this slice; use local-d1 or sqlite:<path>",
    );
  }
  if (target.kind === "sqlite") {
    return createSqliteJobsIndex(target.path);
  }
  const sqlitePath = await prepareLocalD1SqlitePath(options);
  return createSqliteJobsIndex(sqlitePath, { skipMigrations: true });
}

async function prepareLocalD1SqlitePath(options: OperatorJobsIndexOptions): Promise<string> {
  const projectRoot = options.projectRoot ?? defaultProjectRoot();
  const stateDir = options.localD1StateDir ?? localD1StateDirFromEnv(process.env, projectRoot);
  mkdirSync(stateDir, { recursive: true });
  applyLocalD1Migrations(stateDir, projectRoot);
  return resolveLocalD1SqlitePath(stateDir);
}

function applyLocalD1Migrations(stateDir: string, projectRoot: string): void {
  const wranglerBin = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    process.execPath,
    [
      wranglerBin,
      "d1",
      "migrations",
      "apply",
      LOCAL_D1_DATABASE_NAME,
      "--local",
      "--persist-to",
      stateDir,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      `wrangler d1 migrations apply ${LOCAL_D1_DATABASE_NAME} --local failed${detail ? `: ${detail}` : ""}`,
    );
  }
}

function resolveLocalD1SqlitePath(stateDir: string): string {
  const d1Dir = join(stateDir, "v3", "d1", "miniflare-D1DatabaseObject");
  const sqliteFiles = readdirSync(d1Dir).filter(
    (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
  );
  if (sqliteFiles.length !== 1) {
    throw new Error(
      `Expected exactly one local D1 sqlite file in ${d1Dir}, found ${sqliteFiles.length}`,
    );
  }
  return join(d1Dir, sqliteFiles[0]!);
}

function defaultProjectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}
