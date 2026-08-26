# Domain language

Use these terms. Don’t drift to synonyms the glossary avoids.

## Product

- **hsm-jobs-mcp** — working name. An MCP that answers which recognised-sponsor (Work) companies have **open jobs** matching a title/location. Not a public job portal. Not a register-only MCP. Rename is out of scope for the current Wayfinder map.
- **hsm-mcp** — existing register-lookup MCP ([CodeAlanDebug/hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp)). Wrap or cite. Do not clone.
- **Golden test** — [Rentman Product Designer](https://rentman.io/jobs/product-designer): `Rentman B.V.` / KvK `60733144`. If the pipeline cannot return that URL, it is not ready.

## Immigration and register

- **Recognised sponsor** — organisation on the IND Public register Work. Licensed to sponsor, not a promise they will sponsor *this* vacancy or an HSM transfer.
- **Kennismigrant / HSM** — highly skilled migrant. Employer-tied. Switching jobs needs an **HSM transfer** to a recognised sponsor at or above the **salary criterion**.
- **Salary criterion** — IND gross monthly minimum excl. holiday allowance. Changes on 1 January, not with the monthly register. 2026: €5,942 (30+), €4,357 (under 30), €3,122 (reduced / graduate).
- **Register refresh** — IND updates the public register monthly (“last updated” on the Work page). Not the same event as the salary criterion change.
- **KvK** — 8-digit Dutch Chamber of Commerce number. The register is name + KvK only. No official website field, no official API.

## Three data layers (only the middle one is ours)

| Layer | Example question | Who already does it | This product |
|---|---|---|---|
| 1. Register | “Is Adyen a recognised sponsor?” | hsm-mcp, GitHub CSV, indsponsors directory | Wrap / cite. Do not clone. |
| 2. Open jobs on careers/ATS | “Which sponsors are hiring UX designers right now?” | Nobody well. Aggregator job boards are thin and noisy. | **This is hsm-jobs-mcp.** |
| 3. Workforce graph | “How many sponsors have PDs on the team?” | LinkedIn Company Insights. No official third-party API. | Out of scope. An opening is not a team. |

## Settled competitor facts (2026-08-26)

Do not re-open these as research questions.

- [indsponsors.nl](https://indsponsors.nl/) is a sponsor directory plus a thin aggregator jobs list. It missed the Rentman Product Designer listing.
- [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp) already does register lookup and freshness.
- The WellLanded web app was down (`DEPLOYMENT_NOT_FOUND`).
- May→July 2026 register churn was +164 / −74 KvKs.
- GitHub mirror snapshot lagged live IND (July snapshot vs IND last updated 3 August 2026).
- DutchSponsors and VisaList.nl exist; they are not the jobs-on-careers wedge.

## Honesty

Most job descriptions omit pay and language. Licensed ≠ this vacancy will sponsor you. Tool responses must return **unknown**, not invent certainty.

## Avoid

- “Visa sponsor list” as the product name (that is layer 1).
- Scraping LinkedIn (jobs or people).
- Treating aggregator board hits as first-party openings.
- Title-filtering the crawl to product design. PD/UX is the golden test, not the corpus limit.
