# Domain language

Use these terms. Don’t drift to synonyms the glossary avoids.

## Product

- **hsm-jobs-mcp** — working name. An MCP that answers which recognised-sponsor (Work) companies have **Openings** matching a title/location. Not a public job portal. Not a register-only MCP. Rename is out of scope for the current Wayfinder map. Jobs tools only: do not re-expose register search. **Server-side upstream** to **hsm-mcp** for hybrid **register join** refresh at query time; clients should also attach **hsm-mcp** for register-only questions. If upstream is down or rate-limited, **degrade**: return Openings with last-known join plus visible stale/error — do not invent a stronger join. Product transport: **Streamable HTTP** (`serverInfo.name`: `hsm-jobs-mcp`); stdio optional for local/private-release prototypes only. Auth, rate limits, and paid tier are deferred. Tool results use `outputSchema` + `structuredContent` plus a text JSON mirror. _Avoid_: dashes in tool names (`search-jobs`); shipping deprecated HTTP+SSE; treating stdio as the shared/hosted product transport.
- **v1 jobs tools** — exactly three, snake_case: **`search_jobs`**, **`get_job`**, **`get_index_status`**. Non-tools: `search_sponsors`, `get_register_status`, designer-headcount, hiring-velocity, sort-by-team-size, apply, LinkedIn, index dump. **`search_jobs`**: require one of `query` (title/free text, any title in the index) or `kvk` (8-digit); optional `location`; `limit` default 10 max 20; returns short Opening cards (no full JD body) each with **register join**, **honesty fields**, **source class**, and **index scope**. **`get_job`**: required primary URL of an Opening (careers URL preferred per **Opening** rules); returns the same card fields plus JD extract (not raw HTML); miss → structured `found: false` (not an MCP protocol error). **`get_index_status`**: no args; jobs-index health and **index scope** summary (`jobs_count` / openings count, sponsors with openings, last successful crawl, stale, pass/`coverage` note aligned with **Index coverage**, `source_policy` first-party careers/ATS only, short `register_join` note). Does **not** duplicate IND `ind_last_updated` / register `row_count` — those stay on **hsm-mcp**. _Avoid_: `get_listing`; opaque `job_id` as the only lookup key in v1; inventing a sure KvK on a card.
- **hsm-mcp** — existing register-lookup MCP ([CodeAlanDebug/hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp)). Wrap or cite. Do not clone.
- **Golden test** — [Rentman Product Designer](https://rentman.io/jobs/product-designer): `Rentman B.V.` / KvK `60733144`. Passes if the pipeline returns a URL that resolves to that posting (company careers URL preferred when known; ATS board URL acceptable).
- **Opening** — one live vacancy we index. **Existence and freshness are ATS-authoritative** when a **public board feed** is known: the posting is open iff it appears on that board/feed. When no public board feed is known, existence follows the careers HTML (or last-resort browser harvest) that produced it. Stable identity: `(ATS family, board token, posting id)` when known; HTML-only Openings use a canonical careers URL (or content hash) until an ATS id appears, then re-key/merge. May carry both a **careers URL** and an **ATS URL**; primary link = careers URL when it still resolves to that posting (or equivalent JD page), else ATS URL. Absent from a **successful** authoritative fetch ⇒ not open (no soft TTL). Failed fetches do not clear Openings. _Avoid_: listing (ambiguous); identity = whatever URL we currently prefer; serving a known-broken careers URL as primary.
- **Register join** — attaching IND Work identity to an **Opening**: registered name, KvK, and jobs-side match strength (`exact_kvk` | `strong_name` | `weak` | `unmatched`); never a yes/no “is recognised” verdict on the opening. Weak joins stay visible as weak. Full register ranking vocabulary stays on **hsm-mcp**. Built at index time; at query time **hybrid** re-validate KvKs still on the register via upstream **hsm-mcp** (not a full re-fuzzy of brand names every search). _Avoid_: boolean sponsor badge on a vacancy; forcing the client model to call `search_sponsors` per hit; copying hsm-mcp’s full `match_type` set onto Openings.

## Extraction (glossary, not a stack)

- **Public board feed** — an unauthenticated ATS JSON/XML/Atom (or equivalent) URL for one employer’s published vacancies. Operator-held API keys are out of scope for v1; auth-gated ATS surfaces are in scope only when a stable public feed URL can be discovered without a key.
- **Board seed** — operator-curated employer → board token / **public board feed** entry (e.g. Ashby `rentman` for the golden test). Complements automated fingerprinting; does not claim complete coverage.
- **Cautious board guess** — after fingerprinting finds no feed: at most **one** candidate board token per **v1 board family**, derived only from the accepted **official website** host slug (e.g. `rentman` from `rentman.io`); no permutations, no IND legal-name tokens. Failed `(family, token)` pairs are negatively cached until the official website or **board seed** changes (or an operator invalidates). _Avoid_: speculative vendor-directory probing; timed retry storms on known misses.
- **v1 board families** — named public-feed shapes on the extraction ladder: Greenhouse, Ashby, Lever, Recruitee, Teamtailor (`jobs.json`), Personio (XML), SmartRecruiters; plus any other feed URL evidenced or accepted via **cautious board guess** (e.g. Homerun Atom) without operator API keys. Workable (and similar) stay HTML/last-resort until a populated public feed is verified. _Avoid_: open-ended “any JSON we find” with no named families; Ashby-only as the permanent allowlist.
- **Extraction ladder** — ordered attempts to obtain Openings for a sponsor site: known **public board feed** first (from **board seed**, first-party fingerprint, or **cautious board guess**); then HTTP/HTML on the **careers site** (fingerprint board tokens **and**, if still no feed, derive Openings from static job cards/links); then browser automation only as last resort after those fail or return empty/thin results. _Avoid_: Playwright/browser as the default path for Ashby/Greenhouse-class boards; HTML-only Openings when a public board feed is already known; discover-only with no seeds for v1.

## Immigration and register

- **Recognised sponsor** — organisation on the IND Public register Work. Licensed to sponsor, not a promise they will sponsor *this* vacancy or an HSM transfer.
- **Kennismigrant / HSM** — highly skilled migrant. Employer-tied. Switching jobs needs an **HSM transfer** to a recognised sponsor at or above the **salary criterion**.
- **Salary criterion** — IND gross monthly minimum excl. holiday allowance. Changes on 1 January, not with the monthly register. 2026: €5,942 (30+), €4,357 (under 30), €3,122 (reduced / graduate).
- **Register refresh** — IND updates the public register monthly (“last updated” on the Work page). Not the same event as the salary criterion change.
- **KvK** — 8-digit Dutch Chamber of Commerce number. The register is name + KvK only. No official website field, no official API.

## Website resolution (register → site)

Distinct from layer-2 job discovery and from **register join** on an Opening. Production join keys off a **current** register (wrap **hsm-mcp** or IND HTML with the same freshness gates). The GitHub mirror is fixtures/tests only — not the production register. Website join is KvK → at most one accepted **official website**, else **unresolved (website)** (no ranked shortlist). Many KvKs may share one host; Opening-level disambiguation is **register join**, not a 1:1 host lock. Cascade: Wikidata KvK→website first, else domain-guess + validate, else search + validate (search needs an operator-configured provider; without it, stop at unresolved after guess); first accept wins. Follow redirects and persist the **final** host; require valid TLS for https. Validate: register-name tokens on page (or obvious about/legal page) and host not social / job-aggregator / LinkedIn / park page; on-page KvK is a strong bonus, never sufficient alone from Wikidata without checks. KvK Open Dataset is not used for websites (no website field / cannot join). Paid KvK Basisprofiel is out of v1 (optional later residual only). Stage-2 golden check: KvK `60733144` → host `rentman.io` (pipeline golden test still needs the Product Designer Opening URL).

- **Official website** — accepted public **host** used as the crawl seed for that KvK (apex, `www`, or a first-party careers/jobs **subdomain** when that is the validated jobs-likely brand surface). Prefer brand/operating over pure holding-company hosts when the register legal name still appears (e.g. footer / Impressum). A path like `/jobs` is not itself the official website. Not a vendor **ATS board URL** host.
- **Careers site** — first-party jobs listing surface (path or dedicated area) on an organisation host. May coincide with an official website that is already a careers subdomain.
- **ATS board URL** — vendor-hosted job board endpoint (Greenhouse, Ashby, etc.). Not proof that official website resolution succeeded.
- **Unresolved (website)** — no accepted official website for that KvK; do not invent one.
- **Website override** — operator-curated correction only (the operator of hsm-jobs-mcp, not an end-user MCP client). May **pin** an official website host for a KvK or **force unresolved**. Does not rewrite the shared index from a client session. Persistence format still open for implementation.

_Avoid_: “sponsor web presence” as a single blob; treating an ATS board or aggregator hit as the official website; accepting Wikidata P856 with no on-page checks; requiring a 1:1 host↔KvK mapping; using the lagging GitHub sponsor CSV as production register identity; Open Dataset or paid Basisprofiel as v1 website resolution.

## Three data layers (only the middle one is ours)

| Layer | Example question | Who already does it | This product |
|---|---|---|---|
| 1. Register | “Is Adyen a recognised sponsor?” | hsm-mcp, GitHub CSV, indsponsors directory | Wrap / cite. Do not clone. |
| 2. Openings on careers/ATS | “Which sponsors are hiring UX designers right now?” | Nobody well. Aggregator job boards are thin and noisy. | **This is hsm-jobs-mcp.** |
| 3. Workforce graph | “How many sponsors have PDs on the team?” | LinkedIn Company Insights. No official third-party API. | Out of scope. An opening is not a team. |

## Settled competitor facts (2026-08-26)

Do not re-open these as research questions.

- [indsponsors.nl](https://indsponsors.nl/) is a sponsor directory plus a thin aggregator jobs list. It missed the Rentman Product Designer listing.
- [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp) already does register lookup and freshness.
- The WellLanded web app was down (`DEPLOYMENT_NOT_FOUND`).
- May→July 2026 register churn was +164 / −74 KvKs.
- GitHub mirror snapshot lagged live IND (July snapshot vs IND last updated 3 August 2026).
- DutchSponsors and VisaList.nl exist; they are not the jobs-on-careers wedge.

## Index coverage (ship rule)

Spec clause (not a calendar launch in this Wayfinder map): implementers may **private-release** on a **partial index**; **shared release** waits for a **full careers pass**. Kill both false emptiness and false completeness.

- **Partial index** — layer-2 coverage that is a known incomplete subset of recognised sponsors’ careers outcomes. Allowed only for a **private release**. ATS-heavy or board-seed-only corpora are fine as private shapes; they are not a named ship stage. _Avoid_: implying the index covers the whole Work register; “ATS-detectable ship” as the product gate.
- **Private release** — single-user local runtime (e.g. stdio / local MCP in one agent). May run on a **partial index** once the **golden test** passes and every jobs-tool response carries **index scope**. _Avoid_: hosted URL; second user.
- **Shared release** — any hosted endpoint or multi-user access. Requires a completed **full careers pass**. Not the same as a public job portal (still out of scope for v1 product shape).
- **Full careers pass** — every KvK on the current Work register has a queryable **terminal careers outcome**. Shared unlocks only after this pass. After a **register refresh**, any KvK lacking a terminal outcome immediately forces status back to `partial` (shared is out of policy until the pass catches up). _Avoid_: “100% of sponsors have open jobs”; ATS-only plateau as “full”; staying `full_careers_pass` while new register rows are unattempted; a grace window that papers over churn.
- **Terminal careers outcome** — closed result of attempting layer-2 discovery for one KvK: `openings_indexed` | `unresolved_website` | `no_careers_site` | `no_matching_public_board` | `blocked` | `unsupported_extractor`. “Tried and found nothing” (`no_matching_public_board`) is not “not attempted.” _Avoid_: collapsing blocked and unsupported; treating dead-ends as openings.
- **Index scope** — structured disclosure on every jobs-tool response: pass flag (`partial` | `full_careers_pass`); counts (`sponsors_attempted`, `sponsors_with_openings`, `register_size`, `register_as_of`); and a query lens so empty/miss answers cannot read as complete. When status is `partial`, empty search results must set **omissions_possible** (or equivalent) true. When status is `full_careers_pass`, **omissions_possible** is always false (title/location miss is relevance, not a coverage gap). Still required after **shared release**. _Avoid_: coverage badge, uncertainty badge (see Honesty); silent `openings: []` on a partial index; a fake “index incomplete” **Opening**; scope only on a separate coverage tool; using **omissions_possible** for rank/relevance.

## Honesty

Most job descriptions omit pay and language. Licensed ≠ this vacancy will sponsor you. Tool responses must return **unknown**, not invent certainty.

- **Honesty fields** — independent structured signals about JD silence on an **Opening**: **salary signal**, **Dutch-required**, **sponsorship willingness**. In tool JSON they nest under an `honesty` object. Never collapsed into one “HSM fit” score. Return-only in v1 (not search filters). No evidence quotes in the payload (enums / raw salary text only). No role-plausibility field; search ranking is text relevance to the query (a bad title loses without an extra “poor HSM” flag). **Register join** stays top-level on the Opening (identity / match strength), not inside `honesty`. _Avoid_: uncertainty badge, badge (as a domain noun), confidence pretending to be a fact; server-side filter args on honesty enums; burying KvK inside `honesty`.
- **Salary signal** — raw pay text from the JD/ATS only when it contains a number, range, or explicit band; otherwise **unknown** (including “competitive” / “market rate”). No normalization to monthly EUR in v1 (may revisit if raw-only proves unusable). **hsm-jobs-mcp** does not compare pay to the **salary criterion**; the client or agent does. Thin ATS rows with no JD body → **unknown**. _Avoid_: meets/below inside the jobs tool; inventing pay; storing non-quantitative fluff as salary.
- **Dutch-required** — `true` | `false` | `"unknown"` on an **Opening** (JSON mixed type: booleans or the sentinel string). Only whether Dutch is required; other languages are not first-class. Silent JD or missing body → `"unknown"`. Scope: this vacancy’s JD/ATS fields only. _Avoid_: inferring from HQ country, “international team,” or aggregator “English-friendly” chrome.
- **Sponsorship willingness** — whether *this* **Opening** states it will / will not help with sponsorship or an **HSM transfer**: `"stated_yes"` | `"stated_no"` | `"unknown"`. Distinct from **recognised sponsor** (employer licence). No `inferred_*`. Scope: this vacancy’s JD/ATS fields only (not careers FAQ / policy pages). Soft culture copy → `"unknown"`. Missing body → `"unknown"`. Prefer explicit `"unknown"` over omitting the key. _Avoid_: treating licence as willingness; inventing yes from boilerplate.
- **Unknown (sentinel)** — JSON string `"unknown"` for every honesty slot that is not a known value (including **salary signal** when non-quantitative). Do not use JSON `null` or key omission to mean unknown.
- **Source class** — **Opening** provenance attribute (**not** an **Honesty field**): `"careers_site"` | `"ats_board"` | `"aggregator"` | `"unknown"`. Careers HTML vs vendor ATS vs thin aggregator are not interchangeable. _Avoid_: “job board” as the class name (ambiguous); folding provenance into **Honesty fields**; collapsing careers and ATS into one “first_party” bucket when the payload can tell them apart.

## Avoid

- “Visa sponsor list” as the product name (that is layer 1).
- Scraping LinkedIn (jobs or people).
- Treating aggregator board hits as first-party openings.
- Title-filtering the crawl to product design. PD/UX is the golden test, not the corpus limit.
