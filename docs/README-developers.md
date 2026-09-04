# Developer and operator reference

Human-first setup lives in the [root README](../README.md). This page holds architecture, env contract, and CI detail for operators and agents.

## Local / private release (operator)

Dogfood on your machine against a **partial index** — same D1 schema as shared release, but you run crawl and dev locally. Every jobs-tool response must carry **index scope**; `private-release:verify` checks this. Attach **both** MCP servers: jobs here, register on **hsm-mcp**.

**Do not point your MCP client at `https://hsmjobs.musavvir.work/mcp` for private dogfood.** Shared `/mcp` returns **503** until a **full careers pass** completes. Use localhost Streamable HTTP from `wrangler dev` instead.

### Env contract

Copy [`.env.example`](../.env.example) to `.env`. Cloudflare bootstrap keys are for deploy; private-release keys default for local use.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `JOBS_INDEX_TARGET` | `local-d1` | Where crawl writes the jobs index: `local-d1` (private release), `remote-d1` (shared D1 the Worker reads), or `sqlite:<path>` |
| `CLOUDFLARE_ACCOUNT_ID` | — | Required when `JOBS_INDEX_TARGET=remote-d1` (from Cloudflare dashboard) |
| `D1_DATABASE_ID` | — | Required when `JOBS_INDEX_TARGET=remote-d1` (same UUID as `wrangler.jsonc` / bootstrap) |
| `CLOUDFLARE_API_TOKEN` | — | Required when `JOBS_INDEX_TARGET=remote-d1` (D1 edit token) |
| `JOBS_INDEX_LOCAL_D1_STATE` | `.wrangler/state` | Wrangler `--persist-to` root (project-relative path to local D1 persistence) |
| `PRIVATE_RELEASE_ORIGIN` | `http://127.0.0.1:8787` | Base URL for verify and for wiring your MCP client |
| `PRIVATE_RELEASE_PORT` | `8787` | Local dev port (`private-release:integration` may pick a free port when unset) |
| `CRAWL_MAX_ATTEMPTS` | (all missing) | Optional cap on missing KvKs per `crawl:full-pass` |
| `REMOTE_D1_SKIP_MIGRATIONS` | unset | When `1`/`true`, skip `wrangler d1 migrations apply --remote` on each remote-d1 crawl open (schema already applied) |
| `HSM_MCP_ORIGIN` | `https://hsm.codealan.com` | Live Work-register source for production crawl |

Operator loop reuses `.wrangler/state` unless you override `JOBS_INDEX_LOCAL_D1_STATE`. CI uses an **ephemeral** state dir (temp under the OS tmp) and tears it down after verify.

### Operator loop (crawl → dev → verify)

```bash
npm ci
npm run crawl                  # live fetch → local D1 (partial index)
npm run dev                    # wrangler dev — separate terminal
npm run private-release:verify # Streamable HTTP checks on localhost /mcp
```

Smoke/fixture crawl (no live network): `npm run crawl:smoke`. Full careers pass (shared-release gate): `npm run crawl:full-pass`.

Production full pass writes to the shared jobs index:

```bash
JOBS_INDEX_TARGET=remote-d1 npm run crawl:full-pass
```

Requires `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` in `.env`. By default each `crawl:full-pass` runs `wrangler d1 migrations apply --remote` (with retries on Cloudflare API timeouts) before writing. That call is redundant once the shared D1 schema is current and can abort a long burst if Cloudflare times out — for multi-batch local runs set `REMOTE_D1_SKIP_MIGRATIONS=1` after one successful apply (or after bootstrap). The runner skips KvKs that already have **terminal careers outcomes**, and prints `jobs_index_target: "remote-d1"` in JSON output. Stop with Ctrl+C; re-run the same command to resume.

One-shot automated loop (crawl → ephemeral D1 → dev → verify → teardown): `npm run private-release:integration`.

### CI verification

Every PR runs the live private-release loop in [`.github/workflows/private-release-integration.yml`](../.github/workflows/private-release-integration.yml) (`npm run private-release:integration`). Use `npm run private-release:verify` locally after `dev` is up — same checks CI runs against `/mcp`.

