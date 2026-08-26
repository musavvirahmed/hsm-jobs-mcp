# hsm-jobs-mcp

Working name. Spec-first. Do not implement the MCP, a public portal, or the 13k crawl until the Wayfinder map is clear and `/to-spec` has run.

Kennismigrants in the Netherlands need jobs at [IND recognised sponsors](https://ind.nl/en/public-register-recognised-sponsors/public-register-work). This repo will specify an MCP that searches **open jobs** on those companies’ own careers/ATS pages. It wraps register lookup (see [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp)); it does not clone it.

## Any agent, any IDE

1. Read [`AGENTS.md`](AGENTS.md), [`CONTEXT.md`](CONTEXT.md), [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).
2. Open the GitHub issue labelled `wayfinder:map`.
3. Take one unblocked, unassigned child. Assign it first. Resolve it. Stop.
4. When no tickets remain: `/to-spec` on the map, then `/to-tickets`, then `/implement`.

Plan, don’t do. Tickets are questions. Refer to them by name.

## Golden test

[Rentman Product Designer](https://rentman.io/jobs/product-designer) — `Rentman B.V.` / KvK `60733144`. If the pipeline cannot return that URL, it is not ready.
