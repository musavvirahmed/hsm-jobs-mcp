import { McpServer } from "@modelcontextprotocol/server";
import { serverIcons } from "./favicon";
import {
  getIndexStatus,
  getJob,
  searchJobs,
  structuredToolResult,
  type JobsToolsDeps,
} from "./jobs-tools";
import { SHARED_RELEASE_ORIGIN } from "./packaging";
import {
  getJobInputSchema,
  getJobOutputSchema,
  indexStatusOutputSchema,
  searchJobsInputSchema,
  searchJobsOutputSchema,
} from "./schemas";

export const SERVER_NAME = "hsm-jobs-mcp";
export const SERVER_VERSION = "0.1.0";

export function createJobsMcpServer(
  deps: JobsToolsDeps,
  origin: string = SHARED_RELEASE_ORIGIN,
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    websiteUrl: origin,
    icons: serverIcons(origin),
  });

  server.registerTool(
    "search_jobs",
    {
      title: "Search openings",
      description:
        "Search the jobs index for Openings matching a title/free text query or KvK. Returns short cards without JD body, plus index scope. Surface each Opening's primary_url as a clickable link. Prefer quoting result_note for coverage, caps, and join status only; only mention a result cap when results_truncated is true.",
      inputSchema: searchJobsInputSchema,
      outputSchema: searchJobsOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => structuredToolResult(await searchJobs(args, deps)),
  );

  server.registerTool(
    "get_job",
    {
      title: "Get one opening",
      description:
        "Look up an Opening by its primary_url. Returns a structured miss when that URL is not in the jobs index. On a hit, surface primary_url as a clickable link.",
      inputSchema: getJobInputSchema,
      outputSchema: getJobOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => structuredToolResult(await getJob(args, deps)),
  );

  server.registerTool(
    "get_index_status",
    {
      title: "Get jobs index status",
      description:
        "Jobs-index health and index scope. Does not report IND register last-updated or register row_count.",
      outputSchema: indexStatusOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => structuredToolResult(await getIndexStatus(deps)),
  );

  return server;
}
