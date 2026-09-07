# PROTOTYPE — fyi card terminal MCP mocks

Throwaway HITL prototype for [Prototype: Unix + Windows terminal MCP mocks for fyi card visual](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/69).

**v4:** Mixed surfaces (not Claude-Code-only).

| Key | Surface | Content |
|-----|---------|---------|
| **A1** | macOS Terminal.app | `claude mcp add` (real connect) |
| **A2** | Cursor IDE terminal | `curl …/health` + MCP settings note |
| **A3** | Claude Code session | `search_jobs` Amsterdam → IMC |
| **A4** | Claude Code session | `get_index_status` |
| **B** | Windows CMD | connect + health |
| **C** | Card crop of A3 | slot framing |

Hosts anonymized (`dev@macbook`).

```bash
python3 -m http.server 8767 -d prototypes/fyi-terminal-mcp-mocks
```

Open `http://127.0.0.1:8767/?variant=A1`.

**Winner:** _(pending HITL reaction)_
