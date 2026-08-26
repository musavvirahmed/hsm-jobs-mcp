# Nested JD honesty + `"unknown"` sentinel

Tool payloads nest **salary signal**, **Dutch-required**, and **sponsorship willingness** under an `honesty` object on each **Opening**; **register join** and **source class** stay top-level. Every non-known honesty slot uses the JSON string `"unknown"` (not `null` or key omission). The server never emits a composite HSM-fit score or a salary-criterion meets/below verdict — clients compare raw pay text to the **salary criterion** when they have a number.

**Considered options:** flat honesty keys on the Opening; JSON `null` / omitted keys for unknown; tagged `{ status, value }` unions; folding **register join** into `honesty`; server-side meets/below badges — rejected because they blur identity vs JD silence, drop easily in clients, or invent certainty the JD does not support.
