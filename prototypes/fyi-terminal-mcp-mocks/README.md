# PROTOTYPE — fyi card terminal MCP mocks

Throwaway HITL prototype for [Prototype: Unix + Windows terminal MCP mocks for fyi card visual](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/69).

**Question:** For the musavvir.fyi AI Prototypes image slot (Gogoro/PACS device-mock parity), do Unix and/or Windows terminal stubs showing MCP-ish commands look right — and which wins?

**Run:**

```bash
python3 -m http.server 8767 -d prototypes/fyi-terminal-mcp-mocks
```

Then open `http://127.0.0.1:8767/?variant=A1`. Arrow keys / bottom bar cycle variants.

| Key | Aesthetic / content |
|-----|---------------------|
| **A1** | Unix · Claude Code `claude mcp add` (real stdout shape) |
| **A2** | Unix · `curl …/health` → `{"status":"up"}` |
| **A3** | Unix · Cursor `mcpServers` JSON via heredoc |
| **A4** | Unix · stylized *client* `search_jobs` (live IMC/WEBB rows; **not** typed in zsh) |
| **B** | Windows · Command Prompt (connect + health) |
| **C** | Card crop of A1 |

**Anonymization:** prompt uses fictional `dev@macbook` — not the operator’s hostname/username.

**Winner:** _(pending HITL reaction)_
