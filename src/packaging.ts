import { SHARED_RELEASE_HOST } from "./index-pass";

export const SHARED_RELEASE_ORIGIN = `https://${SHARED_RELEASE_HOST}`;
export const HSM_MCP_ORIGIN = "https://hsm.codealan.com";
export const CLIENT_KEY = "hsm-jobs";
export const HSM_MCP_CLIENT_KEY = "ind-sponsors";
export const SERVER_NAME = "hsm-jobs-mcp";
/** Plain-text shared-release WIP marker beside the public `/mcp` URL until unlock. */
export const SHARED_RELEASE_WIP_MARKER = "coming soon";
/** GitHub repository About (sidebar description). */
export const GITHUB_ABOUT =
  "MCP server to quickly find latest job openings by IND recognised sponsors. Especially helpful if you are tired of linkedin job browsing and messing with ghost job openings.";

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

/** Locked v1 example asks — must match tools/args only (no aggregates, no get_job URL prompt). */
export const EXAMPLE_ASKS = [
  "Which recognised sponsors are hiring product designers?",
  "Which recognised sponsors are hiring software engineers in Amsterdam?",
  "What Openings do you have for KvK 60733144?",
  "How fresh is the jobs index?",
  'Is Adyen a recognised sponsor? (use hsm-mcp / ind-sponsors — not this server)',
] as const;

export const READING_THE_ANSWERS_GIST = [
  "Honesty fields (salary signal, Dutch-required, sponsorship willingness) stay separate — unknown is valid.",
  "Register join is match strength, not a yes/no verdict that this vacancy will sponsor your HSM transfer.",
  "This server does not compare pay to the IND salary criterion — you or your agent do.",
  "Empty results are not proof that no Openings exist; check index scope on partial indexes.",
] as const;

export const PUBLIC_PATHS = ["/", "/mcp", "/health"] as const;
