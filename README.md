# hsm-jobs-mcp

Ask your AI: *Which recognised sponsors in the Netherlands are hiring for a role I want?*

This tool searches **real job listings** on company careers pages. It does **not** search LinkedIn or big job boards.

For register questions only — *Is Adyen a recognised sponsor?* — use **[hsm-mcp](https://github.com/CodeAlanDebug/hsm-mcp)** instead. You need **both** tools for a full picture.

Live site: **[https://hsmjobs.musavvir.work](https://hsmjobs.musavvir.work)**

Agent instructions for this repo: [`AGENTS.md`](AGENTS.md)

---

## Try it on your computer (start here)

The public website is not ready for full personal use yet. It returns an error until more companies are indexed.

**Run the tool on your own machine instead.** Follow these steps in order.

### Get the code

You need a copy of this project on your computer.

**Option A — clone (most people)**

```bash
git clone https://github.com/musavvirahmed/hsm-jobs-mcp.git
cd hsm-jobs-mcp
```

**Option B — fork first**

1. Open [github.com/musavvirahmed/hsm-jobs-mcp](https://github.com/musavvirahmed/hsm-jobs-mcp) and click **Fork**.
2. Clone **your** fork:

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/hsm-jobs-mcp.git
cd hsm-jobs-mcp
```

Replace `YOUR-GITHUB-USERNAME` with your GitHub username.

**Option C — download without git**

1. Open [github.com/musavvirahmed/hsm-jobs-mcp](https://github.com/musavvirahmed/hsm-jobs-mcp).
2. Click **Code** → **Download ZIP**.
3. Unzip the file and open a terminal in the unzipped folder.

### Check Node.js

This project needs Node.js and npm.

```bash
node --version
npm --version
```

You need **Node.js 20 or newer**. The project tests on Node 24.

- If both commands print a version number, you are ready.
- If you see `command not found`, install Node.js from [nodejs.org](https://nodejs.org/) (choose the LTS installer), then run the commands again.

### Check your AI tool (MCP client)

You need an app that can connect to MCP servers over HTTP. Pick one you already use:

| Tool | How to check |
| ---- | ------------ |
| **Cursor** | You are already in an MCP-capable editor. Open **Settings → MCP** (or **Cursor Settings → MCP**). |
| **Claude Code** | Run `claude --version` in a terminal. If missing, install from [Anthropic's Claude Code docs](https://docs.anthropic.com/en/docs/claude-code). |
| **Claude Desktop** | Open the app. Go to **Settings → Connectors** (or **Developer → Edit Config**). |

If you do not have any of these, install Cursor or Claude Code before you continue.

### Step 1 — Install dependencies

Open a terminal in the project folder (the folder that contains this README).

```bash
npm ci
```

This downloads the packages the project needs. It may take a minute.

### Step 2 — Download job listings

This fetches live jobs and saves them on your computer.

```bash
npm run crawl
```

Wait until it finishes. You should see JSON output at the end.

### Step 3 — Start the local server

Open a **second** terminal in the same project folder.

```bash
npm run dev
```

Leave this running. The server uses **http://127.0.0.1:8787** by default.

### Step 4 — Check that it works

Go back to the **first** terminal.

```bash
npm run private-release:verify
```

If you see `ready at http://127.0.0.1:8787/mcp`, you are good.

If it fails:

1. Make sure step 2 finished without errors.
2. Make sure step 3 is still running (`npm run dev` in the other terminal).
3. Run step 4 again.

### Step 5 — Connect your AI tool

Add **two** servers — jobs **and** register lookup:

**Cursor / any MCP client**

```json
{
  "mcpServers": {
    "hsm-jobs": { "url": "http://127.0.0.1:8787/mcp" },
    "ind-sponsors": { "url": "https://hsm.codealan.com/mcp" }
  }
}
```

**Claude Code**

```bash
claude mcp add --transport http hsm-jobs http://127.0.0.1:8787/mcp
claude mcp add --transport http ind-sponsors https://hsm.codealan.com/mcp
```

**Important:** Use `http://127.0.0.1:8787/mcp` on your machine. Do **not** use `https://hsmjobs.musavvir.work/mcp` for local testing. The public URL blocks access until indexing is complete.

### Optional settings

Copy [`.env.example`](.env.example) to `.env` if you want to change defaults. Most people do not need this for a first try.

| Setting | Default | When to change it |
| ------- | ------- | ----------------- |
| `JOBS_INDEX_TARGET` | `local-d1` | Rarely — keeps job data on your machine |
| `PRIVATE_RELEASE_ORIGIN` | `http://127.0.0.1:8787` | If `npm run dev` uses a different port |

---

## What it does

- Finds **Openings** — live jobs on employer careers and ATS pages.
- Shows **register join** on each job: company name, KvK number, and how strong the match is. This is **not** a promise that the job will sponsor your visa.
- Shows **honesty fields**: salary info, Dutch language requirement, sponsorship willingness. **Unknown** is a normal answer.
- Shows **index scope** on every answer. If the index is incomplete, empty search results do **not** mean no jobs exist anywhere.

Register-only questions belong on **hsm-mcp**, not here.

## What you can ask

- *"Which recognised sponsors are hiring product designers?"*
- *"Which recognised sponsors are hiring software engineers in Amsterdam?"*
- *"What jobs do you have for KvK 60733144?"*
- *"How fresh is the jobs index?"*
- *"Is Adyen a recognised sponsor?"* → ask **hsm-mcp**, not this tool

## The three tools

| Tool | What it does |
| ---- | ------------ |
| `search_jobs` | Search jobs by title or company (KvK number). Optional location. Returns up to 20 results. |
| `get_job` | Get full details for one job URL. |
| `get_index_status` | Check how fresh the job index is and how complete coverage is. |

## How to read the answers

- **Honesty fields are separate signals.** Salary, Dutch requirement, and sponsorship willingness are independent. Unknown is common and valid.
- **Register join is a match score, not a yes/no.** A company on the sponsor register does not mean this specific job will sponsor you.
- **This tool does not check the IND salary minimum.** You or your agent must do that.
- **Empty results may not mean "no jobs".** On a partial index, the tool may not have searched every company yet.
- **Register data can be stale.** If hsm-mcp is slow or down, job cards may show older register info. The tool tells you instead of guessing.

Check employer careers pages and the [official IND register](https://ind.nl/en/public-register-recognised-sponsors/public-register-work) before you act on anything important.

## Connect to the public site (later)

When the public site is fully ready, use these URLs instead of localhost:

```bash
claude mcp add --transport http hsm-jobs https://hsmjobs.musavvir.work/mcp
claude mcp add --transport http ind-sponsors https://hsm.codealan.com/mcp
```

No login required in v1.

## For developers

Operator env contract, architecture diagram, HTTP paths, and CI notes: [docs/README-developers.md](docs/README-developers.md).

Stack and hosting decisions: [ADR 0009](docs/adr/0009-v1-stack-and-hosting.md).

Unofficial project. Job listings © respective employers. Register data © IND via hsm-mcp.
