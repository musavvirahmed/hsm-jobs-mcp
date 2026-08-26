# PROTOTYPE — Tool payloads with uncertainty

Throwaway HITL prototype for [Tool payloads with uncertainty badges](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/9).

**Question:** which JSON naming/nesting best communicates honesty unknowns?

**Run:** open `index.html` in a browser, or:

```bash
python3 -m http.server 8765 -d prototypes/tool-payloads-uncertainty
```

Then visit `http://127.0.0.1:8765/?variant=A` (also `B`, `C`). Arrow keys / bottom bar cycle variants.

**Recommended:** variant **A** (nested `honesty`) — ADR 0006.
