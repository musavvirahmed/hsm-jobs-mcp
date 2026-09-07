# PROTOTYPE — fyi card terminal MCP mocks

Throwaway HITL prototype for [Prototype: Unix + Windows terminal MCP mocks for fyi card visual](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/69).

**Question:** For the musavvir.fyi AI Prototypes image slot, which terminal / Claude Code aesthetic wins — and with which MCP example?

**v3:** Mid-session **Claude Code** UI (● narrate / green tool / ⎿ result), not bare zsh and not idle splash-only. Tool results are live-sampled from the jobs index.

**Run:**

```bash
python3 -m http.server 8767 -d prototypes/fyi-terminal-mcp-mocks
```

Open `http://127.0.0.1:8767/?variant=A1`.

| Key | Content |
|-----|---------|
| **A1** | `search_jobs` · software engineer · Amsterdam → IMC |
| **A2** | `get_index_status` → jobs_count / crawl / full_careers_pass |
| **A3** | `search_jobs` · KvK `34259528` (Adyen) |
| **A4** | `get_job` · IMC C++ URL + honesty fields |
| **B** | Windows frame · same search as A1 |
| **C** | Card crop of A1 |

**Winner:** _(pending HITL reaction)_
