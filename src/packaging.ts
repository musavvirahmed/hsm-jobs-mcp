import { SHARED_RELEASE_HOST } from "./index-pass";

export const SHARED_RELEASE_ORIGIN = `https://${SHARED_RELEASE_HOST}`;
export const HSM_MCP_ORIGIN = "https://hsm.codealan.com";
export const CLIENT_KEY = "hsm-jobs";
export const HSM_MCP_CLIENT_KEY = "ind-sponsors";
export const SERVER_NAME = "hsm-jobs-mcp";

export const IND_HSM_PERMIT_URL =
  "https://ind.nl/en/residence-permits/work/highly-skilled-migrant";
export const IND_PUBLIC_REGISTER_WORK_URL =
  "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";

export const V1_JOBS_TOOLS = [
  {
    name: "search_jobs",
    description: "Openings at recognised sponsors by title/free text or 8-digit KvK; optional location.",
  },
  {
    name: "get_job",
    description: "One Opening by its primary careers or ATS URL; returns structured miss when absent.",
  },
  {
    name: "get_index_status",
    description: "Jobs-index health, crawl freshness, and index scope (partial vs full careers pass).",
  },
] as const;

/** Job-shaped asks for the Discovery page “Then just ask” box. */
export const EXAMPLE_JOB_ASKS = [
  "Which recognised sponsors are hiring product designers?",
  "Which recognised sponsors are hiring software engineers in Amsterdam?",
  "What Openings do you have for KvK 60733144?",
  "How fresh is the jobs index?",
] as const;

/** Register-only ask — shown under Connect, not in the job-shaped list. */
export const REGISTER_ONLY_ASK =
  "Is Booking.com a recognised sponsor? (use hsm-mcp / ind-sponsors - not this server)";

/** Locked v1 example asks — job asks plus register-only redirect. */
export const EXAMPLE_ASKS = [...EXAMPLE_JOB_ASKS, REGISTER_ONLY_ASK] as const;

export const READING_THE_ANSWERS_GIST = [
  "Salary, Dutch-required, and sponsorship signals stay separate. Unknown is a valid answer.",
  "A match to the register is not a promise that this job will sponsor your transfer.",
  "This server does not check pay against the IND salary minimum. You or your AI do that.",
  "No results does not mean no Openings exist. Ask how complete the index is (get_index_status).",
] as const;

export const PUBLIC_PATHS = ["/", "/mcp", "/health"] as const;
