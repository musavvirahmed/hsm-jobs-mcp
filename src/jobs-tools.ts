import type { HsmMcpAdapter } from "./hsm-mcp";
import {
  registerJoinFromOpening,
  type IndexPass,
  type JobsIndex,
  type OpeningRecord,
  type RegisterJoin,
} from "./jobs-index";
import type { IndexStatusOutput, SearchJobsOutput, GetJobOutput } from "./schemas";
import { getJobInputSchema, searchJobsInputSchema } from "./schemas";

export type JobsToolsDeps = {
  jobsIndex: JobsIndex;
  hsmMcp: HsmMcpAdapter;
};

type RegisterJoinRevalidation = {
  status: "ok" | "stale" | "error";
  present: string[];
};

export async function getIndexStatus(deps: JobsToolsDeps): Promise<IndexStatusOutput> {
  return deps.jobsIndex.snapshot();
}

export async function searchJobs(
  args: unknown,
  deps: JobsToolsDeps,
): Promise<SearchJobsOutput> {
  const parsed = searchJobsInputSchema.parse(args);
  const snapshot = await deps.jobsIndex.snapshot();
  const fetched = await deps.jobsIndex.searchOpenings({
    query: parsed.query,
    kvk: parsed.kvk,
    location: parsed.location,
    limit: parsed.limit + 1,
  });
  const results_truncated = fetched.length > parsed.limit;
  const openings = fetched.slice(0, parsed.limit);
  const revalidation = await revalidateOpenings(openings, deps.hsmMcp);
  return {
    openings: openings.map((opening) => toSearchCard(opening, hybridJoin(opening, revalidation))),
    index_scope: snapshot.index_scope,
    register_join_status: revalidation.status,
    results_truncated,
    result_note: formatSearchResultNote({
      pass: snapshot.index_scope.pass,
      register_as_of: snapshot.index_scope.register_as_of,
      register_join_status: revalidation.status,
      results_truncated,
      returned: openings.length,
    }),
  };
}

export function formatSearchResultNote(input: {
  pass: IndexPass;
  register_as_of: string | null;
  register_join_status: RegisterJoinRevalidation["status"];
  results_truncated: boolean;
  returned: number;
}): string {
  const registerBit = input.register_as_of
    ? ` (register as of ${input.register_as_of})`
    : "";
  const coverage =
    input.pass === "full_careers_pass"
      ? `Full Work-register coverage${registerBit}.`
      : `Partial index so far${registerBit} — more sponsors still being checked.`;

  const join =
    input.register_join_status === "ok"
      ? "Sponsor matches look current."
      : input.register_join_status === "stale"
        ? "Sponsor matches may be a little behind."
        : "Could not refresh sponsor matches just now; cards still show last-known join.";

  if (input.results_truncated) {
    return `${coverage} Showing the top ${input.returned} matches — more exist. Try a tighter title or location to narrow the list. ${join}`;
  }
  return `${coverage} ${join}`;
}

export async function getJob(args: unknown, deps: JobsToolsDeps): Promise<GetJobOutput> {
  const parsed = getJobInputSchema.parse(args);
  const snapshot = await deps.jobsIndex.snapshot();
  const opening = await deps.jobsIndex.getOpening(parsed.url);
  if (!opening) {
    return { found: false, index_scope: snapshot.index_scope };
  }
  const revalidation = await revalidateOpenings([opening], deps.hsmMcp);
  return {
    found: true,
    ...toSearchCard(opening, hybridJoin(opening, revalidation)),
    jd_extract: opening.jd_extract,
    index_scope: snapshot.index_scope,
    register_join_status: revalidation.status,
  };
}

function hybridJoin(opening: OpeningRecord, revalidation: RegisterJoinRevalidation): RegisterJoin {
  const stored = registerJoinFromOpening(opening);
  if (revalidation.status !== "ok") {
    return stored;
  }
  if (stored.kvk && !revalidation.present.includes(stored.kvk)) {
    return { ...stored, strength: "unmatched" };
  }
  return stored;
}

export function structuredToolResult<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

async function revalidateOpenings(
  openings: OpeningRecord[],
  hsmMcp: HsmMcpAdapter,
): Promise<RegisterJoinRevalidation> {
  const kvks = [
    ...new Set(openings.map((opening) => opening.register_kvk).filter((kvk): kvk is string => kvk !== null)),
  ];
  return hsmMcp.revalidateKvks(kvks);
}

function toSearchCard(opening: OpeningRecord, registerJoin: RegisterJoin) {
  return {
    title: opening.title,
    url: opening.primary_url,
    location: opening.location,
    ...(opening.careers_url ? { careers_url: opening.careers_url } : {}),
    ...(opening.ats_url ? { ats_url: opening.ats_url } : {}),
    register_join: registerJoin,
    source_class: opening.source_class,
    honesty_salary: opening.honesty_salary,
    honesty_dutch_required: opening.honesty_dutch_required,
    honesty_sponsorship_willingness: opening.honesty_sponsorship_willingness,
  };
}
