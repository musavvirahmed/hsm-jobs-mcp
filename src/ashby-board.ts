import { DEFAULT_CRAWL_FETCH_TIMEOUT_MS, fetchWithTimeout } from "./fetch-timeout";

export type AshbyJob = {
  id: string;
  title: string;
  location: string | null;
  jobUrl: string;
  descriptionPlain: string | null;
  compensationSummary: string | null;
};

export type ParsedAshbyBoard = {
  jobs: AshbyJob[];
};

export function ashbyBoardFeedUrl(boardToken: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}?includeCompensation=true`;
}

export function parseAshbyBoard(body: string): ParsedAshbyBoard | null {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { jobs?: unknown }).jobs)) {
    return null;
  }
  const jobs: AshbyJob[] = [];
  for (const raw of (payload as { jobs: unknown[] }).jobs) {
    const job = asAshbyJob(raw);
    if (job) jobs.push(job);
  }
  return { jobs };
}

function asAshbyJob(raw: unknown): AshbyJob | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const jobUrl = typeof row.jobUrl === "string" ? row.jobUrl.trim() : "";
  if (!title || !jobUrl) return null;
  const id = postingId(row.id, jobUrl);
  if (!id) return null;
  const location = typeof row.location === "string" && row.location.trim() ? row.location.trim() : null;
  const descriptionPlain =
    typeof row.descriptionPlain === "string" && row.descriptionPlain.trim()
      ? row.descriptionPlain
      : null;
  return {
    id,
    title,
    location,
    jobUrl,
    descriptionPlain,
    compensationSummary: compensationSummary(row.compensation),
  };
}

function postingId(id: unknown, jobUrl: string): string | null {
  if (typeof id === "string" && id.trim()) return id.trim();
  try {
    const path = new URL(jobUrl).pathname.split("/").filter(Boolean);
    return path.at(-1) ?? null;
  } catch {
    return null;
  }
}

function compensationSummary(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const summary = (raw as { scrapeableCompensationSalarySummary?: unknown })
    .scrapeableCompensationSalarySummary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

export type BoardFeedResponse =
  | { ok: true; status: number; body: string }
  | { ok: false; status: number | null };

export function createAshbyBoardFeedFetcher(
  fetchImpl: typeof fetch = fetch,
  options: { timeoutMs?: number } = {},
): (url: string) => Promise<BoardFeedResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CRAWL_FETCH_TIMEOUT_MS;
  return async (url) => {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "hsm-jobs-mcp/0.1 (opening-ingest; public board feed)",
          },
        },
        { timeoutMs },
      );
      if (!response.ok) {
        return { ok: false, status: response.status };
      }
      return { ok: true, status: response.status, body: await response.text() };
    } catch {
      return { ok: false, status: null };
    }
  };
}
