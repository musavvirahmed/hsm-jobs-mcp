import type { HsmMcpAdapter } from "./hsm-mcp";
import type { JobsIndex } from "./jobs-index";
import type { IndexStatusOutput, SearchJobsOutput, GetJobOutput } from "./schemas";
import { getJobInputSchema, searchJobsInputSchema } from "./schemas";

export type JobsToolsDeps = {
  jobsIndex: JobsIndex;
  hsmMcp: HsmMcpAdapter;
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
  const openings = await deps.jobsIndex.searchOpenings({
    query: parsed.query,
    kvk: parsed.kvk,
    location: parsed.location,
    limit: parsed.limit,
  });
  return { openings, index_scope: snapshot.index_scope };
}

export async function getJob(args: unknown, deps: JobsToolsDeps): Promise<GetJobOutput> {
  const parsed = getJobInputSchema.parse(args);
  const snapshot = await deps.jobsIndex.snapshot();
  await deps.jobsIndex.getOpening(parsed.url);
  return { found: false, index_scope: snapshot.index_scope };
}

export function structuredToolResult<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}
