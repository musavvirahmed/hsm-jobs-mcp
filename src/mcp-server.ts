import { McpServer } from "@modelcontextprotocol/server";
import {
  getIndexStatus,
  getJob,
  searchJobs,
  structuredToolResult,
  type JobsToolsDeps,
} from "./jobs-tools";
import {
  getJobInputSchema,
  getJobOutputSchema,
  indexStatusOutputSchema,
  searchJobsInputSchema,
  searchJobsOutputSchema,
} from "./schemas";

export const SERVER_NAME = "hsm-jobs-mcp";
export const SERVER_VERSION = "0.1.0";

export function createJobsMcpServer(deps: JobsToolsDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "search_jobs",
    {
      title: "Search openings",
      description:
        "Search the jobs index for Openings matching a title/free text query or KvK. Returns short cards without JD body, plus index scope.",
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
        "Look up an Opening by its primary URL. Returns a structured miss when the URL is not in the jobs index.",
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
