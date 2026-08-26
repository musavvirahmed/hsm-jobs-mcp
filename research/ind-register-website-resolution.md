# IND register plus website resolution

**Ticket:** [IND register plus website resolution](https://github.com/musavvirahmed/hsm-jobs-mcp/issues/3)
**Researched:** 2026-08-26
**Question:** How do we go from the IND Public register Work (name + KvK, no official API, no website field) to a validated official website for a recognised sponsor, at ~13k scale?

## Verdict

Consume the register by wrapping **hsm-mcp** (or fetching the same IND HTML it already parses). Do not treat the GitHub CSV as canonical: it is one monthly **register refresh** behind. Resolve websites with a cached cascade — Wikidata, then domain-guess plus validate, then search. Wikidata and the KvK Open Dataset cannot carry 13k. The **golden test** (Rentman B.V. / KvK `60733144`) is on both the live IND page and the lagging mirror; Wikidata has no P3220 for it; `rentman.nl` 302s to `rentman.io`, which is why guess-plus-redirect can still pass.

## Settled (not re-opened)

- Wrap or consume register lookup. Do not rebuild [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp). Do not clone the IND register as the product.
- Golden test: [Rentman Product Designer](https://rentman.io/jobs/product-designer) — `Rentman B.V.` / KvK `60733144`.
- Idea-2 stages 1–2 remain the right *shape* of the pipeline (register HTML → website cascade). This note quantifies the unknowns that plan left as “incomplete.”

## 1. What the IND Work page actually is

Fetched 2026-08-26 from [Public register Work](https://ind.nl/en/public-register-recognised-sponsors/public-register-work).

| Fact | Evidence |
|---|---|
| No official API | HTML page only. hsm-mcp README: “IND publishes the register as a monthly-updated HTML page with no API.” |
| Columns | `Organisation` and `KVK (Chamber of Commerce) number` only. No website field. Organisation cells are `<th scope="row">` (hsm-mcp `src/scraper.ts`). |
| Register refresh | Page text: “The public registers are updated once a month.” “The overview was last updated on **3 August 2026**.” |
| Scale today | **12,931** rows / **12,928** unique 8-digit KvKs in the live HTML (same counts from tag-scan of the HTML and from the markdown conversion of that page). |
| Golden test | `Rentman B.V.` and `60733144` are both present in the live HTML. |
| Duplicate KvKs in source | Three KvKs appear twice: `52813150` (Centraal Planbureau **and** Ministerie van Economische Zaken — two names, one KvK), `64755843` (ITX Merken B.V. twice), `24109799` (Stolt-Nielsen B.V. twice). Same three duplicates are in the GitHub mirror, so this is IND data, not a parse bug. |

KvK is the join key. Names are registered legal names, often not the trade name on a careers page ([hsm-mcp CONTEXT.md](https://github.com/CodeAlanDebug/hsm-mcp/blob/main/CONTEXT.md): registered name vs trade name).

## 2. How to consume the register (do not rebuild hsm-mcp)

Three existing consumers of the same IND HTML. Only one is current as of this research date.

| Consumer | `asOfDate` / last updated | Rows | Rentman `60733144` | Notes |
|---|---|---|---|---|
| Live IND HTML | 3 August 2026 | 12,931 / 12,928 unique KvK | Yes | Canonical. No API. |
| [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp) `GET https://hsm.codealan.com/health` | `"ind_last_updated":"2026-08-03"` | not in `/health` | not probed via MCP in this ticket | `stale: false`; last scrape success `2026-08-26T06:17:28.800Z`. Daily cron, write-on-change when IND’s own date moves (`src/scraper.ts`, `src/validate.ts`). Tools: `search_sponsors`, `get_register_status`. |
| [Jeonghoan93/netherlands-visa-sponsors](https://github.com/Jeonghoan93/netherlands-visa-sponsors) | `asOfDate`: **2026-07-01** in `sponsors.json` | **12,883** | Yes: `Rentman B.V.,60733144` in `sponsors.csv` | README claims an automated weekly refresh; this repo’s only workflow is `validate-data.yml`. `scripts/validate.py` says refresh is **upstream WellLanded**, and warns only after **75 days**. Last GitHub commit: 2026-07-06. |

**Lag:** GitHub mirror is one IND monthly publication behind (1 July vs 3 August 2026). Net row delta vs live HTML is +48 (12,931 − 12,883), consistent with a missed August **register refresh**. hsm-mcp is on the August date.

**Name-parse drift:** live IND lists `""Aa-Dee"" Machinefabriek en Staalbouw Nederland B.V.` for KvK `16051874`; the GitHub JSON first row for that KvK is `Machinefabriek en Staalbouw Nederland B.V.` (quoted nickname dropped). Match on KvK.

**Implication for hsm-jobs-mcp:** wrap hsm-mcp (or fetch IND HTML with the same gates hsm-mcp already has: parse “last updated on …”, require thousands of 8-digit KvKs, reject >30% row-count jumps). Use the GitHub CSV only as a stale fixture, never as the production register.

## 3. Wikidata: KvK (P3220) → official website (P856)

Properties (Wikidata, retrieved 2026-08-26):

- [P3220](https://www.wikidata.org/wiki/Property:P3220) — “KvK company ID”, datatype external-id, format `[0-9]{7,8}` (leading zeros may be absent).
- [P856](https://www.wikidata.org/wiki/Property:P856) — “official website”. Description: URL of the official page of an item (current or former).

SPARQL against `https://query.wikidata.org/sparql` on 2026-08-26:

```sparql
SELECT (COUNT(DISTINCT ?item) AS ?withKvk) WHERE { ?item wdt:P3220 ?kvk . }
-- 4913 items

SELECT (COUNT(DISTINCT ?item) AS ?withBoth) WHERE {
  ?item wdt:P3220 ?kvk . ?item wdt:P856 ?website .
}
-- 3572 items

SELECT ?kvk (SAMPLE(?website) AS ?website) (COUNT(?website) AS ?nSites) WHERE {
  ?item wdt:P3220 ?kvk .
  OPTIONAL { ?item wdt:P856 ?website }
}
GROUP BY ?kvk
```

Unique P3220 values after zero-padding to 8 digits: **4,900** (3,564 with a P856 sample, 1,336 without). 76 raw IDs were 7-or-fewer digits — always `zfill(8)` before joining IND.

Intersected with the live IND unique KvK set (12,928):

| Slice | Count | Share of IND unique KvKs |
|---|---|---|
| IND ∩ P3220 | 451 | **3.5%** |
| IND ∩ P3220 + P856 | **402** | **3.1%** |
| IND ∩ P3220, no P856 | 49 | 0.4% |
| IND KvKs with no P3220 item | 12,477 | **96.5%** |

The global “~3.5k companies have KvK + website on Wikidata” figure is the wrong denominator. Most P3220 items are municipalities, associations, and other Dutch organisations that are not recognised sponsors. Coverage of *this* register is ~3%.

**Golden test:** Wikidata search `haswbstatement:P3220=60733144` → 0 hits. Label search “Rentman” → only [RentManager NZ Limited (Q140312539)](https://www.wikidata.org/wiki/Q140312539), unrelated. SPARQL dump has no row for `60733144`. **Wikidata cannot pass the golden test.**

Hits that do exist are usable but not blindly trustworthy:

| KvK | IND name | P856 on 2026-08-26 |
|---|---|---|
| 34259528 | Adyen N.V. | `https://www.adyen.com/` (good) |
| 17085815 | ASML Holding N.V. | `https://www.asml.com/` |
| 24330087 | Coolblue B.V. | `https://www.coolblue.be/` (Belgian host, not `coolblue.nl`) |
| 30204462 | Mollie B.V. | `https://www.mollie.com/` |
| 56460279 | JetBrains N.V. | P3220 present, **no P856** |
| 31047344 | Booking.com B.V. | miss |
| 34061536 | Microsoft B.V. | miss |
| 34198589 | Google Netherlands B.V. | miss |
| 56317441 | Uber B.V. | miss |
| 60034831 | GitLab B.V. | miss |

Of the 402 IND∩P856 URLs: TLD mix `.nl` 163, `.com` 145, `.org` 65, then a long tail (`.eu`, `.io`, `.be`, …). **83 still `http://`.** No LinkedIn/Indeed/Facebook P856 in the overlap (good), but Coolblue’s `.be` shows P856 can be a regional site, not the careers host you want.

**Role in the cascade:** keep as a free bulk first pass. Expect ~400 URLs, all still needing the same validation as guesses (name tokens, reject aggregators, prefer https, optionally prefer `.nl` when both exist). It will not resolve Rentman or the other ~12.5k.

## 4. KvK Open Dataset cannot resolve websites

Official docs, retrieved 2026-08-26:

- [KVK Business Register Open Dataset Basic Company Information](https://www.kvk.nl/en/ordering-products/kvk-business-register-open-data-set/)
- [API documentation](https://developers.kvk.nl/documentation/open-dataset-basis-bedrijfsgegevens-api)

Limits that kill this path for website resolution:

1. **No website field.** API output is `datumAanvang`, `actief`, `insolventieCode`, `rechtsvormCode`, `postcodeRegio`, `activiteiten` (SBI), `lidstaat`. Nothing like `websites`.
2. **Bulk omits the join keys.** FAQ “What data is not provided?”: the KvK number, the organisation name, full postcode, employee counts, sole proprietorships. You cannot join the bulk CSV to the IND register.
3. **BV/NV only.** Recognised sponsors include stichtingen, coöperaties, GmbH, LLP, Ltd, etc. (live IND: 1,663 rows do not end in B.V./BV; 329 names start with `Stichting`).
4. **Rate limits.** 1 request/minute/IP and 200 requests / 5 minutes globally — even a lookup-by-KvK that *had* websites could not do 13k in a sitting.
5. **HVDS privacy rule.** KVK withholds name and KvK from the high-value dataset because it will not judge case-by-case whether they are personal data.

**Paid contrast (not Open Dataset):** [KVK Handelsregister Basisprofiel](https://developers.kvk.nl/documentation/basisprofiel-api) *does* document `websites` on `hoofdvestiging` (“Websites registered under main branch”) and on `eigenaar` when there is no main branch. [Pricing](https://developers.kvk.nl/pricing): €6.40/month subscription + €0.02 per Basisprofiel query. A naïve 12,928-call pass is about **€259 + €6.40**. This map already treats paid KvK as out of scope; record it as an optional later residual after free cascade + search, not as v1.

## 5. Domain-guess failure modes

Idea-2 stage 2: strip legal suffixes; try `.nl` / `.com`; accept only if page tokens match the name; reject LinkedIn / Indeed / Facebook / aggregators.

Live IND name stats (12,931 rows) that break a naïve `slug + .nl|.com`:

| Pattern | Count | Why guess fails |
|---|---|---|
| Ends B.V./BV | 11,045 | Easy strip; leftover is not always the brand. |
| Other legal form | 1,663 | GmbH, Ltd, LLP, SE, Coöperatief U.A., stichtingen — `.nl` is a worse prior. |
| “Nederland” / “Netherlands” in name | 1,562 | Guess becomes `microsoftnetherlands.nl` instead of `microsoft.com`. |
| “International” | 523 | Same padding problem. |
| “Holding” | 381 | Holding KvK ≠ careers-page company (e.g. `2 Getthere Holding B.V.` vs `2 Getthere B.V.`). |
| `&` in name | 388 | Slug punctuation. |
| Starts with a digit | 53 | `073 Meeting Company B.V.` → `073meetingcompany.nl`. |
| `.com` already in the legal name | 42 | `Booking.com B.V.`, `Takeaway.com Central Core B.V.` — the domain is in the name, but the careers host may still differ. |
| `Koninklijke` | 37 | `Koninklijke Philips N.V.` is `philips.com`, not `koninklijkephilips.nl`. |
| Quoted nicknames | 13 | `""Aa-Dee"" Machinefabriek…` |
| Starts with `@` | 2 | `@EasePay B.V.` |
| Alphanum-collapsed base-name collisions | 21 bases / 43 rows | `Strik` / `Strik B.V.` / `STRIK B.V.`; `Alfen B.V.` vs `Alfen N.V.`; `Randstad B.V.` vs `Randstad N.V.` — one slug, several KvKs. |

**Golden test probes (2026-08-26, HTTPS):**

| URL | Result |
|---|---|
| `https://rentman.io` | 200, canonical host. |
| `https://www.rentman.io` | 200 → `https://rentman.io/`. |
| `https://rentman.nl` | **302** `Location: https://rentman.io/nl`. Guess of `.nl` works *if* redirects are followed and the final host is stored. |
| `https://rentman.com` | TLS certificate does not match `rentman.com`. `curl -k` still gets HTTP 200 from *some* Apache vhost — do not accept `.com` on cert failure. |

So for Rentman: Wikidata miss; `.nl` guess plus redirect follow hits `rentman.io`; `.com` guess is a trap. Idea-2’s TLD list does not include `.io`; the only reason `.nl` saves the golden test is that Rentman owns that redirect. A company whose `.nl` is parked, a namesake, or a different product will not be so kind.

Other guess-validation rules that belong in the cascade (from idea-2 plus these probes):

- Follow redirects; persist the **final** registrable domain, not the guess.
- Require a valid TLS cert for `https`.
- Reject hosts on a denylist (LinkedIn, Indeed, Facebook, job aggregators).
- Require page text to contain distinctive name tokens (not just “B.V.”).
- Treat holding / “Nederland” / “Koninklijke” / numeric prefixes as low-confidence; send them to search sooner.
- One KvK → at most one accepted website; collisions stay unresolved until search.

## 6. Recommended cascade (research, not an implementation)

Cached by KvK, resumable, polite. This is the idea-2 stage 2 order with coverage numbers attached.

```text
IND HTML or hsm-mcp snapshot
        │  name + KvK, keyed by 8-digit KvK
        ▼
1. Wikidata SPARQL P3220 → P856     ~3% of register, misses Rentman
        │  still validate (Coolblue.be)
        ▼
2. Domain guess .nl / .com          cheap; follow redirects; TLS + token checks
        │  Rentman: .nl 302 → rentman.io  (golden test can pass here)
        ▼
3. Search fallback                  required for the residual ~10k+
        │  idea-2: Brave Search if keyed, else free HTML search with a hard stop on blocks
        ▼
Unresolved bucket                   coverage.md; optional later: paid KvK Basisprofiel
```

Do not Firecrawl 13k homepages to *find* the website; that is a later careers-page tool. Do not scrape LinkedIn.

**Register freshness rule:** re-fetch when IND’s “last updated” date moves (hsm-mcp already does this). Do not wait on the GitHub mirror.

## Sources

- [IND Public register Work](https://ind.nl/en/public-register-recognised-sponsors/public-register-work) — fetched 2026-08-26 (HTML 1,501,577 bytes; last updated 3 August 2026; Rentman present).
- [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp) — README, `src/scraper.ts`, `src/validate.ts`, `CONTEXT.md`; live `https://hsm.codealan.com/health` on 2026-08-26.
- [Jeonghoan93/netherlands-visa-sponsors](https://github.com/Jeonghoan93/netherlands-visa-sponsors) — README, `sponsors.json` (`asOfDate` 2026-07-01, count 12,883), `sponsors.csv` (Rentman row), `scripts/validate.py`, commits 2026-07-03 and 2026-07-06.
- Wikidata SPARQL endpoint `https://query.wikidata.org/sparql` (2026-08-26); [P3220](https://www.wikidata.org/wiki/Property:P3220); [P856](https://www.wikidata.org/wiki/Property:P856); MediaWiki API search for P3220=60733144.
- [KVK Open Dataset product page](https://www.kvk.nl/en/ordering-products/kvk-business-register-open-data-set/) and [API docs](https://developers.kvk.nl/documentation/open-dataset-basis-bedrijfsgegevens-api).
- [KVK Basisprofiel API](https://developers.kvk.nl/documentation/basisprofiel-api) and [pricing](https://developers.kvk.nl/pricing) — paid contrast only.
- Idea-2 crawl plan stages 1–2: `/Users/musa-mbp/job-search-tracking/idea-2/.cursor/plans/ind_sponsor_pd_crawl_e69d2994.plan.md`.

No crawler was implemented. Website probes were limited to the golden-test hosts plus SPARQL/API lookups cited above.
