# Deterministic index-time honesty extraction

v1 turns an **Opening**’s **honesty text surface** into **salary signal**, **Dutch-required**, and **sponsorship willingness** with **deterministic EN+NL cues only** (no LLM), computed **at index time**, failing open to `"unknown"` on soft copy, conflict, or miss. Hard requirement / vacancy-explicit sponsorship cues only; salary is the shortest labeled base/gross quantitative span. Cue phrase lists are illustrative on the resolving ticket — not an exhaustive ADR allowlist and not glossary nouns. Field shapes stay in CONTEXT.md Honesty and [ADR 0006](./0006-honesty-payload-shape.md).

**Considered options:** LLM-primary or LLM-fallback honesty; query-time-only honesty on `get_job`; EN-only cues; preferred-counts-as-required; exhaustive phrase allowlists in CONTEXT or ADR — rejected for inventing certainty, card uselessness, NL JD silence, or process rot on synonyms.
