# PROTOTYPE — Discovery page skins

Throwaway HITL prototype for post-v1 **Discovery page** visual polish.

**Question:** Which visual language for the Discovery page — musavvir.info editorial, idea-2 TUI, or hsm-mcp docs?

**Run:** open `index.html` in a browser, or:

```bash
python3 -m http.server 8766 -d prototypes/discovery-page
```

Then visit `http://127.0.0.1:8766/?variant=A` (also `B`, `C`). Arrow keys / bottom bar cycle variants.

| Key | Skin |
|-----|------|
| **A** | musavvir.info editorial — Aktiv Grotesk (Typekit), Libre Baskerville meta, red curved highlights, site header + hero h1 (from `idea-14-ss-to-gh/public/`) |
| **B** | idea-2 TUI — black/cyan/mono, boxed sections |
| **C** | hsm-mcp sibling docs — system-ui, ~46rem column, light/dark |

**Winner:** variant **B** (idea-2 TUI) — shipped in `src/discovery-page.ts`. A/C kept in prototype for contrast.

Copy matches locked packaging (`src/packaging.ts`). Not wired to production `GET /`.
