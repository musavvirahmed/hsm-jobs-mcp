# Agent instructions

Canonical for every IDE and model. Claude Code: also see `CLAUDE.md` (it only points here).

This repo is **hsm-jobs-mcp** (v1 shipped). Connect, deploy, operator crawl, and live checks: see [README.md](README.md) and [`scripts/`](scripts/).

## Hard rules

1. **One ticket per session**, except research tickets which may run in parallel at charting time.
2. **Claim first.** Assign the GitHub issue to yourself before any work. Concurrent sessions skip assigned tickets.
3. **Refer to tickets by name**, never by a bare `#42`.
4. **Use `CONTEXT.md` vocabulary.** Don’t invent synonyms for glossary terms.
5. **Do not scrape LinkedIn.** Do not rebuild [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp). Do not clone the IND register as the product.
6. **README edits follow [docs/agents/readme-style.md](docs/agents/readme-style.md).** Use succinct STE-flavored principles for human readers. Keep Architecture on the Product README; put operator/env/CI detail in [docs/README-developers.md](docs/README-developers.md).

## How to continue

1. Read this file, `CONTEXT.md`, and [README.md](README.md).
2. New slices: `/to-spec` → `/to-tickets` → `/implement` (see `docs/agents/issue-tracker.md`).

## Agent skills

### Issue tracker

GitHub Issues on this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default Matt Pocock roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. Glossary in `CONTEXT.md`. ADRs in `docs/adr/` when `/domain-modeling` creates them. See `docs/agents/domain.md`.

## Skills

Editable copies from [mattpocock/skills](https://github.com/mattpocock/skills) (engineering + productivity buckets). Canonical files: `.agents/skills/<name>/SKILL.md`. Symlinked for Cursor (`.cursor/skills/`), Claude Code (`.claude/skills/`), and Codex (`.codex/skills/`).

Invoke `/wayfinder` to chart or walk the map. Tracker wiring already lives in `docs/agents/`. Do not re-run `/setup-matt-pocock-skills` unless switching trackers.

Research findings: `research/<ticket-slug>.md` on a `research/<ticket-slug>` branch.
