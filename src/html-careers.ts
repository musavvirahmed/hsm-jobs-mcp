import { htmlToPlain } from "./board-families";
import { isJobLikePath } from "./robots";

const AGGREGATOR_HOST_RE =
  /(^|\.)(linkedin\.com|indeed\.com|indeed\.nl|glassdoor\.com|monster\.com|ziprecruiter\.com|nationalevacaturebank\.nl|jobbird\.com|jooble\.org|simplyhired\.com|talent\.com|indsponsors\.nl)$/i;

export type HtmlCareerOpening = {
  primary_url: string;
  title: string;
  location: string | null;
  jd_extract: string | null;
};

const CAREERS_PATHS = ["/jobs", "/careers", "/vacatures", "/werken-bij", "/join-us", "/work-with-us"];

export function careersListingUrls(officialHost: string): string[] {
  const host = officialHost.replace(/^www\./i, "");
  return CAREERS_PATHS.map((path) => `https://${host}${path}`);
}

/** Thin client-rendered shell with no extractable job cards — browser last-resort territory. */
export function looksLikeJsShell(html: string): boolean {
  const text = htmlToPlain(html)?.replace(/\s+/g, " ").trim() ?? "";
  const hasRoot = /id=["'](root|app|__next)["']/i.test(html);
  const hasScript = /<script\b/i.test(html);
  return hasScript && hasRoot && text.length < 80;
}

export function extractJobLinksFromCareersHtml(
  listingUrl: string,
  html: string,
  officialHost: string,
): string[] {
  const base = new URL(listingUrl);
  const official = officialHost.toLowerCase().replace(/^www\./, "");
  const seen = new Set<string>();
  const out: string[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("mailto:")) continue;
    let absolute: URL;
    try {
      absolute = new URL(href, base);
    } catch {
      continue;
    }
    if (absolute.protocol !== "https:" && absolute.protocol !== "http:") continue;
    const host = absolute.hostname.toLowerCase().replace(/^www\./, "");
    if (AGGREGATOR_HOST_RE.test(host) || host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      continue;
    }
    if (!hostBelongsToOfficial(host, official)) continue;
    if (!isJobLikePath(absolute.pathname)) continue;
    if (isCareersIndexPath(absolute.pathname)) continue;
    const canonical = `${absolute.origin}${absolute.pathname.replace(/\/$/, "")}${absolute.search}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

export function openingFromJobPage(
  pageUrl: string,
  html: string,
): HtmlCareerOpening | null {
  const title =
    firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ??
    firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) return null;
  const cleanedTitle = htmlToPlain(title)?.split("\n")[0]?.trim() ?? "";
  if (!cleanedTitle || cleanedTitle.length > 200) return null;
  const bodyText = htmlToPlain(html);
  return {
    primary_url: pageUrl.replace(/\/$/, ""),
    title: cleanedTitle,
    location: null,
    jd_extract: bodyText,
  };
}

function isCareersIndexPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  return CAREERS_PATHS.includes(path.toLowerCase());
}

function hostBelongsToOfficial(host: string, officialHost: string): boolean {
  const official = officialHost.toLowerCase().replace(/^www\./, "");
  return host === official || host.endsWith(`.${official}`) || official.endsWith(`.${host}`);
}

function firstMatch(html: string, re: RegExp): string | null {
  const match = html.match(re);
  return match?.[1] ?? null;
}
