import { serverIcons } from "./favicon";
import { SERVER_NAME } from "./packaging";

// Keep in sync with package.json version (bundled at build time).
import pkg from "../package.json";

export const SERVER_CARD_DESCRIPTION =
  "MCP server for Openings on recognised-sponsor (IND Work) companies' careers and ATS pages — layer 2 only.";

export const SERVER_CARD_PATHS = [
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
] as const;

export type ServerCard = {
  name: string;
  description: string;
  version: string;
  icons: Array<{
    src: string;
    mimeType: string;
    sizes: string[];
  }>;
  remotes: Array<{
    type: "streamable-http";
    url: string;
  }>;
};

export function buildServerCard(origin: string): ServerCard {
  return {
    name: SERVER_NAME,
    description: SERVER_CARD_DESCRIPTION,
    version: pkg.version,
    icons: serverIcons(origin),
    remotes: [
      {
        type: "streamable-http",
        url: `${origin}/mcp`,
      },
    ],
  };
}

export function serverCardResponse(origin: string): Response {
  return new Response(JSON.stringify(buildServerCard(origin), null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
