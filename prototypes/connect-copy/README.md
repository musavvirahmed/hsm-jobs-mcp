# PROTOTYPE — Discovery Connect copy

Throwaway HITL prototype for **Simplify Connect copy: hsm-jobs first plus Copilot CLI**.

**Question:** First-try Connect is `hsm-jobs` only, plus Copilot CLI. Keep a muted hsm-mcp footnote for register-only asks (A), or mention no sibling MCP on `/` (B)?

**Run:**

```bash
python3 -m http.server 8768 -d prototypes/connect-copy
```

Then visit `http://127.0.0.1:8768/?variant=A` (also `B`). Arrow keys / bottom bar cycle variants.

| Key | Copy |
|-----|------|
| **A** | Jobs-only snippets + Copilot CLI + muted register-only / hsm-mcp footnote; no Desktop/auth lines; no “What the answers mean” box |
| **B** | Jobs-only snippets + Copilot CLI + zero hsm-mcp / ind-sponsors / register-only copy |

Skin is production TUI (shipped discovery-page winner). Copy is the variable.

Ticket: [Simplify Connect copy: hsm-jobs first plus Copilot CLI](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/72)

**Winner:** variant **A** (muted hsm-mcp footnote) — folded into `GET /` + README. Connect order: Claude Code → GitHub Copilot CLI → Any MCP client. Dropped claude.ai/Desktop one-liner, auth/rate-limit line, and “What the answers mean” box from `/`.
