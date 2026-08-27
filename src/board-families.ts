import {
  ashbyBoardFeedUrl,
  parseAshbyBoard,
  type AshbyJob,
} from "./ashby-board";

export type V1BoardFamily =
  | "ashby"
  | "greenhouse"
  | "lever"
  | "recruitee"
  | "teamtailor"
  | "personio"
  | "smartrecruiters";

/** Named v1 board families on the extraction ladder (CONTEXT.md). */
export const V1_BOARD_FAMILIES: readonly V1BoardFamily[] = [
  "ashby",
  "greenhouse",
  "lever",
  "recruitee",
  "teamtailor",
  "personio",
  "smartrecruiters",
] as const;

export type BoardJob = {
  id: string;
  title: string;
  location: string | null;
  jobUrl: string;
  descriptionPlain: string | null;
  compensationSummary: string | null;
};

export type ParsedBoardFeed = {
  jobs: BoardJob[];
};

export function isV1BoardFamily(value: string): value is V1BoardFamily {
  return (V1_BOARD_FAMILIES as readonly string[]).includes(value);
}

export function boardFeedUrl(family: V1BoardFamily, boardToken: string): string {
  const token = boardToken.trim();
  switch (family) {
    case "ashby":
      return ashbyBoardFeedUrl(token);
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
    case "lever":
      return `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
    case "recruitee":
      return `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`;
    case "teamtailor":
      return `https://${encodeURIComponent(token)}.teamtailor.com/jobs.json`;
    case "personio":
      return `https://${encodeURIComponent(token)}.jobs.personio.de/xml`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings`;
  }
}

/**
 * One host-slug token for cautious board guess: leftmost label of the accepted
 * official website host after stripping a leading www. (ADR 0003).
 */
export function hostSlugForBoardGuess(officialWebsiteHost: string): string | null {
  const host = officialWebsiteHost.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.includes("/") || host.includes(" ")) return null;
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const withoutWww = labels[0] === "www" ? labels.slice(1) : labels;
  if (withoutWww.length < 2) return null;
  const slug = withoutWww[0] ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(slug)) return null;
  return slug.toLowerCase();
}

export function parseBoardFeed(family: V1BoardFamily, body: string): ParsedBoardFeed | null {
  switch (family) {
    case "ashby":
      return mapAshby(parseAshbyBoard(body));
    case "greenhouse":
      return parseGreenhouseBoard(body);
    case "lever":
      return parseLeverBoard(body);
    case "recruitee":
      return parseRecruiteeBoard(body);
    case "teamtailor":
      return parseTeamtailorBoard(body);
    case "personio":
      return parsePersonioBoard(body);
    case "smartrecruiters":
      return parseSmartRecruitersBoard(body);
  }
}

export type FingerprintedBoard = {
  ats_family: V1BoardFamily;
  board_token: string;
};

/** First-party HTML fingerprint for known v1 board family board tokens. */
export function fingerprintBoardTokens(html: string): FingerprintedBoard[] {
  const found = new Map<string, FingerprintedBoard>();
  const add = (family: V1BoardFamily, token: string) => {
    const cleaned = token.trim().toLowerCase();
    if (!cleaned || !/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(cleaned)) return;
    const key = `${family}:${cleaned}`;
    if (!found.has(key)) found.set(key, { ats_family: family, board_token: cleaned });
  };

  for (const match of html.matchAll(/boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\/js\?for=)?([a-z0-9_-]+)/gi)) {
    if (match[1]) add("greenhouse", match[1]);
  }
  for (const match of html.matchAll(/jobs\.lever\.co\/([a-z0-9_-]+)/gi)) {
    if (match[1]) add("lever", match[1]);
  }
  for (const match of html.matchAll(/(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9_-]+)/gi)) {
    if (match[1] && match[1].toLowerCase() !== "posting-api") add("ashby", match[1]);
  }
  for (const match of html.matchAll(/([a-z0-9_-]+)\.recruitee\.com/gi)) {
    if (match[1]) add("recruitee", match[1]);
  }
  for (const match of html.matchAll(/([a-z0-9_-]+)\.teamtailor\.com/gi)) {
    if (match[1]) add("teamtailor", match[1]);
  }
  for (const match of html.matchAll(/([a-z0-9_-]+)\.jobs\.personio\.(?:de|com)/gi)) {
    if (match[1]) add("personio", match[1]);
  }
  for (const match of html.matchAll(/jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/g)) {
    if (match[1]) add("smartrecruiters", match[1]);
  }
  for (const match of html.matchAll(/api\.smartrecruiters\.com\/v1\/companies\/([a-zA-Z0-9_-]+)/g)) {
    if (match[1]) add("smartrecruiters", match[1]);
  }

  return [...found.values()];
}

function mapAshby(parsed: { jobs: AshbyJob[] } | null): ParsedBoardFeed | null {
  if (!parsed) return null;
  return {
    jobs: parsed.jobs.map((job) => ({
      id: job.id,
      title: job.title,
      location: job.location,
      jobUrl: job.jobUrl,
      descriptionPlain: job.descriptionPlain,
      compensationSummary: job.compensationSummary,
    })),
  };
}

function parseGreenhouseBoard(body: string): ParsedBoardFeed | null {
  const payload = parseJson(body);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { jobs?: unknown }).jobs)) {
    return null;
  }
  const jobs: BoardJob[] = [];
  for (const raw of (payload as { jobs: unknown[] }).jobs) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const jobUrl = typeof row.absolute_url === "string" ? row.absolute_url.trim() : "";
    if (!title || !jobUrl) continue;
    const id =
      typeof row.id === "number" || typeof row.id === "string" ? String(row.id).trim() : "";
    if (!id) continue;
    const locationName =
      row.location && typeof row.location === "object"
        ? (row.location as { name?: unknown }).name
        : null;
    const location =
      typeof locationName === "string" && locationName.trim() ? locationName.trim() : null;
    const content = typeof row.content === "string" ? row.content : null;
    jobs.push({
      id,
      title,
      location,
      jobUrl,
      descriptionPlain: htmlToPlain(decodeGreenhouseContent(content)),
      compensationSummary: null,
    });
  }
  return { jobs };
}

function parseLeverBoard(body: string): ParsedBoardFeed | null {
  const payload = parseJson(body);
  if (!Array.isArray(payload)) return null;
  const jobs: BoardJob[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.text === "string" ? row.text.trim() : "";
    const jobUrl = typeof row.hostedUrl === "string" ? row.hostedUrl.trim() : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!title || !jobUrl || !id) continue;
    const categories =
      row.categories && typeof row.categories === "object"
        ? (row.categories as Record<string, unknown>)
        : null;
    const location =
      categories && typeof categories.location === "string" && categories.location.trim()
        ? categories.location.trim()
        : null;
    const descriptionPlain =
      typeof row.descriptionPlain === "string"
        ? row.descriptionPlain
        : typeof row.description === "string"
          ? htmlToPlain(row.description)
          : null;
    jobs.push({
      id,
      title,
      location,
      jobUrl,
      descriptionPlain,
      compensationSummary: null,
    });
  }
  return { jobs };
}

function parseRecruiteeBoard(body: string): ParsedBoardFeed | null {
  const payload = parseJson(body);
  if (!payload || typeof payload !== "object") return null;
  const offers = (payload as { offers?: unknown }).offers;
  if (!Array.isArray(offers)) return null;
  const jobs: BoardJob[] = [];
  for (const raw of offers) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const jobUrl =
      (typeof row.careers_url === "string" && row.careers_url.trim()) ||
      (typeof row.url === "string" && row.url.trim()) ||
      "";
    const id =
      typeof row.id === "number" || typeof row.id === "string" ? String(row.id).trim() : "";
    if (!title || !jobUrl || !id) continue;
    const location =
      typeof row.location === "string" && row.location.trim()
        ? row.location.trim()
        : typeof row.city === "string" && row.city.trim()
          ? row.city.trim()
          : null;
    const descriptionPlain =
      typeof row.description === "string"
        ? htmlToPlain(row.description)
        : typeof row.description_body === "string"
          ? htmlToPlain(row.description_body)
          : null;
    jobs.push({
      id,
      title,
      location,
      jobUrl,
      descriptionPlain,
      compensationSummary: null,
    });
  }
  return { jobs };
}

function parseTeamtailorBoard(body: string): ParsedBoardFeed | null {
  const payload = parseJson(body);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { jobs?: unknown }).jobs)) {
    return null;
  }
  const jobs: BoardJob[] = [];
  for (const raw of (payload as { jobs: unknown[] }).jobs) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const jobUrl =
      (typeof row.url === "string" && row.url.trim()) ||
      (typeof row.apply_url === "string" && row.apply_url.trim()) ||
      "";
    const id =
      typeof row.id === "number" || typeof row.id === "string" ? String(row.id).trim() : "";
    if (!title || !jobUrl || !id) continue;
    const location =
      row.location && typeof row.location === "object"
        ? typeof (row.location as { name?: unknown }).name === "string"
          ? ((row.location as { name: string }).name.trim() || null)
          : null
        : typeof row.human_status === "string"
          ? null
          : null;
    jobs.push({
      id,
      title,
      location,
      jobUrl,
      descriptionPlain: typeof row.body === "string" ? htmlToPlain(row.body) : null,
      compensationSummary: null,
    });
  }
  return { jobs };
}

function parsePersonioBoard(body: string): ParsedBoardFeed | null {
  if (!body.includes("<position") && !body.includes("<Position")) return null;
  const jobs: BoardJob[] = [];
  const positionBlocks = body.match(/<position\b[\s\S]*?<\/position>/gi) ?? [];
  for (const block of positionBlocks) {
    const id = xmlTag(block, "id");
    const title = xmlTag(block, "name") ?? xmlTag(block, "title");
    const jobUrl = xmlTag(block, "jobDescriptionUrl") ?? xmlTag(block, "url");
    if (!id || !title) continue;
    const office = xmlTag(block, "office") ?? xmlTag(block, "city");
    const description = xmlTag(block, "jobDescription") ?? xmlTag(block, "description");
    if (!jobUrl || jobUrl.startsWith("personio:")) continue;
    jobs.push({
      id,
      title,
      location: office,
      jobUrl,
      descriptionPlain: description ? htmlToPlain(description) : null,
      compensationSummary: null,
    });
  }
  return jobs.length > 0 || body.includes("<positions") ? { jobs } : null;
}

function parseSmartRecruitersBoard(body: string): ParsedBoardFeed | null {
  const payload = parseJson(body);
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const jobs: BoardJob[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.name === "string" ? row.name.trim() : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const ref = typeof row.ref === "string" ? row.ref.trim() : "";
    const jobUrl = ref || (typeof row.applyUrl === "string" ? row.applyUrl.trim() : "");
    if (!title || !id || !jobUrl) continue;
    const location =
      row.location && typeof row.location === "object"
        ? typeof (row.location as { city?: unknown }).city === "string"
          ? ((row.location as { city: string }).city.trim() || null)
          : null
        : null;
    jobs.push({
      id,
      title,
      location,
      jobUrl,
      descriptionPlain: null,
      compensationSummary: null,
    });
  }
  return { jobs };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function xmlTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match?.[1]) return null;
  const raw = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  return raw ? raw : null;
}

function decodeGreenhouseContent(content: string | null): string | null {
  if (!content) return null;
  return decodeHtmlEntities(decodeHtmlEntities(content));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&euro;/g, "€")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

export function htmlToPlain(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || null;
}
