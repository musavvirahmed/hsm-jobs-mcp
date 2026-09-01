import {
  CLIENT_KEY,
  EXAMPLE_JOB_ASKS,
  HSM_MCP_CLIENT_KEY,
  HSM_MCP_ORIGIN,
  IND_HSM_PERMIT_URL,
  IND_PUBLIC_REGISTER_WORK_URL,
  PUBLIC_PATHS,
  READING_THE_ANSWERS_GIST,
  REGISTER_ONLY_ASK,
  SERVER_NAME,
  V1_JOBS_TOOLS,
} from "./packaging";

const DISCOVERY_STYLES = `
  :root {
    --bg: #000000;
    --fg: #e6e6e6;
    --muted: #6c6c6c;
    --cyan: #00d7d7;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font: 13px/1.6 var(--mono);
    padding: 2rem 1.25rem 3rem;
  }
  .page {
    max-width: 46rem;
    margin: 0 auto;
  }
  .tui-header {
    border: 4px double var(--cyan);
    text-align: center;
    padding: 8px 16px;
    margin-bottom: 16px;
  }
  .tui-header h1 {
    font-size: 1.35rem;
    font-weight: 400;
    margin: 0;
    color: var(--cyan);
  }
  .tui-header .lede {
    margin: 8px 0 0;
    text-align: left;
    color: var(--fg);
    font-size: 13px;
  }
  .tui-box {
    border: 1px solid var(--cyan);
    position: relative;
    padding: 16px 12px 10px;
    margin-bottom: 12px;
  }
  .tui-box::before {
    content: attr(data-title);
    position: absolute;
    top: 0;
    left: 10px;
    transform: translateY(-50%);
    background: var(--bg);
    color: var(--cyan);
    padding: 0 6px;
  }
  .tui-box--muted {
    border-color: var(--muted);
    color: var(--muted);
  }
  .tui-box--muted::before {
    color: var(--muted);
  }
  .tui-box--muted a { color: var(--muted); }
  .tui-box--muted code, .tui-box--muted pre {
    background: rgba(127, 127, 127, 0.1);
  }
  p { margin: 0 0 0.75rem; }
  ul { margin: 0; padding-left: 1.2rem; }
  li { margin-bottom: 0.35rem; }
  a { color: var(--cyan); }
  code, pre {
    font-family: var(--mono);
    background: rgba(127, 127, 127, 0.14);
    border-radius: 4px;
  }
  code { padding: 0.1em 0.35em; }
  pre {
    padding: 0.8em 1em;
    overflow-x: auto;
    margin: 0 0 0.75rem;
  }
  pre code { background: none; padding: 0; }
  .muted { color: var(--muted); font-size: 0.92em; }
  .tui-footer {
    color: var(--muted);
    margin-top: 1rem;
    font-size: 0.92em;
  }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function listItems(items: readonly string[]): string {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
}

function toolList(): string {
  return V1_JOBS_TOOLS.map(
    (tool) =>
      `<li><code>${escapeHtml(tool.name)}</code> - ${escapeHtml(tool.description)}</li>`,
  ).join("\n");
}

function tuiBox(title: string, inner: string, muted = false): string {
  const klass = muted ? "tui-box tui-box--muted" : "tui-box";
  return `<section class="${klass}" data-title="${escapeHtml(title)}">${inner}</section>`;
}

export function renderDiscoveryPage(origin: string): string {
  const mcpUrl = `${origin}/mcp`;
  const healthUrl = `${origin}/health`;
  const hsmMcpUrl = `${HSM_MCP_ORIGIN}/mcp`;

  const lede = `
    If you are a non-EU person looking for a job in the Netherlands, you must prove yourself as a
    <a href="${escapeHtml(IND_HSM_PERMIT_URL)}">Highly skilled migrant</a>,
    and on top of that, only a finite number of companies can sponsor you.
    What if you could simply ask your AI (model of choice) which
    <a href="${escapeHtml(IND_PUBLIC_REGISTER_WORK_URL)}">Dutch recognised sponsors</a>
    are hiring? This MCP server will do exactly that. It will find you
    <strong>Openings</strong> by those recognised sponsors, and present them to you in an easy-to-read way.
    Goes without saying, this is not a job portal.`;

  const connectInner = `
    <p>Attach <strong>both</strong> servers: <code>${escapeHtml(CLIENT_KEY)}</code> here and
      <code>${escapeHtml(HSM_MCP_CLIENT_KEY)}</code> on hsm-mcp.</p>
    <p class="muted">Register-only (e.g. <em>${escapeHtml(REGISTER_ONLY_ASK)}</em>)</p>
    <p><strong>Any MCP client</strong> (Cursor, etc.)</p>
    <pre><code>{
  "mcpServers": {
    "${escapeHtml(CLIENT_KEY)}": { "url": "${escapeHtml(mcpUrl)}" },
    "${escapeHtml(HSM_MCP_CLIENT_KEY)}": { "url": "${escapeHtml(hsmMcpUrl)}" }
  }
}</code></pre>
    <p><strong>Claude Code</strong></p>
    <pre><code>claude mcp add --transport http ${escapeHtml(CLIENT_KEY)} ${escapeHtml(mcpUrl)}
