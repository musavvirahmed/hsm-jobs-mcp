# PROTOTYPE — fyi card terminal MCP mocks

Throwaway HITL prototype for [Prototype: Unix + Windows terminal MCP mocks for fyi card visual](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/69).

**Question:** For the musavvir.fyi AI Prototypes image slot (Gogoro/PACS device-mock parity), do Unix and/or Windows terminal stubs showing MCP-ish commands look right — and which wins?

**Run:**

```bash
python3 -m http.server 8767 -d prototypes/fyi-terminal-mcp-mocks
```

Then open `http://127.0.0.1:8767/?variant=A` (also `B`, `C`). Arrow keys / bottom bar cycle variants.

| Key | Aesthetic |
|-----|-----------|
| **A** | Unix · macOS Terminal.app (zsh, traffic lights, `claude mcp add` + `search_jobs`) |
| **B** | Windows · classic Command Prompt (title bar, `C:\…>`, same MCP story) |
| **C** | Card crop · product-shot frame (tilted Unix chrome, denser hierarchy for a tight image slot) |

**Winner:** _(pending HITL reaction)_