## Shared release (operator)

After the production **full careers pass** completes on remote D1, verify the public origin before pointing MCP clients at it:

```bash
npm run shared-release:verify
```

Default target: `https://hsmjobs.musavvir.work` (override with `SHARED_RELEASE_ORIGIN`). Checks:

- `GET /health` returns 200 JSON (not degraded)
- `POST /mcp` initialize succeeds (not 503)
- `get_index_status` reports `pass: full_careers_pass`, `omissions_possible: false`, and a plausible `register_size`

Unit tests cover verify logic against a local HTTP handler — no live-network dependency on every PR.

When verify succeeds against production:

1. Soften or update the root [README](../README.md) “Connect to the public site” copy so kennismigrants are not told shared `/mcp` still errors.
2. Enable daily maintenance: `gh variable set ENABLE_PRODUCTION_CRAWL_SCHEDULE --body true` (Human operator step 6). Do **not** run a local `JOBS_INDEX_TARGET=remote-d1` crawl while that schedule (or a production Actions run) is active.
3. Keep Workers Paid on if daily catch-up + opening refresh would hit free-tier `rows_read` walls.

`upsertOpening` clears any other row with the same `primary_url` before insert/update. That avoids aborting a long crawl when two identities (e.g. two ATS postings) resolve to one careers URL.

### Automated crawl (production schedule)

Two clocks keep the **jobs index** honest after **shared release** (see [ADR 0009](adr/0009-v1-stack-and-hosting.md) and [ADR 0004](adr/0004-partial-index-ship-rule.md)):

| Clock | What | Cadence |
| ----- | ---- | ------- |
| Opening refresh | Re-fetch known board paths; close vanished postings | ~daily (`0 5 * * *` UTC) |
| Register catch-up | Attempt missing **terminal careers outcomes** (IND register delta) | Same run, cap `CRAWL_MAX_ATTEMPTS` (default 200) |

A new Work-register KvK without a terminal outcome sets pass back to `partial`. Catch-up chips away until missing is 0. At 200 KvKs per day, a full ~13k register is about two months; a typical monthly IND delta is much smaller.

Two GitHub workflows:

| Workflow | File | Writes remote D1? |
| -------- | ---- | ----------------- |
| Out-of-band crawl (fixture smoke) | [`.github/workflows/crawl.yml`](../.github/workflows/crawl.yml) | **No** — fixture + unit tests only (~daily schedule) |
| Production crawl | [`.github/workflows/crawl-production.yml`](../.github/workflows/crawl-production.yml) | **Yes** — when dispatched or when `ENABLE_PRODUCTION_CRAWL_SCHEDULE=true` |

Production has **no `pull_request` trigger**. Cron is a no-op until that repo variable is `true`. Forks never receive production secrets.

While the index is still `partial`, production `opening-refresh` can also attempt missing-KvK website/ladder work (not board seeds only). That job has a **90-minute** timeout. Cancelled refresh with an empty `refresh-report.json` is common; `register-catch-up` may still run and chip the cap. Judge the pilot from **`catchup-report.json`**, not from a green opening-refresh alone.

Crawl steps redirect JSON to artifacts (`npm run --silent … > report.json`), so the Actions log looks quiet until the step ends. Download reports from the run **Summary → Artifacts**, or:

```bash
gh run download RUN_ID -n catchup-report -D .
```

**D1 budget (first full pass):** Cloudflare free-tier daily `rows_read` can stop a multi-thousand-KvK remote crawl mid-day (error code 7500 / “wait until midnight UTC”). For a fast first pass (~hours to a few days), use **Workers Paid** or wait for the UTC midnight reset. After shared release, small daily catch-up usually fits free tier; paid removes the hard daily wall. Do not drop Paid on chat advice alone — measure usage (Human operator step 10).

Do **not** run a local `JOBS_INDEX_TARGET=remote-d1` crawl while the schedule is on or a production run is in progress.

