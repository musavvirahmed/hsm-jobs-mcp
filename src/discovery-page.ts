import {
  CLIENT_KEY,
  EXAMPLE_ASKS,
  HSM_MCP_CLIENT_KEY,
  HSM_MCP_ORIGIN,
  PUBLIC_PATHS,
  READING_THE_ANSWERS_GIST,
  SERVER_NAME,
  V1_JOBS_TOOLS,
} from "./packaging";

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
      `<li><code>${escapeHtml(tool.name)}</code> — ${escapeHtml(tool.description)}</li>`,
  ).join("\n");
}

export function renderDiscoveryPage(origin: string): string {
  const mcpUrl = `${origin}/mcp`;
  const healthUrl = `${origin}/health`;
  const hsmMcpUrl = `${HSM_MCP_ORIGIN}/mcp`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(SERVER_NAME)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(SERVER_NAME)}</h1>
    <p>
      MCP server for <strong>Openings</strong> on recognised-sponsor (IND Work) companies’
      careers and ATS pages — layer 2 only. Not a public job portal. Pair with
      <a href="${escapeHtml(HSM_MCP_ORIGIN)}">hsm-mcp</a> for register-only questions.
    </p>

    <h2>Connect (Streamable HTTP)</h2>
    <p>Attach <strong>both</strong> servers: <code>${escapeHtml(CLIENT_KEY)}</code> here and
      <code>${escapeHtml(HSM_MCP_CLIENT_KEY)}</code> on hsm-mcp.</p>

    <p><strong>Claude Code</strong></p>
    <pre><code>claude mcp add --transport http ${escapeHtml(CLIENT_KEY)} ${escapeHtml(mcpUrl)}
claude mcp add --transport http ${escapeHtml(HSM_MCP_CLIENT_KEY)} ${escapeHtml(hsmMcpUrl)}</code></pre>

    <p><strong>claude.ai / Claude Desktop</strong> — Settings → Connectors → Add custom connector →
      <code>${escapeHtml(mcpUrl)}</code> (and add hsm-mcp separately).</p>

    <p><strong>Any MCP client</strong> (Cursor, etc.)</p>
    <pre><code>{
  "mcpServers": {
    "${escapeHtml(CLIENT_KEY)}": { "url": "${escapeHtml(mcpUrl)}" },
    "${escapeHtml(HSM_MCP_CLIENT_KEY)}": { "url": "${escapeHtml(hsmMcpUrl)}" }
  }
}</code></pre>

    <p>No auth in v1. Rate limits follow the live deploy when present; additional limiting may be added later.</p>

    <h2>Public paths</h2>
    <ul>
      <li><code>${escapeHtml(PUBLIC_PATHS[0])}</code> — this discovery page</li>
      <li><code>${escapeHtml(PUBLIC_PATHS[1])}</code> — Streamable HTTP MCP (<code>serverInfo.name</code>: <code>${escapeHtml(SERVER_NAME)}</code>)</li>
      <li><code>${escapeHtml(PUBLIC_PATHS[2])}</code> — coarse operator health (<a href="${escapeHtml(healthUrl)}">${escapeHtml(healthUrl)}</a>)</li>
    </ul>

    <h2>Tools</h2>
    <ul>
      ${toolList()}
    </ul>

    <h2>Then just ask</h2>
    <ul>
      ${listItems(EXAMPLE_ASKS)}
    </ul>

    <h2>Reading the answers</h2>
    <ul>
      ${listItems(READING_THE_ANSWERS_GIST)}
    </ul>

    <h2>Freshness</h2>
    <p>
      Coarse deploy health: <a href="${escapeHtml(healthUrl)}"><code>/health</code></a>.
      Rich index scope, crawl timestamps, and register-join upstream status: ask via
      <code>get_index_status</code> in your MCP client.
    </p>

    <p>
      Unofficial project. Openings come from employer careers/ATS pages; register facts come from
      <a href="https://ind.nl/en/public-register-recognised-sponsors/public-register-work">IND</a>
      via hsm-mcp. Verify against primary sources before acting.
    </p>
  </main>
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
