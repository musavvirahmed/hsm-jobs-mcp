import { FAVICON_WEBP_BASE64 } from "./favicon-bytes";

/** Same path as idea-2 dashboard — origin favicon for browsers and MCP clients. */
export const FAVICON_PATH = "/assets/favicon.webp" as const;
export const FAVICON_MIME = "image/webp" as const;
export const FAVICON_SIZES = ["96x96"] as const;

const FAVICON_ROUTES = new Set<string>([FAVICON_PATH, "/favicon.ico"]);

export function isFaviconPath(pathname: string): boolean {
  return FAVICON_ROUTES.has(pathname);
}

function faviconBytes(): Uint8Array {
  const binary = atob(FAVICON_WEBP_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function faviconResponse(): Response {
  return new Response(faviconBytes(), {
    status: 200,
    headers: {
      "content-type": FAVICON_MIME,
      "cache-control": "public, max-age=86400",
    },
  });
}

/** SEP-973 icons for `serverInfo` — Cursor MCP settings can show this asset. */
export function serverIcons(origin: string) {
  return [
    {
      src: `${origin}${FAVICON_PATH}`,
      mimeType: FAVICON_MIME,
      sizes: [...FAVICON_SIZES],
    },
  ];
}
