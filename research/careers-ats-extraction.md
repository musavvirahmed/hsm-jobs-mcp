# Careers and ATS extraction without LinkedIn

**Ticket:** [Careers and ATS extraction without LinkedIn](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/4)
**Date:** 2026-08-26 (facts re-checked same day after grill; Rentman apply path corrected to Ashby)
**Method:** Primary ATS docs, live GETs to documented board endpoints, Rentman marketing + Ashby + Recruitee hosts, `robots.txt` on a small sample of NL recognised-sponsor hosts, then HITL grill (`/grill-with-docs`). No full-register crawl. No product code.

## Question

For recognised-sponsor career sites in the Netherlands, which public ATS JSON boards can we hit (Greenhouse, Ashby, Lever, Recruitee, Teamtailor, Personio, Homerun, others), what is Rentman’s board path, and when is Playwright required? What do robots.txt and politeness imply?

## Settled before this ticket (do not re-open)

- Skip LinkedIn (jobs or people) (`CONTEXT.md`, `AGENTS.md`).
- Prefer JSON over HTML when a board API exists.
- [indsponsors.nl](https://indsponsors.nl/) missing the Rentman Product Designer listing is already `CONTEXT.md`, not this question.
- Golden test URL: [Rentman Product Designer](https://rentman.io/jobs/product-designer) — `Rentman B.V.` / KvK `60733144`. PD/UX is the golden test, not the corpus limit.

## Answer

**JSON (or structured XML) boards we can hit without Playwright**, once the tenant/board slug is known (seed, fingerprint, or cautious host-slug guess):

| ATS | Public board surface | Auth for list | Format |
|---|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` | None on GET | JSON |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}` | None | JSON |
| Lever | `GET https://api.lever.co/v0/postings/{site}?mode=json` (EU: `api.eu.lever.co`) | None | JSON |
| Recruitee | `GET https://{subdomain}.recruitee.com/api/offers/` or the same path on a custom careers domain | None **today**; token required **from 10 Feb 2027** | JSON |
| Teamtailor | Career site `GET https://{host}/jobs.json` (JSON Feed). Official REST API is keyed. | None for `/jobs.json` | JSON Feed 1.1 |
| Personio | `GET https://{tenant}.jobs.personio.de/xml?language={code}` | None | XML (parse; not JSON) |
| Pinpoint | `GET https://{subdomain}.pinpointhq.com/postings.json` | None | JSON |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings` | Example GETs are unauthenticated | JSON |
| Workable | Documented public `GET https://www.workable.com/api/accounts/{subdomain}?details=true` | Public list: no key in the help article; **no populated board verified in this ticket** | JSON |

**Homerun** REST needs a Bearer key. In-scope only via a discovered **public** feed URL (XML/Atom), not operator keys (`CONTEXT.md` **public board feed**).

**Rentman path (corrected):** marketing `https://rentman.io/jobs/{slug}` is Webflow. Apply CTA for Product Designer points at **Ashby** board `rentman` (`https://jobs.ashbyhq.com/rentman/86561042-c8f9-4a2c-9d93-c51ba421e6e7`). Live `GET https://api.ashbyhq.com/posting-api/job-board/rentman` → 200, **13** jobs including **Product Designer**. Legacy Recruitee `GET https://careers.rentman.io/api/offers/` still returns **5** offers (not including Product Designer). **Board seed / existence for the golden test: Ashby `rentman`.** Prefer careers URL `https://rentman.io/jobs/product-designer` as primary when it still resolves to that posting; else Ashby `jobUrl`.

**Playwright** is last resort on the **extraction ladder** after public board feed + HTTP/HTML fail or return empty/thin — not the default for Ashby/Greenhouse-class boards.

**robots.txt:** prefer vendor-host feeds when the token is known. Soft-ignore Disallow on employer job-like paths only as fallback, identifiable UA ([ADR 0001](../docs/adr/0001-robots-soft-ignore-job-paths.md)).

## Design decisions (grill 2026-08-26)

Locked into `CONTEXT.md` and ADRs:

| Topic | Decision |
|---|---|
| Existence | ATS-authoritative when a **public board feed** is known; else careers HTML / last-resort browser |
| Identity | `(ATS family, board token, posting id)`; HTML fallback then re-key/merge |
| URLs | Dual-URL **Opening**; primary = live careers URL, else ATS URL |
| Ladder | Feed → HTML (fingerprint + optional Openings) → Playwright last resort |
| Keys | No operator API keys; public feeds only |
| Discovery | **Board seed** + fingerprint + **cautious board guess** (one host-slug try / **v1 board family**; negative cache until site/seed changes) — [ADR 0003](../docs/adr/0003-cautious-board-guess.md) |
| Families | Greenhouse, Ashby, Lever, Recruitee, Teamtailor, Personio, SmartRecruiters (+ evidenced/guessed public feeds) |
| Closed | Successful authoritative omit ⇒ not open (no soft TTL) |

---

## 1. Public ATS boards (primary)

There is **no cross-tenant directory**. Every vendor below is one recognised-sponsor board at a time. The slug/token comes from **board seed**, careers HTML fingerprint, or **cautious board guess** — not from the IND register (name + KvK only).

### Greenhouse

- Support: Job Board API “export information about your public job boards”; GET list jobs needs no auth; POST apply does ([Greenhouse API overview](https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview)).
- Docs (source): [Job Board introduction](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_introduction.md) — “Job Board data is publicly available, so authentication is not required for any GET endpoints.”
- List: `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`. Optional `content=true` adds description, departments, offices ([jobs.md](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_jobs.md)).
- Hosted board HTML: `https://boards.greenhouse.io/{board_token}` (token is the path segment).
- Live check 2026-08-26: `GET …/boards/greenhouse/jobs` → 200 JSON, `meta.total` 18. Fields include `title`, `absolute_url`, `location`, `updated_at`.

### Ashby

- Official: [Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api).
- `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation={true/false}`.
- Slug = last path segment of `https://jobs.ashbyhq.com/{JOB_BOARD_NAME}`.
- Returns `jobs[]` with `id`, `title`, `location`, `isRemote`, `workplaceType`, `employmentType`, `jobUrl`, `applyUrl`, `isListed`, optional `compensation`.
- Live check: `GET …/job-board/Ashby` → 200 JSON; `GET …/job-board/rentman` → 200, 13 jobs including Product Designer (id `86561042-c8f9-4a2c-9d93-c51ba421e6e7`).

### Lever

- Official: [lever/postings-api README](https://github.com/lever/postings-api/blob/master/README.md).
- Global `https://api.lever.co/v0/postings/{SITE}`; EU `https://api.eu.lever.co/v0/postings/{SITE}`. Use `?mode=json` (or `Accept: application/json`). Pagination `skip` / `limit`.
- Hosted site: `https://jobs.lever.co/{SITE}` / `https://jobs.eu.lever.co/{SITE}`.
- Published jobs only; “These jobs may be scraped by third parties.” Internal jobs are hidden.
- Fields: `id`, `text` (title), `hostedUrl`, `applyUrl`, `categories`, `workplaceType`, optional `salaryRange`.
- CORS is only allowed from the company’s own domains — server-side fetch for **hsm-jobs-mcp**.
- Live check: `GET …/postings/leverdemo?mode=json&limit=3` → JSON array.
- `https://api.lever.co/robots.txt`: `User-agent: *` / `Allow: /` / `Crawl-delay: 1`.

### Recruitee (Tellent)

- Careers Site API: unauthenticated in the [intro](https://docs.recruitee.com/reference/intro-to-careers-site-api) (“available under your Careers Site address”).
- List: `GET https://{yourcompany}.recruitee.com/api/offers/` ([/offers/](https://docs.recruitee.com/reference/offers)). Filters: `department`, `tag`. Empty `security` in the OpenAPI. Fields include `title`, `slug`, `status`, `careers_url`, `careers_apply_url`, `locations[]` (with `country_code`), `salary {min,max,period,currency}`, `remote` / `on_site` / `hybrid`.
- **Auth change:** [Authentication](https://docs.recruitee.com/reference/authentication-1) (updated 2026-08-12) — “Deadline for introducing the token to calls is **10 February 2027**. Calls without the authorization header will return `401 Unauthorized`.” Header: `X-Careers-Sites-Token`. “The XML offer feed and jobs widget are not covered by the Careers API token.”
- Separate [XML job-board feed](https://docs.recruitee.com/docs/feed) is per job board, published offers only.
- Live check: Rentman Recruitee still answers — see §2 (legacy / partial vs Ashby).

### Teamtailor

- Official REST API: JSON:API at `https://api.teamtailor.com` (EU), requires an API key from Settings → Integrations ([support article](https://support.teamtailor.com/en/articles/5963369-use-our-teamtailor-api)). That is **not** a keyless board feed.
- Career sites serve a JSON Feed at `{career-host}/jobs.json`. Live check 2026-08-26: `GET https://polestar.teamtailor.com/jobs.json` → 200, `Content-Type: application/feed+json`, `version: https://jsonfeed.org/version/1.1`, `items[]` with `title`, `url`, `date_published`, `content_html`, nested `_jobposting`.
- Treat `/jobs.json` as the public board; do not depend on a Teamtailor customer minting a Public Read key for **hsm-jobs-mcp**.

### Personio

- Not JSON. Documented XML career-site feed: [Retrieving open positions](https://developer.personio.de/docs/retrieving-open-job-positions) and [GET /xml](https://developer.personio.de/v1.0/reference/get_xml).
- `https://{YOUR_COMPANY}.jobs.personio.de/xml?language=` with `de|en|fr|es|nl|it|pt` (`nl` is listed).
- Elements: `id`, `name` (title), `office`, `department`, `employmentType`, `seniority`, `schedule`, description blocks.
- Authenticated Recruiting API is a different, keyed surface.
- Live check: `GET https://personio.jobs.personio.de/xml?language=en` → 200 `text/xml`, `<workzag-jobs><position>…`.

### Homerun (NL-founded ATS)

- [Public API](https://developers.homerun.co/): Bearer `public-api-v2-key`; `vacancies:read`. Docs: “If your workflow only involves fetching a list of vacancies, please consider using our Job XML Feeds feature instead.”
- [How to generate an XML feed](https://help.homerun.co/en/articles/5013627-how-to-generate-an-xml-feed): Settings → Integrations → “Homerun XML” → copy feed link. Same pattern for Indeed/VONQ. The URL is **not** `{company}.homerun.co/jobs.json`.
- Embed widget is HTML/JS, not a documented JSON list ([embed jobs](https://help.homerun.co/en/articles/2240786-integrating-homerun-embedding-a-list-of-active-job-posts)).
- Implication: in scope only when a stable **public** feed URL is evidenced or accepted under cautious-guess policy — no operator-held Homerun API keys in v1.

### Others worth detecting

| ATS | Surface | Notes |
|---|---|---|
| **Pinpoint** | `https://{subdomain}.pinpointhq.com/postings.json` | Official [Job Postings JSON Endpoint](https://developers.pinpointhq.com/docs/jobs-json-endpoint). Replaces deprecated `jobs.json`. |
| **SmartRecruiters** | `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings` | Official [Posting API endpoints](https://developers.smartrecruiters.com/docs/endpoints). Example curl has no auth header. In **v1 board families**. |
| **Workable** | Help: `GET https://www.workable.com/api/accounts/{account_subdomain}?details=true` ([create a careers page](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page)). | **Not** in named **v1 board families** until a populated public feed is verified; HTML/last-resort until then. |
| **BambooHR** | No official public jobs API in [BambooHR API docs](https://documentation.bamboohr.com/). | Prefer HTML or skip unless a later ticket locks it. |
| **Workday / SAP / Oracle** | Sometimes CXS JSON POST, often JS portals | Default Playwright/Firecrawl bucket unless a later probe proves a stable JSON path. |

Do not use aggregator job boards as first-party openings (`CONTEXT.md`).

---

## 2. Rentman’s board path

Re-checked 2026-08-26 against `https://rentman.io/jobs/product-designer`, Ashby public API, and Recruitee JSON. KvK `60733144` is in the marketing footer.

### Marketing site (golden-test URL host)

- `https://rentman.io/jobs` is Webflow (`data-wf-domain="rentman.io"`). NL alternate: `https://rentman.io/nl/vacatures`.
- Vacancies are a CMS collection with Webflow pagination (`?…_page=2`). `rentman.io/robots.txt` Disallows `/*?*page=` — do not paginate as a crawler.
- Golden-test URL `https://rentman.io/jobs/product-designer` returns **HTTP 200**, title “Product Designer”, Utrecht.
- **Apply CTA** (live HTML): `href="https://jobs.ashbyhq.com/rentman/86561042-c8f9-4a2c-9d93-c51ba421e6e7"`.
- CSS still contains legacy comments (“fix weird vacancy styling from Recruitee”) — do not treat comments as the live ATS.

### Ashby (authoritative for golden-test existence)

| URL | Result 2026-08-26 |
|---|---|
| `GET https://api.ashbyhq.com/posting-api/job-board/rentman` | **200** JSON, **13** jobs |
| Product Designer | id `86561042-c8f9-4a2c-9d93-c51ba421e6e7`, `jobUrl` matches apply CTA |

**Board seed:** Ashby family, token `rentman`.

### Recruitee (legacy / partial; still live)

| URL | Result 2026-08-26 |
|---|---|
| `GET https://careers.rentman.io/api/offers/` | **200** JSON, **5** published offers |
| `GET https://careers.rentman.io/` (HTML) | **301** → Recruitee “careers not hosted” |
| `GET https://rentman.recruitee.com/api/offers/` | **404** |

Published Recruitee offers (no Product Designer): Customer Support Specialist (Multilingual / French), Design System Developer, Product Marketing Manager, People Operations Specialist.

Ashby and Recruitee job sets **diverge**. Under ATS-authoritative existence, do **not** conclude Product Designer is closed because Recruitee omitted it. Prefer the board evidenced by apply links / **board seed** (Ashby). Fingerprint both; merge by posting identity per family; do not let a thinner legacy board clear Openings from a fuller current board.

### Extraction order for Rentman

1. **Board seed** (or fingerprint / cautious guess) → Ashby `rentman` public feed.
2. Existence/freshness from Ashby JSON; dual-URL Opening with careers URL `https://rentman.io/jobs/{slug}` when it still resolves to that posting.
3. Optionally still read Recruitee `/api/offers/` for residual roles, keyed as Recruitee postings — do not use Recruitee absence to drop Ashby Openings.
4. Do not paginate Webflow `?page=` (robots). No Playwright required when Ashby JSON succeeds.

---

## 3. When Playwright is required

Idea-2 stages 3–4 ([IND sponsor PD crawl plan](/Users/musa-mbp/job-search-tracking/idea-2/.cursor/plans/ind_sponsor_pd_crawl_e69d2994.plan.md), secondary) match the **extraction ladder**: homepage/path/ATS JSON first; browser only when the list is empty or “Load more” is real JS.

| Situation | Playwright? |
|---|---|
| Greenhouse / Ashby / Lever / Recruitee JSON / Teamtailor `/jobs.json` / Personio XML / Pinpoint `/postings.json` / SmartRecruiters postings GET | **No** |
| Rentman Ashby JSON | **No** |
| Rentman Webflow “Load more” if board JSON already succeeded | **No** (and pagination is robots-disallowed) |
| Homerun, public feed URL unknown, career page JS-rendered | **Yes** (or Firecrawl), after sitemap/HTML GET fails |
| Custom CMS with jobs injected after JS, infinite scroll, no board API | **Yes** (last resort) |
| WAF / bot challenge (sample: Coolblue 403 on `/robots.txt`) | Browser or paid proxy; still skip if robots/WAF says no |
| LinkedIn-only careers | **Skip** (settled) |
| Workday / SAP-style portals | **Default yes**, unless a later ticket proves CXS JSON |

Cap “Load more” clicks. Prefer Firecrawl-on-failure over Playwright-for-all-13k (same idea-2 note).

---

## 4. robots.txt and politeness

### Protocol (RFC 9309)

[RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html): fetch `https://{authority}/robots.txt`; match a product token that is a substring of `User-Agent`; if no group matches, use `User-agent: *`. Most specific Allow/Disallow wins.

Product policy for this map: [ADR 0001](../docs/adr/0001-robots-soft-ignore-job-paths.md) — prefer vendor feeds; soft-ignore employer Disallow only on job-like paths as fallback; identifiable product UA.

### Sample NL sponsor hosts (not a register census)

| Host | robots.txt 2026-08-26 | Implication |
|---|---|---|
| `rentman.io` | `User-agent: *` `Disallow: /*?*page=` (also `undefined=`, `r=`). AI bots explicitly `Allow: /`. Sitemap listed. | Do not crawl Webflow pagination queries. `/jobs` and `/jobs/{slug}` are allowed. |
| `careers.rentman.io` | 301 to Recruitee marketing “not hosted” | Do not treat that robots body as Recruitee API policy. Hit `/api/offers/` on this host without following the HTML 301. |
| `www.adyen.com`, `careers.adyen.com` | `User-agent: *` + sitemap only | Permissive. |
| `www.mollie.com`, `jobs.mollie.com` | `User-agent: *` `Allow: /` + sitemap | Permissive. |
| `www.bunq.com` | Temporary crawl window (comments: indexed-though-blocked cleanup) | Snapshot only; do not assume this stays permissive. |
| `www.coolblue.nl` | **403** WAF (`coolblue-waf-custom-response: blocked-by-aws-waf`) | RFC 9309 4xx on robots.txt → MAY crawl, but the WAF will still block. Bucket as blocked; don’t hammer. |
| `picnic.app` | Named search bots `Disallow: /api/` and consumer paths | Avoid `/api/` if a later full parse disallows it. |
| `www.booking.com` | Large file (~33 KB) | Parse fully before any HTML crawl; not needed for ATS JSON on a different host. |

### ATS API hosts

| Host | robots.txt |
|---|---|
| `boards-api.greenhouse.io` | `User-agent: *` `Disallow: /embed/` — `/v1/boards/…/jobs` allowed. |
| `api.lever.co` | `Allow: /` plus **`Crawl-delay: 1`**. |
| `api.ashbyhq.com` | **401** on `/robots.txt` (RFC 9309: MAY treat as unavailable). Still pace requests. |

### Politeness for **hsm-jobs-mcp** (layer 2)

1. Prefer ATS JSON/XML on the **ATS host**; check that host’s robots.txt, not only the brand site.
2. One recognised-sponsor host (or ATS host) at a time on the free fetch path.
3. Identify UA with a product token + repo URL.
4. Honour `Crawl-delay` where present (Lever).
5. Exponential backoff on 429/403; stop a host after repeated WAF 403.
6. Cache robots.txt ≤ 24h.
7. Do not Firecrawl or Playwright all ~13k recognised sponsors.
8. Recruitee: plan for `X-Careers-Sites-Token` by **10 February 2027**, or fall back to the XML/widget path Recruitee says stays outside that token.

---

## 5. Implications for hsm-jobs-mcp (plan only)

1. **Detector → adapter** after website resolution: Greenhouse, Ashby, Lever (± EU), Recruitee, Teamtailor `/jobs.json`, Personio XML, SmartRecruiters, evidenced Homerun public feeds; Workable only after verified populated feed.
2. **Extraction ladder** as in `CONTEXT.md` (seed / fingerprint / cautious guess → HTML → Playwright last).
3. **Rentman golden test:** Ashby `rentman` for existence; primary URL `https://rentman.io/jobs/product-designer` while it resolves; else Ashby `jobUrl`. Recruitee alone is insufficient and would fail the golden test today.
4. **No LinkedIn. No aggregator boards as first-party.**
5. **Do not crawl the full register in v1 research.** This file is the adapter catalogue + Rentman path, not an NL ATS prevalence census.

## Sources

- Greenhouse: [API overview](https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview); [job-board introduction](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_introduction.md); [list jobs](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_jobs.md); live `boards-api.greenhouse.io`.
- Ashby: [Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api); live `api.ashbyhq.com` including board `rentman`.
- Lever: [postings-api README](https://github.com/lever/postings-api/blob/master/README.md); live `api.lever.co`; `api.lever.co/robots.txt`.
- Recruitee: [Careers Site API intro](https://docs.recruitee.com/reference/intro-to-careers-site-api); [/offers/](https://docs.recruitee.com/reference/offers); [Authentication](https://docs.recruitee.com/reference/authentication-1); [Feed](https://docs.recruitee.com/docs/feed); live `careers.rentman.io/api/offers/`.
- Teamtailor: [Use our Teamtailor API](https://support.teamtailor.com/en/articles/5963369-use-our-teamtailor-api); live `polestar.teamtailor.com/jobs.json`.
- Personio: [Retrieving open positions](https://developer.personio.de/docs/retrieving-open-job-positions); [GET /xml](https://developer.personio.de/v1.0/reference/get_xml); live Personio XML.
- Homerun: [developers.homerun.co](https://developers.homerun.co/); [XML feed](https://help.homerun.co/en/articles/5013627-how-to-generate-an-xml-feed); [Indeed XML](https://help.homerun.co/en/articles/5012921-how-to-automatically-post-your-jobs-on-indeed-with-our-xml-feed); [embed jobs](https://help.homerun.co/en/articles/2240786-integrating-homerun-embedding-a-list-of-active-job-posts).
- Pinpoint: [postings.json](https://developers.pinpointhq.com/docs/jobs-json-endpoint).
- SmartRecruiters: [Posting API endpoints](https://developers.smartrecruiters.com/docs/endpoints); live company postings GET.
- Workable: [Using the Workable API to create a careers page](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page).
- Rentman: `https://rentman.io/jobs/product-designer`, `https://rentman.io/robots.txt`, Ashby board `rentman`, `https://careers.rentman.io/api/offers/`.
- Robots: [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html); sample GETs listed in §4; [ADR 0001](../docs/adr/0001-robots-soft-ignore-job-paths.md).
- Secondary (after ATS docs): idea-2 plan stages 3–4, [ind_sponsor_pd_crawl_e69d2994.plan.md](/Users/musa-mbp/job-search-tracking/idea-2/.cursor/plans/ind_sponsor_pd_crawl_e69d2994.plan.md).
