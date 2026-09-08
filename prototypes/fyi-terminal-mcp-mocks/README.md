# PROTOTYPE — fyi card terminal MCP mocks

Throwaway HITL prototype for [Prototype: Unix + Windows terminal MCP mocks for fyi card visual](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/69).

**Direction (revised):** CLI **session** with `hsm-jobs` MCP results — not connect-only.

| Key | Surface | Content |
|-----|---------|---------|
| **A11** | GitHub Copilot CLI session · **1:1 (~972×971)** | `get_index_status` + `search_jobs` + table **with URLs** |
| **A1** | macOS Terminal.app | `claude mcp add` (contrast / old direction) |
| **A2** | Cursor IDE terminal | `curl …/health` |
| **A3** | Claude Code session | `search_jobs` Amsterdam → IMC |
| **A4** | Claude Code session | `get_index_status` |
| **B** | Windows CMD | connect + health |
| **C** | Card crop of A3 | slot framing |

```bash
python3 -m http.server 8767 -d prototypes/fyi-terminal-mcp-mocks
```

Open `http://127.0.0.1:8767/?variant=A11`.

**Organic reference:** operator Copilot CLI screenshot (same square card size). A11 is the HTML twin with clickable URL column.