#### Human operator (after this workflow is on `main`)

`gh` must be authed to `musavvirahmed/hsm-jobs-mcp`. Account ID and D1 UUID are in `.env` / `wrangler.jsonc` (`hsm-jobs-index`) if you already ran bootstrap.

**0. Gate check**

```bash
gh variable list | grep ENABLE_PRODUCTION_CRAWL_SCHEDULE || echo "schedule variable unset (good)"
```

Must be unset or not `true`. Confirm `crawl-production.yml` exists on `main`.

**1. Stop the local writer**

```bash
pgrep -fl 'full-pass-loop|run-crawl' || echo "no local crawl process"
tmux has-session -t crawl 2>/dev/null && echo "tmux crawl session exists" || echo "no tmux crawl session"
```

If a loop is running: `tmux attach -t crawl` then Ctrl+C (or `tmux kill-session -t crawl`). Re-check `pgrep`. Do not restart the local loop until a no-go (step 5) or pause (step 8).

**2. Cloudflare token (if needed)**

Prefer a dedicated Actions token: [API tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Custom Token → **Account → D1 → Edit** (add **Account Settings → Read** only if the dashboard requires it) → this account only. Copy once. Do not paste into chat.

IDs: `grep CLOUDFLARE_ACCOUNT_ID .env`. D1 UUID from `wrangler.jsonc` `database_id` or `grep D1_DATABASE_ID .env`.

**3. Repo secrets**

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$(grep '^CLOUDFLARE_ACCOUNT_ID=' .env | cut -d= -f2-)"
gh secret set D1_DATABASE_ID --body "$(grep '^D1_DATABASE_ID=' .env | cut -d= -f2-)"
gh secret set CLOUDFLARE_API_TOKEN   # paste when prompted; or: printf '%s' 'TOKEN' | gh secret set CLOUDFLARE_API_TOKEN
gh secret list | egrep 'CLOUDFLARE_ACCOUNT_ID|D1_DATABASE_ID|CLOUDFLARE_API_TOKEN'
```

**4. Pilot dispatch**

```bash
pgrep -fl 'full-pass-loop|run-crawl' || echo "no local crawl process"
gh workflow run crawl-production.yml -f catch_up_max_attempts=200
gh run watch
gh run list --workflow=crawl-production.yml --limit 1
gh run download RUN_ID   # replace RUN_ID
```

Note wall-clock for both jobs.

**5. Go / no-go**

From `catchup-report.json` (and `refresh-report.json` when present):

| Check | Fail |
| ----- | ---- |
| Catch-up job succeeded (opening-refresh may cancel at 90m while still `partial`) | Fix secrets/logs; do not enable schedule |
| `jobs_index_target` is `remote-d1` | Re-check secrets |
| `attempted` ≈ cap (or remaining missing) | Inspect logs |
| `missing_terminal_outcomes_after` ≈ `missing_terminal_outcomes_before - attempted` | Egress or D1 quota → step 8; do not enable schedule |
| No stale hsm-mcp register error | Fix upstream; do not raise cap |
| `/health` passed on catch-up | Check Worker / DNS |

Record minutes, `missing_*`, `attempted`, `index_scope.pass`. **Go** → step 6 only when you want daily **maintenance**. **No-go** → leave schedule unset.

Skip step 6 and keep catch-up (Actions dispatch or local burst) while the initial full pass is still incomplete (`missing_terminal_outcomes_after` > 0).

**6. Enable daily schedule (Go only — after shared release or when daily delta is enough)**

```bash
gh variable set ENABLE_PRODUCTION_CRAWL_SCHEDULE --body true
```

Until then, only `workflow_dispatch` runs production. Do not enable the schedule to finish the first ~13k pass faster — default 200/day is maintenance cadence.

**7. Burst catch-up (optional)**

After a large IND register delta: `gh workflow run crawl-production.yml -f catch_up_max_attempts=500`. Do not change the scheduled default to 500 until a 200 (and preferably a 500) dispatch finished inside timeouts. Expect each Actions run to spend up to ~90m on `opening-refresh` before catch-up starts while the index is still `partial`.

**8. Pause / local burst (first full pass)**

To finish thousands of missing KvKs in a few days, pause the schedule and run capped batches on your machine (one writer):

```bash
gh variable set ENABLE_PRODUCTION_CRAWL_SCHEDULE --body false
# or: gh variable delete ENABLE_PRODUCTION_CRAWL_SCHEDULE
pgrep -fl 'full-pass-loop|run-crawl' || echo "no local crawl process"
# Once: ensure schema is current (retries on Cloudflare API timeout)
npx wrangler d1 migrations apply hsm-jobs-index --remote
# Then batch with migrate skipped so a mid-burst wrangler timeout cannot abort progress
JOBS_INDEX_TARGET=remote-d1 REMOTE_D1_SKIP_MIGRATIONS=1 CRAWL_MAX_ATTEMPTS=500 npm run crawl:full-pass
```

Re-run the same `crawl:full-pass` command to resume (skips KvKs that already have terminal outcomes). Keep `REMOTE_D1_SKIP_MIGRATIONS=1` for the whole burst. Use `200` if you are still on D1 free tier and near the daily `rows_read` cap. Raise to `500` only when a batch finishes cleanly under Workers Paid (or after UTC midnight on free tier).

Transient Cloudflare errors (`UND_ERR_CONNECT_TIMEOUT`, `UND_ERR_SOCKET`, wrangler “API timed out”) during a batch are safe to retry with the same command — already-written terminal outcomes stay on remote D1.

Disable the workflow in the Actions UI to block dispatch too.

**9. Stale register / one writer**

Stale **hsm-mcp**: do not tight-loop dispatch; fix upstream (`HSM_MCP_ORIGIN`, default `https://hsm.codealan.com`), then one `gh workflow run crawl-production.yml`.

Never run a local `JOBS_INDEX_TARGET=remote-d1` crawl while the schedule variable is `true` or a production run is in progress.

**10. Workers Paid review (after shared release + schedule on)**

[ADR 0009](adr/0009-v1-stack-and-hosting.md) prefers free tier. Keep **Workers Paid** through the first full careers pass and the first days of scheduled maintenance. Then decide from the Cloudflare usage dashboard — not from chat.

1. Wait for **at least 3 successful scheduled** `crawl-production` runs (or 3 calendar days with the schedule on — whichever is later).
2. Check D1 **rows read** and **rows written** for those days. Watch Actions logs for error 7500 / free-tier daily limit messages.
3. **Keep Paid** if any day is near Free caps (5M reads / 100k writes per day) or a fat catch-up day would fail mid-run. **Downgrade to Free** only if every observed day stays well under those caps (comfortable margin) and `/mcp` plus the crawl stay healthy.
4. After a downgrade, watch the next 1–2 scheduled runs. Re-enable Paid if a run fails on quota.
5. Record the decision on the open task [Review Workers Paid after scheduled production crawls](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/56) (or close that issue with measured numbers).

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
        worker["Worker<br/>GET / · /mcp · /health · .well-known"]
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
| `GET /.well-known/mcp.json` | MCP server card (SEP-2127-style machine discovery) |
| `GET /.well-known/mcp/server-card.json` | Same server card (SEP-1649 path alias) |
| `/mcp` | Streamable HTTP → `search_jobs` · `get_job` · `get_index_status` |
| `/health` | Coarse operator/CI health (`up` / `degraded` / `stale`) |
| Crawl | scheduled job or operator CLI → D1 (not inside tool calls) |
| Monitoring | `/health` probe + `get_index_status` + alert on repeated crawl failure |

Transport: **Streamable HTTP** (`serverInfo.name`: `hsm-jobs-mcp`). Optional stdio exists for local/private-release prototypes only.

Hosting: Cloudflare Workers + D1; crawl plane via scheduled GitHub Actions and/or operator CLI (see [ADR 0009](adr/0009-v1-stack-and-hosting.md)).
