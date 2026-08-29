import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createD1JobsIndex,
  createD1WritableJobsIndex,
  type JobsIndexDatabase,
} from "./d1-jobs-index";
import type { JobsIndex, WritableJobsIndex } from "./jobs-index";

/** Same `database_name` as `wrangler.jsonc` — remote D1 persistence key for shared release. */
const REMOTE_D1_DATABASE_NAME = "hsm-jobs-index";

export type RemoteD1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

export type RemoteD1QueryResult = {
  results: Record<string, unknown>[];
  success: boolean;
};

/** Seam for operator remote D1 writes (Cloudflare REST or test stub). */
export type RemoteD1QueryClient = {
  query(sql: string, params?: unknown[]): Promise<RemoteD1QueryResult>;
};

export type RemoteD1JobsIndexOptions = {
  config?: RemoteD1Config;
  client?: RemoteD1QueryClient;
  projectRoot?: string;
  skipMigrations?: boolean;
  fetchFn?: typeof fetch;
};

export function remoteD1ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RemoteD1Config {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const databaseId = env.D1_DATABASE_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const missing: string[] = [];
  if (!accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!databaseId) missing.push("D1_DATABASE_ID");
  if (!apiToken) missing.push("CLOUDFLARE_API_TOKEN");
  if (missing.length > 0) {
    throw new Error(
      `JOBS_INDEX_TARGET=remote-d1 requires ${missing.join(", ")} in .env (see .env.example)`,
    );
  }
  return { accountId: accountId!, databaseId: databaseId!, apiToken: apiToken! };
}

export function createCloudflareRemoteD1QueryClient(
  config: RemoteD1Config,
  fetchFn: typeof fetch = fetch,
): RemoteD1QueryClient {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  return {
    async query(sql, params = []) {
      const response = await fetchFn(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        errors?: Array<{ message?: string }>;
        result?: Array<{ results?: Record<string, unknown>[]; success?: boolean }>;
      };
      if (!response.ok || !body.success) {
        const detail =
          body.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
          `HTTP ${response.status}`;
        throw new Error(`remote D1 query failed: ${detail}`);
      }
      const batch = body.result?.[0];
      if (!batch?.success) {
        throw new Error("remote D1 query returned an unsuccessful batch result");
      }
      return {
        results: batch.results ?? [],
        success: true,
      };
    },
  };
}

export function createRemoteD1Database(client: RemoteD1QueryClient): JobsIndexDatabase {
  return {
    prepare(query: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first<T = Record<string, unknown>>() {
          const result = await client.query(query, bound);
          const row = result.results[0];
          return (row as T | undefined) ?? null;
        },
        async all<T = Record<string, unknown>>() {
          const result = await client.query(query, bound);
          return { results: result.results as T[] };
        },
        async run() {
          await client.query(query, bound);
          return { success: true };
        },
      };
      return statement;
    },
  };
}

export function applyRemoteD1Migrations(options: { projectRoot?: string } = {}): void {
  const projectRoot = options.projectRoot ?? defaultProjectRoot();
  const wranglerBin = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(
    process.execPath,
    [wranglerBin, "d1", "migrations", "apply", REMOTE_D1_DATABASE_NAME, "--remote"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      `wrangler d1 migrations apply ${REMOTE_D1_DATABASE_NAME} --remote failed${detail ? `: ${detail}` : ""}`,
    );
  }
}

export async function createRemoteD1WritableJobsIndex(
  options: RemoteD1JobsIndexOptions = {},
): Promise<WritableJobsIndex> {
  if (!options.skipMigrations) {
    applyRemoteD1Migrations({ projectRoot: options.projectRoot });
  }
  const client =
    options.client ??
    createCloudflareRemoteD1QueryClient(
      options.config ?? remoteD1ConfigFromEnv(),
      options.fetchFn,
    );
  return createD1WritableJobsIndex(createRemoteD1Database(client));
}

export async function createRemoteD1JobsIndex(
  options: RemoteD1JobsIndexOptions = {},
): Promise<JobsIndex> {
  const client =
    options.client ??
    createCloudflareRemoteD1QueryClient(
      options.config ?? remoteD1ConfigFromEnv(),
      options.fetchFn,
    );
  return createD1JobsIndex(createRemoteD1Database(client));
}

function defaultProjectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}
