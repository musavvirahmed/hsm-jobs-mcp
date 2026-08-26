# Agent instructions

Canonical for every IDE and model. Claude Code: also see `CLAUDE.md` (it only points here).

This repo specifies **hsm-jobs-mcp**. Until the Wayfinder map is clear and `/to-spec` has run, **plan, don’t do**: no MCP implementation, no public portal, no 13k crawl.

## Hard rules

1. **Plan, don’t do.** Wayfinder tickets are questions. Do not write production code inside the map. Do not treat a `wayfinder:task` that looks like a slice of the build as a licence to implement.
2. **One ticket per session**, except research tickets which may run in parallel at charting time.
3. **Claim first.** Assign the GitHub issue to yourself before any work. Concurrent sessions skip assigned tickets.
4. **Refer to tickets by name**, never by a bare `#42`.
5. **Use `CONTEXT.md` vocabulary.** Don’t invent synonyms for glossary terms.
6. **Do not scrape LinkedIn.** Do not rebuild [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp). Do not clone the IND register as the product.

## How to continue

1. Read this file, `CONTEXT.md`, and `docs/agents/issue-tracker.md`.
2. Open the issue labelled `wayfinder:map`.
3. Take one unblocked, unassigned child. Assign it. Resolve it (resolution comment, close, one line on the map’s Decisions so far). Stop.
4. When no tickets remain: `/to-spec` on the map, then `/to-tickets`, then `/implement`.

## Agent skills

### Issue tracker

GitHub Issues on this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default Matt Pocock roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. Glossary in `CONTEXT.md`. ADRs in `docs/adr/` when `/domain-modeling` creates them. See `docs/agents/domain.md`.

## Skills

Installed from [mattpocock/skills](https://github.com/mattpocock/skills) into this repo (editable copies). Invoke `/wayfinder` to chart or walk the map. Run `/setup-matt-pocock-skills` only if tracker wiring is missing.