claude mcp add --transport http ${escapeHtml(HSM_MCP_CLIENT_KEY)} ${escapeHtml(hsmMcpUrl)}</code></pre>
    <p class="muted"><strong>claude.ai / Claude Desktop</strong>: Settings → Connectors → Add custom connector →
      <code>${escapeHtml(mcpUrl)}</code> (and add hsm-mcp separately).</p>
    <p class="muted">No auth in v1. Rate limits follow the live deploy when present; additional limiting may be added later.</p>`;

  const pathsInner = `
    <ul>
      <li><code>${escapeHtml(PUBLIC_PATHS[0])}</code> - this discovery page</li>
      <li><code>${escapeHtml(PUBLIC_PATHS[1])}</code> - Streamable HTTP MCP (<code>serverInfo.name</code>: <code>${escapeHtml(SERVER_NAME)}</code>)</li>
      <li><code>${escapeHtml(PUBLIC_PATHS[2])}</code> - coarse operator health (<a href="${escapeHtml(healthUrl)}">${escapeHtml(healthUrl)}</a>)</li>
    </ul>`;

  const freshnessInner = `
    <p>
      Coarse deploy health: <a href="${escapeHtml(healthUrl)}"><code>/health</code></a>.
      Rich index scope, crawl timestamps, and register-join upstream status: ask via
      <code>get_index_status</code> in your MCP client.
    </p>`;

  const footerInner = `
    <p>
      Unofficial project. Openings come from employer careers/ATS pages; register facts come from
      <a href="https://ind.nl/en/public-register-recognised-sponsors/public-register-work">IND</a>
      via hsm-mcp. Verify against primary sources before acting.
    </p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(SERVER_NAME)}</title>
  <style>${DISCOVERY_STYLES}</style>
</head>
<body>
  <div class="page">
    <header class="tui-header">
      <h1>${escapeHtml(SERVER_NAME)}</h1>
      <p class="lede">${lede}</p>
    </header>
    ${tuiBox("Then just ask", `<ul>${listItems(EXAMPLE_JOB_ASKS)}</ul>`)}
    ${tuiBox("Connect", connectInner)}
    ${tuiBox("What the answers mean", `<ul>${listItems(READING_THE_ANSWERS_GIST)}</ul>`)}
    ${tuiBox("How fresh is this?", freshnessInner)}
    ${tuiBox("Tools", `<ul>${toolList()}</ul>`, true)}
    ${tuiBox("Public paths", pathsInner, true)}
    <div class="tui-footer">${footerInner}</div>
  </div>
</body>
</html>`;
}

export function discoveryPageResponse(origin: string): Response {
  return new Response(renderDiscoveryPage(origin), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
