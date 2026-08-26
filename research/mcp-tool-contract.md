# MCP tool contract vs existing register tools

**Ticket:** [MCP tool contract vs existing register tools](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/5)
**Date:** 2026-08-26
**Status:** proposal for grilling — **not a lock**. The lock belongs on [v1 MCP contract](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/7).

## Question

What v1 tools and arguments should **hsm-jobs-mcp** *propose* so grilling is informed? Contrast with **hsm-mcp**’s existing register tools. Transport (Streamable HTTP vs stdio) is a proposal, not a lock.

## Settled (do not re-open)

- **MCP-first**, not a website IA study. A later public site, if any, is a client of the same index ([map destination](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/1); `CONTEXT.md`).
- Layer 2 only: open jobs on recognised-sponsor careers/ATS. Wrap or cite **hsm-mcp**; do not clone the IND register as the product (`CONTEXT.md`, `AGENTS.md`).
- Explicit **non-tools:** designer-headcount, hiring-velocity charts, “sort sponsors by team size” (map briefing; grilling ticket [v1 MCP contract](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/7)).
- Any title in the index; PD/UX is the **golden test**, not the corpus limit. Golden test: [Rentman Product Designer](https://rentman.io/jobs/product-designer) — `Rentman B.V.` / KvK `60733144`.
- Licensed ≠ this vacancy will sponsor you. Most JDs omit pay and language. Return **unknown**, do not invent certainty (`CONTEXT.md`). Field *shape* for those unknowns is the [Honesty model](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/6) ticket.

---

## 1. What hsm-mcp actually exposes

Primary sources: [CodeAlanDebug/hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp) `README.md`, `src/mcp.ts`, `src/types.ts`, [ADR 0001](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/docs/adr/0001-ranked-candidates-no-verdict.md), live `tools/list` and `tools/call` against `https://hsm.codealan.com/mcp` on 2026-08-26.

### Transport and identity

| Fact | Evidence |
|---|---|
| Remote **Streamable HTTP** at `/mcp` | README: “serves two MCP tools over Streamable HTTP”; `src/index.ts` routes `pathname.startsWith("/mcp")` to `HsmMcp.serve("/mcp", …)` |
| Client config | README / `CLAUDE.md`: `{ "mcpServers": { "ind-sponsors": { "url": "https://hsm.codealan.com/mcp" } } }`; Claude Code: `claude mcp add --transport http ind-sponsors https://hsm.codealan.com/mcp` |
| Server name | `McpServer({ name: "ind-sponsor-register", version: "0.1.0" })` in `src/mcp.ts`. Live `initialize` returned the same `serverInfo`. |
| Protocol on the wire today | Live `initialize` negotiated `protocolVersion: "2025-03-26"`; response was `Content-Type: text/event-stream` with `mcp-session-id`. SDK pin: `@modelcontextprotocol/sdk` **1.23.0** (`package.json`). |
| Auth | None. Per-IP **30 req/min** (`src/index.ts` `RATE_LIMITER`; README). |
| Tools capability | Live initialize: `{ "tools": { "listChanged": true } }`. Two tools only. |

This is a **remote multi-client** server in the sense of the MCP architecture docs: Streamable HTTP servers typically serve many clients; stdio servers typically serve one local client ([Architecture overview](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)).

### Tool: `search_sponsors`

Live `inputSchema` (draft-07, from `tools/list` 2026-08-26), matching Zod in `src/mcp.ts`:

| Argument | Type | Required | Constraints |
|---|---|---|---|
| `query` | string | yes | `minLength: 2`. Description: “Company name or 8-digit KvK number” |
| `limit` | integer | no | min 1, max 20, **default 5** |

Description (verbatim from live `tools/list` / `src/mcp.ts`): search the IND Work register; return **ranked candidates, not a yes/no verdict**; empty result does not prove unrecognised; KvK match is identity-grade.

**Result** (JSON string inside a single `content[0].type = "text"` block — **no** `outputSchema` / `structuredContent`):

```json
{
  "candidates": [
    { "name": "Rentman B.V.", "kvk_number": "60733144", "match_type": "base_name", "score": 0.95 }
  ],
  "register_updated": "2026-08-03",
  "stale": false
}
```

Live calls on 2026-08-26: query `"Rentman"` → `base_name` score 0.95 plus a weaker substring; query `"60733144"` → `exact_kvk` score 1. Empty lists add `note` with the trade-name caveat (`NO_MATCH_NOTE` in `src/mcp.ts`).

`Candidate` in `src/types.ts`: `name`, `kvk_number`, `match_type` (`exact_kvk` \| `exact_name` \| `base_name` \| `substring` \| `fuzzy`), `score` 0..1.

### Tool: `get_register_status`

No parameters. Live `inputSchema`: `{ "type": "object", "properties": {} }` (empty object; spec’s preferred no-arg form is `{ "type": "object", "additionalProperties": false }` — [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

Live result 2026-08-26:

```json
{
  "ind_last_updated": "2026-08-03",
  "row_count": 12931,
  "last_scrape_success": "2026-08-26T06:17:28.800Z",
  "last_scrape_attempt": "2026-08-26T06:17:28.800Z",
  "consecutive_failures": 0,
  "last_error": null,
  "stale": false,
  "source": "https://ind.nl/en/public-register-recognised-sponsors/public-register-work"
}
```

### Hard design we should not copy blindly

[ADR 0001](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/docs/adr/0001-ranked-candidates-no-verdict.md) (accepted 2026-07-08): **never a boolean verdict**. The LLM judges whether a candidate *is* the queried company. Empty ≠ cannot sponsor.

`CLAUDE.md` (hsm-mcp): “Tool descriptions carry the domain caveats (no-verdict, trade-name gap); treat description text as part of the API.”

That pattern **does** transfer to hsm-jobs-mcp (honest unknowns in descriptions + payloads). Cloning the two tool names, or re-implementing register search, **does not**.

---

## 2. MCP spec constraints (tools + transport)

Primary: [2026-07-28 Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio), [Architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture), [schema `ToolAnnotations`](https://modelcontextprotocol.io/specification/2026-07-28/schema#toolannotations).

### Tools

- Tools are **model-controlled**; hosts SHOULD keep a human in the loop to deny invocations.
- `name` **SHOULD** be 1–128 chars, `[A-Za-z0-9_.-]`, case-sensitive, unique **per server**. Aggregating clients MAY prefix when two servers both expose `search`.
- `inputSchema` **MUST** be a JSON Schema object (`type: "object"`). Default dialect 2020-12 if `$schema` omitted. hsm-mcp emits draft-07 because of Zod + SDK 1.23.0.
- Optional `outputSchema` + result field `structuredContent`. If `outputSchema` is set, servers **MUST** conform; for compatibility they **SHOULD** also put serialized JSON in a `text` content block. hsm-mcp does text-only JSON today.
- No-arg tools: prefer `{ "type": "object", "additionalProperties": false }`.
- `ToolAnnotations` (hints, untrusted unless the server is trusted): `readOnlyHint` (default false), `destructiveHint` (default true, only if not read-only), `idempotentHint`, `openWorldHint` (default true). Job search is read-only, idempotent at the protocol level, and **open-world** (live index / external listings).
- Spec 2026-07-28 is **stateless**: no protocol-level sessions; each Streamable HTTP POST is its own request. hsm-mcp on 2025-03-26 still uses `mcp-session-id`. Implementation should follow whichever spec revision the chosen SDK speaks; that is stack fog, not this ticket.

### Transports (only two current)

| Transport | Spec role | Fit for a shared jobs index |
|---|---|---|
| **stdio** | Client launches a **subprocess**; newline-delimited JSON-RPC on stdin/stdout; no network auth | Local/dev, single user. Cannot share one crawl index across Cursor + Claude + a later web client without each process holding data. |
| **Streamable HTTP** | Independent process; **one MCP endpoint**, client **POST**s JSON-RPC; response `application/json` or `text/event-stream`. Introduced 2025-03-26; 2026-07-28 removed GET stream and protocol sessions. | Remote, multi-client, HTTP auth / OAuth later. MCP architecture: “MCP recommends using OAuth to obtain authentication tokens.” |
| HTTP+SSE (2024-11-05) | **Deprecated** since 2025-03-26 | Do not propose as v1. |

Cursor still documents three client transports — stdio, SSE, Streamable HTTP — and remote servers as `{ "url": "http://localhost:3000/mcp" }` ([Cursor MCP docs](https://cursor.com/docs/context/mcp)). SSE in the client is compatibility, not a reason to ship deprecated HTTP+SSE.

---

## 3. Anthropic and Cursor tool-schema conventions

### Anthropic (first-party)

[Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools): `name` must match `^[a-zA-Z0-9_-]{1,64}$` (stricter than MCP’s 128 + dots). `description` should say **what, when, when not, caveats**. Aim 3–4+ sentences. Parameter descriptions with examples. **Fewer, more capable tools** beat a tool per action. Namespacing (`github_list_prs`) matters when many servers are attached.

[Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) (2025-09-11):

- Do not wrap every API endpoint. Prefer a few tools for high-impact workflows (`search_*` over `list_*` of everything).
- Consolidate frequently chained steps (e.g. enrich search hits with register identity in one call rather than forcing `search_jobs` then `search_sponsors` for every row).
- Namespacing: MCP clients sometimes prefix; still avoid **colliding** names when both hsm-mcp and hsm-jobs-mcp are connected.
- Return high-signal fields; paginate/limit; `concise` vs `detailed` is optional if JD bodies blow the context.
- Prompt-engineer descriptions; use MCP annotations for open-world / read-only.

hsm-mcp already follows this: two tools, long caveat-laden descriptions, `limit` default 5, snake_case names that fit both MCP and Anthropic regexes.

### Cursor

[Cursor MCP](https://cursor.com/docs/context/mcp):

- Tools are a supported primitive. Default: user approval before each MCP tool; Auto-review can allowlist tools.
- Remote: `mcpServers.<name>.url` (+ optional `headers` / OAuth `auth`). Local: `command` / `args` / `env` (stdio).
- Same JSON-RPC tools as any MCP server — **no Cursor-specific input schema**. Conventions that matter: short snake_case names, detailed descriptions (the model only sees schema + description), remote HTTP if the index is shared.

Implication: a Cursor user who already has **hsm-mcp** (`ind-sponsors` → `https://hsm.codealan.com/mcp`) should be able to add **hsm-jobs-mcp** as a second server without tool-name clashes.

---

## 4. Contrast: register MCP vs jobs MCP

| | **hsm-mcp** (layer 1) | **hsm-jobs-mcp** (layer 2, proposed) |
|---|---|---|
| Question it answers | “Is this organisation on the Work register?” | “Which recognised sponsors have **open jobs** matching title/location?” |
| Identity | name + KvK only | Listing URL + brand/legal name + KvK (join, not a second register) |
| Verdict style | Ranked **candidates**, never yes/no (ADR 0001) | Ranked **listings**; salary / language / sponsorship willingness as structured **unknown**-capable fields (honesty ticket locks the enums) |
| Freshness tool | `get_register_status` (IND last-updated, scrape health) | Separate index health — crawl coverage, not register date. **Do not reuse the name** `get_register_status`. |
| Golden test | KvK `60733144` → `Rentman B.V.` (live: `exact_kvk`) | Same identity **plus** `https://rentman.io/jobs/product-designer` in results |
| Clone? | Already exists | Must not re-expose `search_sponsors` |

Clients may attach **both** servers. hsm-jobs-mcp may *call* hsm-mcp or a CSV snapshot at index-build time (map fog: “call hsm-mcp at query time vs snapshot”). That is an implementation seam, not a user-facing register-search tool.

---

## 5. Proposed v1 tool list (not locked)

Design goals borrowed from hsm-mcp + Anthropic: **two or three tools**, snake_case, long descriptions with caveats, `limit` caps, read-only open-world annotations. Enrich jobs with KvK in-process so the agent is not forced to chain register search for every hit.

### 5.1 `search_jobs` (core)

Search the **jobs index** (careers/ATS of recognised sponsors), not the IND HTML page.

**Proposed arguments** (JSON Schema object; grilling may drop or rename filters — “v1 facets still a decision” on [v1 MCP contract](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/7)):

| Argument | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **one of `query` or `kvk`** | Job title or free-text (“Product Designer”, “UX”). Not title-filtered to PD. `minLength` ~2 like hsm-mcp. |
| `location` | string | no | City / region / `remote` / country. Unspecified = no geo filter. |
| `kvk` | string | **one of `query` or `kvk`** | 8-digit; “what is this sponsor hiring?”. Pattern `^[0-9]{8}$`. |
| `limit` | integer | no | Default **10**, max **20** (same cap as hsm-mcp; slightly higher default because listings are the product). |

**Proposed description duties** (text is part of the API, as in hsm-mcp):

- Index is first-party careers/ATS, not aggregator boards, not LinkedIn.
- Hits are organisations that were on the Work register at index time; licensed ≠ this vacancy sponsors an **HSM transfer**.
- Salary, language, and sponsorship-willingness fields may be `unknown`.
- Empty list means “not in this index,” not “no jobs exist” (partial-index ship rule is [Partial-index ship rule](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/8)).

**Proposed hit fields** (shape for [Honesty model](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/6) / [Tool payloads with uncertainty badges](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/9) to refine — not locked here):

- `title`, `listing_url` (golden test: Rentman PD URL must be able to appear here)
- `employer_brand_name`, `registered_name`, `kvk_number`
- `location_text`
- salary / language / sponsorship as **explicit unknown-capable** structured fields (enums TBD by honesty grilling)
- `source` (e.g. ATS slug vs careers HTML) — not “LinkedIn”
- `index_updated` (or equivalent) so citations are dated, parallel to `register_updated`

Optional later: `response_format: concise | detailed` if full JD text in search blows tokens ([Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents)). Default **concise** (title, url, identity, location, honesty badges); `detailed` or a second tool for JD body.

**Annotations:** `readOnlyHint: true`, `openWorldHint: true`.

### 5.2 `get_job` (proposed split; grilling may fold into `search_jobs`)

Fetch **one** listing by `listing_url` or opaque `job_id` returned from `search_jobs`.

Rationale: token efficiency — search stays short; the agent loads JD extract only when the user drills in. Anthropic also allows consolidating this into `search_jobs` with `detailed` / a `listing_url` argument. **Grill whether v1 needs the split.**

If kept: required **one of** `listing_url` or `job_id`; same honesty fields as a search hit plus extracted JD text; same unknown rules.

### 5.3 `get_index_status` (core)

Parallel to hsm-mcp’s `get_register_status`, **different name**.

No arguments (`additionalProperties: false`).

**Proposed payload:**

- `jobs_count`, `sponsors_in_index` (KvKs with ≥1 listing)
- `last_successful_crawl_at`, `stale` (jobs-index staleness, **not** IND register date)
- `coverage_note` — e.g. partial ATS-only vs fuller careers pass (wording depends on [Partial-index ship rule](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/8))
- `register_join`: how identity was attached (`hsm-mcp` live vs snapshot) — implementation fog, but the field tells the client not to treat this as register freshness
- `source_policy`: first-party careers/ATS only

Do **not** duplicate `ind_last_updated` / `row_count` of the Work register; point the client at hsm-mcp’s `get_register_status` (or say “attach both servers”).

### 5.4 Explicit non-tools (v1)

Do not propose:

| Not a tool | Why |
|---|---|
| `search_sponsors` / `get_register_status` | Already hsm-mcp. Wrap/cite. Name collision if both servers attached. |
| Designer-headcount, hiring-velocity, sort-by-team-size | Layer 3 / LinkedIn. Out of scope (`CONTEXT.md`). |
| Apply, draft cover letter, scrape-now, LinkedIn people | Map out of scope. |
| `list_all_jobs` / dump index | Anthropic: search, don’t brute-force list. |
| Salary-criterion calculator as a fourth *required* tool | 2026 bands live in `CONTEXT.md`; honesty grilling can put comparison **on the job hit**. A tiny `get_salary_criterion` resource/tool is optional later, not v1 core. |

### 5.5 Naming

- Per-server names: `search_jobs`, `get_job`, `get_index_status` — distinct from `search_sponsors` / `get_register_status`.
- Fits Anthropic `^[a-zA-Z0-9_-]{1,64}$` and MCP name rules.
- Server `name` in `serverInfo`: propose `hsm-jobs` (or `hsm-jobs-mcp`) so clients can prefix on collision. Not a product rename.

---

## 6. Proposed transport (not locked)

**Propose Streamable HTTP as the v1 *product* transport**, stdio as a **dev/local** extra if useful.

Reasons (proposal, not lock):

1. Same client story as hsm-mcp: Cursor `url`, Claude Code `--transport http`, Claude Desktop custom connector.
2. One shared jobs index for many MCP clients; stdio would fork a process per host and cannot be “the” hosted index.
3. Map fog includes auth / rate limits / paid tier — Streamable HTTP is the transport that can grow HTTP auth or OAuth; stdio has no network auth ([Architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)).
4. Spec current remote standard; do not design v1 on deprecated HTTP+SSE.
5. Endpoint convention to match hsm-mcp: single path `/mcp` (example only; hosting is stack fog).

**stdio** remains valid for a local fixture server during prototypes ([Tool payloads with uncertainty badges](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/9)) without implying production stdio.

**Protocol revision:** hsm-mcp is on **2025-03-26** + sessions. New work should target the SDK’s current spec at implementation time (today: 2026-07-28 is current). Clients already speak both. Not a lock here.

---

## 7. Result encoding

Propose (not lock):

- Declare `outputSchema` for `search_jobs` / `get_job` / `get_index_status` so [Honesty model](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/6) can lock enums in schema, not prose.
- Return `structuredContent` **and** a `text` JSON copy ([Tools spec](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) SHOULD).
- Mirror hsm-mcp’s honesty-in-description habit so models do not invent salary or Dutch-required.

hsm-mcp’s text-only JSON is a 2025-03-26 SDK snapshot, not a reason to skip `outputSchema`.

---

## 8. Questions for the grilling ticket

These are for [v1 MCP contract](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/7), informed by this file:

1. Lock **Streamable HTTP** as product transport, with optional stdio for local prototypes?
2. Two tools (`search_jobs` + `get_index_status`) vs three (`+ get_job`)?
3. Required args: `query` only vs `query|kvk`? Is `location` a v1 facet?
4. Default `limit` 10 vs 5?
5. Must every hit include KvK even when brand/legal match is weak (candidate-style, like ADR 0001)?
6. Attach hsm-mcp as a sibling server vs silent join inside `search_jobs` only?
7. `outputSchema` + `structuredContent` in v1 vs text JSON like hsm-mcp?

Honesty enums and payload chrome stay on [Honesty model](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/6) and the prototype ticket.

---

## Sources

- [hsm-mcp README](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/README.md), [src/mcp.ts](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/src/mcp.ts), [src/types.ts](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/src/types.ts), [src/index.ts](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/src/index.ts), [CLAUDE.md](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/CLAUDE.md), [ADR 0001](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/docs/adr/0001-ranked-candidates-no-verdict.md), [package.json](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/package.json)
- Live `https://hsm.codealan.com/mcp`: `initialize`, `tools/list`, `tools/call` `search_sponsors` (`Rentman`, `60733144`), `get_register_status` (2026-08-26)
- [MCP Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio), [Architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture), [ToolAnnotations](https://modelcontextprotocol.io/specification/2026-07-28/schema#toolannotations)
- [Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Cursor: MCP](https://cursor.com/docs/context/mcp)
- This repo: `CONTEXT.md`, `AGENTS.md`
