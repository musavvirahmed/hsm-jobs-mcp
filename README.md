# hsm-jobs-mcp

MCP server that answers which [IND recognised sponsors](https://ind.nl/en/public-register-recognised-sponsors/public-register-work) (Work) have **Openings** on their own careers and ATS pages — layer 2 only. It wraps register lookup via [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp); it does not clone register search.

Live discovery: **[https://hsmjobs.musavvir.work](https://hsmjobs.musavvir.work)** (`GET /`, `/mcp`, `/health`).

Agent workflow for this repo: see [`AGENTS.md`](AGENTS.md).

## What it is

- **Openings** indexed out of band from first-party careers/ATS surfaces (not LinkedIn, not a job-board aggregator).
- **Register join** on each card: registered name, KvK, and match strength — never a yes/no “this vacancy will sponsor you” verdict.
- **Honesty fields** on each Opening: salary signal, Dutch-required, sponsorship willingness — separate signals; `unknown` is valid.
- **Index scope** on every jobs-tool response so empty results on a partial index cannot read as “nothing exists anywhere.”

Register-only questions (“is Adyen a recognised sponsor?”, KvK lookup, register freshness) belong on **hsm-mcp**, not here.

## Tools (v1)

| Tool | What it does |
| ---- | ------------ |
| `search_jobs` | Openings at recognised sponsors by title/free text or 8-digit KvK; optional `location`; `limit` default 10, max 20. |
| `get_job` | One Opening by its primary careers or ATS URL; structured `found: false` when absent. |
| `get_index_status` | Jobs-index health, crawl freshness, index scope (`partial` vs `full_careers_pass`), and register-join upstream note. |

Transport: **Streamable HTTP** (`serverInfo.name`: `hsm-jobs-mcp`). Optional stdio exists for local/private-release prototypes only.

Hosting: Cloudflare Workers + D1; crawl plane via scheduled GitHub Actions and/or operator CLI (see [ADR 0009](docs/adr/0009-v1-stack-and-hosting.md)).

## Use / Connect

Attach **both** servers — jobs here, register on hsm-mcp:

**Claude Code**

```bash
claude mcp add --transport http hsm-jobs https://hsmjobs.musavvir.work/mcp
claude mcp add --transport http ind-sponsors https://hsm.codealan.com/mcp
```

**claude.ai / Claude Desktop** — Settings → Connectors → Add custom connector → `https://hsmjobs.musavvir.work/mcp` (and add hsm-mcp separately).

**Any MCP client** (Cursor, etc.)

```json
{
  "mcpServers": {
    "hsm-jobs": { "url": "https://hsmjobs.musavvir.work/mcp" },
    "ind-sponsors": { "url": "https://hsm.codealan.com/mcp" }
  }
}
```

No auth in v1. Rate limits follow the live deploy when present; additional limiting may be added later.

**Local / private release (stdio, optional)**

```bash
npx wrangler dev
# or wire a local Streamable HTTP URL from wrangler dev in your MCP client
```

Shared hosted `/mcp` on `hsmjobs.musavvir.work` waits for a **full careers pass**; private/local endpoints may run on a **partial index** when every response carries index scope.

## Example asks

- *"Which recognised sponsors are hiring product designers?"*
- *"Which recognised sponsors are hiring software engineers in Amsterdam?"*
- *"What Openings do you have for KvK 60733144?"*
- *"How fresh is the jobs index?"* (hits `get_index_status`)
- *"Is Adyen a recognised sponsor?"* → use **hsm-mcp** / `ind-sponsors`, not this server.

`get_job` is for when you already have an Opening URL from a prior `search_jobs` hit or an employer careers page — there is no separate “paste a URL” example ask on the discovery page.

## Reading the answers

- **Honesty fields stay separate.** `honesty_salary`, `honesty_dutch_required`, and `honesty_sponsorship_willingness` are independent; `unknown` is valid and common.
- **Register join is match strength**, not a verdict. `exact_kvk` / `strong_name` / `weak` / `unmatched` describe how the Opening ties to the register — recognised sponsor status on the company does not mean this vacancy will sponsor your **HSM transfer**.
- **No salary-criterion check here.** This server does not compare pay to the IND **salary criterion**; you or your agent do.
- **Empty ≠ exhaustive.** On a `partial` index, `omissions_possible` may be true — thin or empty `search_jobs` results are not proof that no Openings exist. On `full_careers_pass`, a miss is relevance, not a coverage gap.
- **Upstream degrade.** When **hsm-mcp** is down or rate-limited at query time, register joins may be stale; the tool surfaces that instead of inventing a stronger join.

Coarse deploy health: `GET /health` (`up` | `degraded` | `stale`). Rich scope and crawl detail: `get_index_status`.

Always confirm important decisions against primary sources — employer careers pages and the [official IND register](https://ind.nl/en/public-register-recognised-sponsors/public-register-work).

## Architecture

```mermaid
flowchart LR
    client["AI client<br/>(Claude, Cursor, any MCP client)"]
    hsmMcp["hsm-mcp<br/>(register lookup)"]
    careers["Employer careers / ATS<br/>(public feeds + HTML)"]

    subgraph crawl["Crawl plane (out of band)"]
        gh["GitHub Actions /<br/>operator CLI"]
    end

    subgraph cf["Cloudflare Workers + D1"]
        worker["Worker<br/>GET / · /mcp · /health"]
        d1[("D1 jobs index<br/>Openings + terminal outcomes")]
    end

    client -- "Streamable HTTP /mcp" --> worker
    worker -- "read index" --> d1
    worker -- "hybrid register join<br/>revalidate at query time" --> hsmMcp
    gh -- "Opening refresh +<br/>full careers pass" --> d1
    gh -- "fetch feeds/HTML" --> careers
```

| Path | What happens |
| ---- | ------------ |
| `GET /` | Human discovery page (connect, tools, example asks) |
| `/mcp` | Streamable HTTP → `search_jobs` · `get_job` · `get_index_status` |
| `/health` | Coarse operator/CI health (`up` / `degraded` / `stale`) |
| Crawl | scheduled job or operator CLI → D1 (not inside tool calls) |
| Monitoring | `/health` probe + `get_index_status` + alert on repeated crawl failure |

Unofficial project. Openings © respective employers; register data © IND via hsm-mcp. Verify against primary sources before acting.
