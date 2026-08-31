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

**Option A — clone (recommended)**

This repo is **private**. Sign in to GitHub on the new machine before you clone.

```bash
gh auth login
git clone https://github.com/musavvirahmed/hsm-jobs-mcp.git
cd hsm-jobs-mcp
```

If you do not use `gh`, use HTTPS clone and enter a GitHub username plus a [personal access token](https://github.com/settings/tokens) when Git asks for a password.

**Option B — download without git**

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

**Two terminals:** Steps 3 and 4 need the server running in one terminal while you run commands in another. Step 2 below uses your first terminal. Step 3 opens a second one.

### Step 2 — Download job listings

In the **same terminal** as step 1:

```bash
npm run crawl
```

Wait until it finishes. You should see JSON output at the end. When it is done, this terminal is free for step 4.

### Step 3 — Start the local server

`npm run dev` keeps running until you stop it. It will block the terminal.

Open a **new** terminal window or tab in the same project folder. Run:

```bash
npm run dev
```

Leave this terminal open. The server uses **http://127.0.0.1:8787** by default.

### Step 4 — Check that it works

In a terminal that is **not** running `npm run dev` — the one you used for steps 1 and 2 is fine. If you only have one terminal, open a new one now.

```bash
npm run private-release:verify
```

If you see `ready at http://127.0.0.1:8787/mcp`, you are good.

If it fails:

1. Make sure step 2 finished without errors.
2. Make sure step 3 is still running in the other terminal.
3. Run step 4 again in a terminal that is not running the server.

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

In **Cursor Settings → MCP**, both servers should show green and list their tools (`hsm-jobs`: 3 tools, `ind-sponsors`: 2 tools). That means Cursor can reach the servers. It does **not** mean chat will use them yet — see step 6.

**Claude Code**

```bash
claude mcp add --transport http hsm-jobs http://127.0.0.1:8787/mcp
claude mcp add --transport http ind-sponsors https://hsm.codealan.com/mcp
```

**Important:** Use `http://127.0.0.1:8787/mcp` on your machine. Do **not** use `https://hsmjobs.musavvir.work/mcp` for local testing. The public URL blocks access until indexing is complete.

### Step 6 — Open this project in Cursor

Connecting MCP in Settings is not enough. You must **open this clone as your Cursor workspace**.

1. In Cursor: **File → Open Folder…**
2. Choose the `hsm-jobs-mcp` folder (the one that contains this README).
3. Start a **new chat** in that window.

If you chat from a different folder, Cursor may search local files or the web instead of calling `hsm-jobs`. You will get wrong answers even when MCP shows connected.

### Step 7 — Ask your first question

In the chat for **this** folder, try:

> How fresh is the jobs index?

**You know MCP worked when:**

- The reply mentions **last successful crawl**, **jobs count**, or **index scope** from live data — not a guess from random websites.
- The terminal running `npm run dev` prints **`POST /mcp 200`** (or `202`) at the same time as the answer.
- In Cursor, the reply shows it used an MCP **tool** (for example `get_index_status`).

**If the agent searches your repo or talks about unrelated APIs**, you are in the wrong folder or the wrong chat. Open the `hsm-jobs-mcp` folder and start a new chat. You can also ask explicitly: *Use the hsm-jobs MCP tool `get_index_status`.*

Then try a job search:

> Which recognised sponsors are hiring product designers?

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

After step 7, ask in plain language in a chat for **this** folder:

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

The public site still returns an error until indexing finishes. Do not use the public URL yet. Stay on localhost from the steps above.

When the public site is ready, use these URLs instead of localhost:

```bash
claude mcp add --transport http hsm-jobs https://hsmjobs.musavvir.work/mcp
claude mcp add --transport http ind-sponsors https://hsm.codealan.com/mcp
```

No login required in v1.

## For developers

Operator shared-release runbook (stop/resume, remote D1, verify), env contract, architecture, and CI notes: [docs/README-developers.md](docs/README-developers.md).

Stack and hosting decisions: [ADR 0009](docs/adr/0009-v1-stack-and-hosting.md).

Unofficial project. Job listings © respective employers. Register data © IND via hsm-mcp.
