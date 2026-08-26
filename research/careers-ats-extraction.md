# Careers and ATS extraction without LinkedIn

**Ticket:** [Careers and ATS extraction without LinkedIn](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/4)
**Date:** 2026-08-26
**Method:** Primary ATS docs, live GETs to documented board endpoints, Rentman marketing + Recruitee hosts, and `robots.txt` on a small sample of NL recognised-sponsor hosts. No full-register crawl. No product code.

## Question

For recognised-sponsor career sites in the Netherlands, which public ATS JSON boards can we hit (Greenhouse, Ashby, Lever, Recruitee, Teamtailor, Personio, Homerun, others), what is Rentman’s board path, and when is Playwright required? What do robots.txt and politeness imply?

## Settled (do not re-open)

- Skip LinkedIn (jobs or people) (`CONTEXT.md`, `AGENTS.md`).
- Prefer JSON over HTML when a board API exists (this ticket).
- [indsponsors.nl](https://indsponsors.nl/) missing the Rentman Product Designer listing is already `CONTEXT.md`, not this question.
- Golden test URL: [Rentman Product Designer](https://rentman.io/jobs/product-designer) — `Rentman B.V.` / KvK `60733144`. PD/UX is the golden test, not the corpus limit.

## Answer

**JSON (or structured XML) boards we can hit without Playwright**, once the tenant/board slug is known from the careers URL:

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
| Workable | Documented public `GET https://www.workable.com/api/accounts/{subdomain}?details=true`. Authenticated SPI `/jobs` is the customer API. | Public list: no key in the help article | JSON |

**Homerun does not publish an unauthenticated JSON board API.** The Public API (`GET https://api.homerun.co/v2/vacancies`) needs a Bearer key. The supported no-key structured path is a **per-account XML feed URL** copied from Settings → Integrations, not a guessable `{slug}` endpoint.

**Rentman path:** marketing list `https://rentman.io/jobs` (Webflow) with listing URLs `https://rentman.io/jobs/{slug}`; live ATS is Tellent Recruitee at `GET https://careers.rentman.io/api/offers/` (JSON). HTML `https://careers.rentman.io/` currently 301s to Recruitee “careers not hosted”; the JSON path still 200s. `rentman.recruitee.com/api/offers/` is 404. Prefer Recruitee JSON as the open-job source of truth; prefer `rentman.io/jobs/{slug}` as the listing URL when that CMS item exists.

**Playwright is required** only when there is no usable board feed: JS-only custom pages, “Load more” that never becomes a query-param HTML page, WAF/cookie walls, Workday-class portals without a working CXS JSON POST, or Homerun HTML when the XML feed URL is unknown. It is **not** required for Greenhouse / Ashby / Lever / Recruitee JSON / Teamtailor `/jobs.json` / Personio XML / Pinpoint `/postings.json`.

**robots.txt / politeness:** honour RFC 9309 per host; identify a product-token User-Agent; one host at a time; back off on 429/403; cache. Rentman’s `robots.txt` disallows pagination query strings (`/*?*page=`), which is another reason not to scrape the Webflow list. Lever’s API host sets `Crawl-delay: 1`. Coolblue’s WAF returned 403 even for `/robots.txt`. ATS JSON lives on ATS hosts; their `robots.txt` is the relevant one, not the sponsor marketing site’s.

---

## 1. Public ATS boards (primary)

There is **no cross-tenant directory**. Every vendor below is one recognised-sponsor board at a time. The slug/token comes from the careers URL (or from HTML/nav detection), not from the IND register (name + KvK only).

### Greenhouse

- Support: Job Board API “export information about your public job boards”; GET list jobs needs no auth; POST apply does ([Greenhouse API overview](https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview)).
- Docs (source): [Job Board introduction](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_introduction.md) — “Job Board data is publicly available, so authentication is not required for any GET endpoints.”
- List: `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`. Optional `content=true` adds description, departments, offices ([jobs.md](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_jobs.md)).
- Hosted board HTML: `https://boards.greenhouse.io/{board_token}` (token is the path segment).
- Live check 2026-08-26: `GET …/boards/greenhouse/jobs` → 200 JSON, `meta.total` 18. Fields include `title`, `absolute_url`, `location`, `updated_at`.
- Rate limit: not published in these docs.

### Ashby

- Official: [Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api).
- `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation={true/false}`.
- Slug = last path segment of `https://jobs.ashbyhq.com/{JOB_BOARD_NAME}`.
- Returns `jobs[]` with `title`, `location`, `isRemote`, `workplaceType`, `employmentType`, `jobUrl`, `applyUrl`, `isListed`, optional `compensation`.
- Live check: `GET …/job-board/Ashby` → 200 JSON, 62 jobs.

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
- Live check: Rentman — see §2.

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
- Implication: unless a recognised sponsor publishes or we already store their XML feed URL, Homerun is HTML/sitemap (and Playwright if the page is JS-only). Do not treat `api.homerun.co` as a public board.

### Others worth detecting

| ATS | Surface | Notes |
|---|---|---|
| **Pinpoint** | `https://{subdomain}.pinpointhq.com/postings.json` | Official [Job Postings JSON Endpoint](https://developers.pinpointhq.com/docs/jobs-json-endpoint). Replaces deprecated `jobs.json`. No CORS issues (meant for client-side). Live: `workwithus.pinpointhq.com/postings.json` → `{ data: […] }`. |
| **SmartRecruiters** | `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings` | Official [Posting API endpoints](https://developers.smartrecruiters.com/docs/endpoints). Example curl has no auth header. Live: `…/companies/smartrecruiters/postings` → JSON `content[]` with `name`, `location`, `ref`. Newer overview also describes API-key/OAuth for *internal* postings — keep list GETs unauthenticated until they break. |
| **Workable** | Help: `GET https://www.workable.com/api/accounts/{account_subdomain}?details=true` ([create a careers page](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page)). Customer SPI `/spi/v3/jobs` needs a Bearer token. | Public slug must be the account subdomain. A probe of slug `workable` 404’d; that is slug choice, not absence of the documented public route. |
| **BambooHR** | No official public jobs API in [BambooHR API docs](https://documentation.bamboohr.com/). Careers widget JSON (`/careers/list`) is undocumented — do not treat as a stable board contract. | Prefer HTML or skip unless a later ticket locks it. |
| **Workday / SAP / Oracle** | Sometimes CXS JSON POST, often JS portals | Default Playwright/Firecrawl bucket unless a later probe proves a stable JSON path. |

Do not use aggregator job boards as first-party openings (`CONTEXT.md`).

---

## 2. Rentman’s board path

Checked 2026-08-26 against `https://rentman.io/jobs`, `https://rentman.io/jobs/product-designer`, `https://careers.rentman.io/`, and Recruitee JSON. KvK `60733144` is in the marketing footer.

### Marketing site (golden-test URL host)

- `https://rentman.io/jobs` is Webflow (`data-wf-domain="rentman.io"`, `x-wf-region`). Title “Careers | Rentman Rental Software”. NL alternate: `https://rentman.io/nl/vacatures`.
- Vacancies are a CMS collection. Page 1 listing hrefs (server-rendered): `/jobs/ai-engineer-trainee`, `ai-product-trainee`, `chief-of-staff`, `customer-support-specialist-multilingual`, `design-system-developer`, `head-of-product-marketing`, `legal-compliance-counsel`, `product-marketing-manager`, `senior-frontend-developer-customer-lifecycle`.
- “Load more vacancies” is **Webflow pagination**, not infinite client fetch: `href="?5e3b8ab7_page=2"` (`w-pagination-next`). Page 2 HTML still contains `/jobs/product-designer` (and template/stale slugs such as `basic-job-template`).
- Golden-test URL `https://rentman.io/jobs/product-designer` returns **HTTP 200**, `data-wf-item-slug="product-designer"`, title “Product Designer”, “Apply now”, `mailto:work@rentman.io`. CSS comments mention Recruitee (“fix weird vacancy styling from Recruitee”). No Greenhouse/Ashby/Lever/Teamtailor/Personio/Homerun hosts in the jobs HTML.

### Recruitee (live ATS)

| URL | Result 2026-08-26 |
|---|---|
| `GET https://careers.rentman.io/api/offers/` | **200** `application/json`, 5 published offers |
| `GET https://careers.rentman.io/` (HTML) | **301** → `https://recruitee.com/careers_not_hosted` |
| `GET https://rentman.recruitee.com/api/offers/` | **404** |
| `GET https://careers.rentman.io/robots.txt` | **301** to the same “not hosted” HTML |

Published Recruitee offers (title / slug / `careers_url`):

- Customer Support Specialist - Multilingual → `…/o/customer-support-specialist-multilingual-1`
- Customer Support Specialist - French → `…/o/customer-support-specialist-french-1`
- Design System Developer → `…/o/design-system-developer`
- Product Marketing Manager → `…/o/product-marketing-manager-3`
- People Operations Specialist → `…/o/people-operations-specialist`

Locations on those offers: Utrecht. `salary` objects present but min/max/period/currency all null.

**Product Designer is not in Recruitee’s published `offers[]` today.** The Webflow item at `/jobs/product-designer` still 200s. Webflow list and Recruitee JSON already diverge (Webflow shows roles Recruitee does not publish, and Recruitee’s People Operations Specialist is not on Webflow page 1). For “open jobs”, Recruitee JSON is the board; for the golden-test **URL**, keep `https://rentman.io/jobs/{slug}` when the CMS slug matches.

### Extraction order for Rentman (and Recruitee-on-Webflow generally)

1. Detect Recruitee (custom domain `careers.{brand}` or `*.recruitee.com`, or HTML comments/apply links).
2. `GET {careers-origin}/api/offers/` even if the HTML origin 301s — **do not follow HTML redirects for the API path**.
3. Map `slug` → preferred listing URL `https://rentman.io/jobs/{slug}` when that path 200s; else use `careers_url`.
4. Do not paginate `rentman.io/jobs?...page=` as a crawler (see robots). Do not require Playwright for this sponsor if Recruitee JSON succeeds.

---

## 3. When Playwright is required

Idea-2 stages 3–4 ([IND sponsor PD crawl plan](/Users/musa-mbp/job-search-tracking/idea-2/.cursor/plans/ind_sponsor_pd_crawl_e69d2994.plan.md), secondary) match the primary docs: homepage/path/ATS JSON first; browser only when the list is empty or “Load more” is real JS.

| Situation | Playwright? |
|---|---|
| Greenhouse / Ashby / Lever / Recruitee JSON / Teamtailor `/jobs.json` / Personio XML / Pinpoint `/postings.json` / SmartRecruiters postings GET | **No** |
| Rentman Recruitee JSON | **No** |
| Rentman Webflow “Load more” if JSON already succeeded | **No** (and pagination is robots-disallowed) |
| Homerun, XML feed URL unknown, career page JS-rendered | **Yes** (or Firecrawl), after sitemap/HTML GET fails |
| Custom CMS with jobs injected after JS, infinite scroll, no board API | **Yes** |
| WAF / bot challenge (sample: Coolblue 403 on `/robots.txt`) | Browser or paid proxy; still skip if robots/WAF says no |
| LinkedIn-only careers | **Skip** (settled) |
| Workday / SAP-style portals | **Default yes**, unless a later ticket proves CXS JSON |

Cap “Load more” clicks. Prefer Firecrawl-on-failure over Playwright-for-all-13k (same idea-2 note).

---

## 4. robots.txt and politeness

### Protocol (RFC 9309)

[RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html): fetch `https://{authority}/robots.txt`; match a product token that is a substring of `User-Agent`; if no group matches, use `User-agent: *`. Most specific Allow/Disallow wins. `/robots.txt` is implicitly allowed.

Access results:

- **200 + parseable rules** → MUST follow them.
- **4xx** (robots “unavailable”) → crawler **MAY** access resources.
- **5xx** (robots “undefined”) → crawler **MUST assume complete disallow** (until a long outage, e.g. 30 days).
- Cache **SHOULD NOT** exceed 24 hours unless robots.txt is unreachable.
- Follow a small number of redirects when fetching robots.txt; rules still apply to the **initial** authority.

Product token: letters, digits are not allowed in the token itself (letters, `_`, `-` only). Identification string SHOULD explain purpose. Example shape: `HsmJobsMcp/0.1 (+https://github.com/musavvirahmed/hsm-jobs-mcp)`.

### Sample NL sponsor hosts (not a register census)

| Host | robots.txt 2026-08-26 | Implication |
|---|---|---|
| `rentman.io` | `User-agent: *` `Disallow: /*?*page=` (also `undefined=`, `r=`). AI bots explicitly `Allow: /`. Sitemap listed. | Do not crawl Webflow pagination queries. `/jobs` and `/jobs/{slug}` are allowed. |
| `careers.rentman.io` | 301 to Recruitee marketing “not hosted” | Do not treat that robots body as Recruitee API policy. Hit `/api/offers/` on this host without following the HTML 301. |
| `www.adyen.com`, `careers.adyen.com` | `User-agent: *` + sitemap only | Permissive. |
| `www.mollie.com`, `jobs.mollie.com` | `User-agent: *` `Allow: /` + sitemap | Permissive. |
| `www.bunq.com` | Temporary crawl window (comments: indexed-though-blocked cleanup) | Snapshot only; do not assume this stays permissive. |
| `www.coolblue.nl` | **403** WAF (`coolblue-waf-custom-response: blocked-by-aws-waf`) | RFC 9309 4xx on robots.txt → MAY crawl, but the WAF will still block. Bucket as blocked; don’t hammer. |
| `picnic.app` | Named search bots `Disallow: /api/` and consumer paths | A generic `*` group was not in the first 2k bytes; still avoid `/api/` if a later full parse disallows it. |
| `www.booking.com` | Large file (~33 KB) | Parse fully before any HTML crawl; not needed for ATS JSON on a different host. |

### ATS API hosts

| Host | robots.txt |
|---|---|
| `boards-api.greenhouse.io` | `User-agent: *` `Disallow: /embed/` — `/v1/boards/…/jobs` allowed. |
| `api.lever.co` | `Allow: /` plus **`Crawl-delay: 1`**. |
| `api.ashbyhq.com` | **401** on `/robots.txt` (RFC 9309: MAY treat as unavailable). Still pace requests. |

### Politeness for **hsm-jobs-mcp** (layer 2)

Aligned with idea-2 stage 4, now grounded in this sample:

1. Prefer ATS JSON/XML on the **ATS host**; check that host’s robots.txt, not only the brand site.
2. One recognised-sponsor host (or ATS host) at a time on the free fetch path.
3. Identify UA with a product token + repo URL.
4. Honour `Crawl-delay` where present (Lever).
5. Exponential backoff on 429/403; stop a host after repeated WAF 403.
6. Cache jobs on a short TTL (idea-2: ~7 days for careers/jobs); cache robots.txt ≤ 24h.
7. Do not Firecrawl or Playwright all ~13k recognised sponsors. JSON boards stay free and more accurate than HTML.
8. Recruitee: plan for `X-Careers-Sites-Token` by **10 February 2027**, or fall back to the XML/widget path Recruitee says stays outside that token.

---

## 5. Implications for hsm-jobs-mcp (plan only)

1. **Detector → adapter.** After website resolution (other tickets), classify careers URLs: Greenhouse token, Ashby slug, Lever site (+ EU vs global), Recruitee origin, Teamtailor `/jobs.json`, Personio `{tenant}.jobs.personio.de`, Pinpoint `postings.json`, SmartRecruiters company identifier, Workable subdomain, Homerun XML-if-known else HTML.
2. **JSON/XML first, Playwright last.** Matches this ticket’s settled preference and idea-2 stages 3–4.
3. **Rentman golden test:** Recruitee `careers.rentman.io/api/offers/` for openness; listing URL `https://rentman.io/jobs/{slug}`. Today Product Designer is a Webflow 200 without a Recruitee published offer — the pipeline must not invent sponsorship, and must not treat a stale CMS page as a live opening if Recruitee omitted it.
4. **No LinkedIn. No aggregator boards as first-party.**
5. **Do not crawl the full register in v1 research.** This file is the adapter catalogue, not a prevalence census of NL ATS share.

## Sources

- Greenhouse: [API overview](https://support.greenhouse.io/hc/en-us/articles/10568627186203-Greenhouse-API-overview); [job-board introduction](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_introduction.md); [list jobs](https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_jobs.md); live `boards-api.greenhouse.io`.
- Ashby: [Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api); live `api.ashbyhq.com`.
- Lever: [postings-api README](https://github.com/lever/postings-api/blob/master/README.md); live `api.lever.co`; `api.lever.co/robots.txt`.
- Recruitee: [Careers Site API intro](https://docs.recruitee.com/reference/intro-to-careers-site-api); [/offers/](https://docs.recruitee.com/reference/offers); [Authentication](https://docs.recruitee.com/reference/authentication-1); [Feed](https://docs.recruitee.com/docs/feed); live Rentman JSON.
- Teamtailor: [Use our Teamtailor API](https://support.teamtailor.com/en/articles/5963369-use-our-teamtailor-api); live `polestar.teamtailor.com/jobs.json`.
- Personio: [Retrieving open positions](https://developer.personio.de/docs/retrieving-open-job-positions); [GET /xml](https://developer.personio.de/v1.0/reference/get_xml); live Personio XML.
- Homerun: [developers.homerun.co](https://developers.homerun.co/); [XML feed](https://help.homerun.co/en/articles/5013627-how-to-generate-an-xml-feed); [Indeed XML](https://help.homerun.co/en/articles/5012921-how-to-automatically-post-your-jobs-on-indeed-with-our-xml-feed); [embed jobs](https://help.homerun.co/en/articles/2240786-integrating-homerun-embedding-a-list-of-active-job-posts).
- Pinpoint: [postings.json](https://developers.pinpointhq.com/docs/jobs-json-endpoint).
- SmartRecruiters: [Posting API endpoints](https://developers.smartrecruiters.com/docs/endpoints); live company postings GET.
- Workable: [Using the Workable API to create a careers page](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page).
- Rentman: `https://rentman.io/jobs`, `https://rentman.io/jobs/product-designer`, `https://rentman.io/robots.txt`, `https://careers.rentman.io/api/offers/`.
- Robots: [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html); sample GETs listed in §4.
- Secondary (after ATS docs): idea-2 plan stages 3–4, [ind_sponsor_pd_crawl_e69d2994.plan.md](/Users/musa-mbp/job-search-tracking/idea-2/.cursor/plans/ind_sponsor_pd_crawl_e69d2994.plan.md).
