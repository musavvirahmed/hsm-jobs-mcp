# hsm-jobs

What if you could simply ask your AI (model of choice) which [Dutch recognised sponsors](https://ind.nl/en/public-register-recognised-sponsors/public-register-work) are hiring? This remote MCP server will do exactly that. It will find you job openings by those recognised sponsors, and present them to you in an easy-to-read way.

![Screenshot of GitHub Copilot calling hsm-jobs](docs/readme/hsm-jobs-mcp-sierra-site-thumbnail-v1.png)

## Step 1 of 2: Connect to the MCP server

**If you use Claude Code:**

```bash
claude mcp add --transport http hsm-jobs https://hsmjobs.musavvir.work/mcp
```

**If you use GitHub Copilot CLI:**

```bash
copilot mcp add --transport http hsm-jobs https://hsmjobs.musavvir.work/mcp
```

**Or if you use any other AI-IDE, try applying this setting:**

```json
{
  "mcpServers": {
    "hsm-jobs": { "url": "https://hsmjobs.musavvir.work/mcp" }
  }
}
```

Note: if you have questions such as "Is Booking.com a recognised sponsor?" then you must use this other [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp) server.

## Step 2 of 2: Then just ask

- "Which recognised sponsors are hiring product designers?"
- "Which recognised sponsors are hiring software engineers in Amsterdam?"
- "What Openings do you have for KvK 60733144?"
- "How fresh is the jobs index?"

## What does 'how fresh' mean?

The IND Work register lists  ~**13,000** recognised sponsor companies. This server does **not** scrape those careers pages real-time when you ask. It answers from a shared **jobs index** that a crawler updates in the background.

That jobs index must stay current because - the register can change (sponsors can be added or removed), employers post and remove openings on their own website or 3rd-party ATS pages, and job openings in the jobs index can outlive the live posting until the crawler re-checks that board.

After a full careers pass, every current register sponsor has been checked at least once. Only a few hundred typically have Openings in the jobs index at once; the rest were checked and had none (or no usable public board).

Maintenance is roughly **daily**: re-check a capped slice of known boards (boards with openings first), and attempt any new register sponsors that still lack an outcome. Not every board is refreshed every day, so some postings can stay in the jobs index for several days after they disappear on the employer site.

Ask `get_index_status` for the current last successful crawl time, stale flag, jobs count, and index scope.

## Besides 'just asking', what else can you do?


| Built-in tool you can call | What it does                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `search_jobs`              | Openings at recognised sponsors by title/free text or 8-digit KvK; optional location. |
| `get_job`                  | One Opening by its primary careers or ATS URL; returns structured miss when absent.   |
| `get_index_status`         | Jobs-index health, crawl freshness, and index scope (partial vs full careers pass).   |

---

**Outcome:** A kennismigrant can ask an AI for Opening links at recognised sponsors that match a title.

| | |
| --- | --- |
| **Problem** | When a foreigner in the Netherlands holds a Highly Skilled Migrant (kennismigrant) status, career mobility (inside Netherlands) is limited. They can only work for recognised sponsors, and they must also stay above the HSM salary criterion. Although IND publishes a list of ~13,000 recognised sponsor companies, but using that list to find a job is a tall order. |
| **Goal** | What if an HSM could simply ask an AI for job opening links where recognised sponsors are hiring for her/his expertise? |
| **Method** | I wondered if a remote MCP server could magically take care of this ask. So I wrote down the problem, the context, and the goal. I then asked agents to keep asking me questions and to keep challenging the plan until it was solid. That plan became ADRs, and then tickets. Multiple agents were harnessed to keep implementing one ticket at a time and they kept me in the loop after each. I eventually set up the Cloudflare Workers and started the crawls. Afterwards agents tested how the crawls performed, then we tightened crawl strategy and usage. I finally declared success after thorough manual testing of the MCP server. |
| **Index model** | The jobs index is a durable store of job openings from employer careers sites and public ATS boards.<br><br>It is simply the result of a crawler filling the index in the background. These MCP tools never scrape when you ask. They only read the index.<br><br>Each job opening card includes the posting link, a register join, and honesty fields. Register join is IND Work identity and match strength. It is not a promise that this vacancy will sponsor an HSM transfer. Honesty fields are salary text, Dutch-required, and sponsorship willingness. This MCP server does not compare pay to the salary criterion (yet). You or your AI agent must do that.<br><br>A title search returns a capped list, not every match in the index (yet). After a full careers pass, every current recognised sponsor has been checked at least once. Only a few hundred typically have live job openings at once. Ask `get_index_status` for scope and freshness. |

## Learn about the architecture

```mermaid
flowchart LR
    client["AI client<br/>(Claude, Cursor, Copilot, or any MCP client)"]
    hsmMcp["hsm-mcp<br/>(register lookup)"]
    careers["Employer careers / ATS<br/>(public feeds + HTML)"]

    subgraph crawl["Crawl plane (out of band)"]
        gh["GitHub Actions /<br/>operator CLI"]
    end

    subgraph cf["Cloudflare Workers + D1"]
        worker["Worker<br/>GET / · /mcp · /health · .well-known"]
        d1[("D1 jobs index<br/>Openings + terminal outcomes")]
    end

    client -- "Streamable HTTP /mcp" --> worker
    worker -- "read index" --> d1
    worker -- "hybrid register join<br/>revalidate at query time" --> hsmMcp
    gh -- "Opening refresh +<br/>full careers pass" --> d1
    gh -- "fetch feeds/HTML" --> careers
```




| Path      | What happens                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `/`       | this discovery page                                                                                   |
| `/mcp`    | Streamable HTTP MCP (`serverInfo.name`: `hsm-jobs-mcp`)                                               |
| `/health` | coarse operator health ([https://hsmjobs.musavvir.work/health](https://hsmjobs.musavvir.work/health)) |


More paths, env, and crawl ops: [docs/README-developers.md](docs/README-developers.md). Stack lock: [ADR 0009](docs/adr/0009-v1-stack-and-hosting.md).

## More info for developers

Agent instructions for this repo: [`AGENTS.md`](AGENTS.md)

Operator env contract, crawl schedule, HTTP paths, and CI: [docs/README-developers.md](docs/README-developers.md).

Unofficial project. Openings come from employer careers/ATS pages; register facts come from [IND](https://ind.nl/en/public-register-recognised-sponsors/public-register-work) via [hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp). Verify against primary sources before acting.
