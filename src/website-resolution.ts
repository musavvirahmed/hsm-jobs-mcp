import { DEFAULT_CRAWL_FETCH_TIMEOUT_MS, fetchWithTimeout } from "./fetch-timeout";
import { PRODUCT_USER_AGENT } from "./robots";

export type PageGetResult = {
  status: number;
  finalUrl: string;
  tlsValid: boolean;
  bodyText: string;
};

export type WebsiteResolutionProviders = {
  wikidata: { websiteForKvk(kvk: string): Promise<string | null> };
  getPage: (url: string) => Promise<PageGetResult | null>;
  search?: { candidateUrls(name: string, kvk: string): Promise<string[]> };
};

export type ResolvedVia =
  | "override_pin"
  | "override_force_unresolved"
  | "wikidata"
  | "domain_guess"
  | "search"
  | "unresolved";

export type OfficialWebsiteResolution =
  | { official_website_host: string; resolved_via: Exclude<ResolvedVia, "unresolved" | "override_force_unresolved"> }
  | { official_website_host: null; resolved_via: "unresolved" | "override_force_unresolved" };

const ABOUT_PATHS = ["/about", "/over-ons", "/over", "/legal", "/impressum"];

const REJECTED_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "indeed.com",
  "indeed.nl",
  "glassdoor.com",
  "monster.com",
  "ziprecruiter.com",
  "nationalevacaturebank.nl",
  "jobbird.com",
  "jooble.org",
  "simplyhired.com",
  "talent.com",
  "indsponsors.nl",
  "ashbyhq.com",
  "greenhouse.io",
  "lever.co",
  "recruitee.com",
  "teamtailor.com",
  "personio.com",
  "personio.de",
  "smartrecruiters.com",
  "workable.com",
  "myworkdayjobs.com",
  "icims.com",
];

const PARK_RE =
  /domain is parked|this domain is parked|buy this domain|domain for sale|sedo domain|parkingcrew|this domain may be for sale|godaddy parking/i;

const LEGAL_SUFFIXES = [
  /\s+co[oö]peratief\s+u\.?a\.?$/i,
  /\s+b\.?\s*v\.?\s*b\.?\s*a\.?$/i,
  /\s+b\.?\s*v\.?$/i,
  /\s+n\.?\s*v\.?$/i,
  /\s+gmbh$/i,
  /\s+llp$/i,
  /\s+ltd\.?$/i,
  /\s+limited$/i,
  /\s+inc\.?$/i,
  /\s+plc$/i,
  /\s+s\.?e\.?$/i,
  /\s+bvba$/i,
  /\s+ag$/i,
];

const NAME_STOPWORDS = new Set([
  "bv",
  "nv",
  "ltd",
  "gmbh",
  "llp",
  "se",
  "inc",
  "ua",
  "the",
  "and",
  "en",
  "van",
  "de",
  "het",
  "of",
  "holding",
  "nederland",
  "netherlands",
  "international",
  "group",
  "co",
  "company",
  "plc",
  "limited",
]);

export async function resolveOfficialWebsite(
  sponsor: { kvk: string; name: string },
  providers: WebsiteResolutionProviders,
  override: { mode: "pin"; host: string } | { mode: "force_unresolved" } | null,
): Promise<OfficialWebsiteResolution> {
  if (override?.mode === "force_unresolved") {
    return { official_website_host: null, resolved_via: "override_force_unresolved" };
  }
  if (override?.mode === "pin") {
    const host = normalizeHost(override.host);
    if (host) {
      return { official_website_host: host, resolved_via: "override_pin" };
    }
  }

  const wiki = await providers.wikidata.websiteForKvk(sponsor.kvk);
  if (wiki) {
    const host = await acceptCandidate(wiki, sponsor, providers.getPage);
    if (host) {
      return { official_website_host: host, resolved_via: "wikidata" };
    }
  }

  for (const url of domainGuessUrls(sponsor.name)) {
    const host = await acceptCandidate(url, sponsor, providers.getPage);
    if (host) {
      return { official_website_host: host, resolved_via: "domain_guess" };
    }
  }

  if (providers.search) {
    const candidates = await providers.search.candidateUrls(sponsor.name, sponsor.kvk);
    for (const url of candidates) {
      const host = await acceptCandidate(url, sponsor, providers.getPage);
      if (host) {
        return { official_website_host: host, resolved_via: "search" };
      }
    }
  }

  return { official_website_host: null, resolved_via: "unresolved" };
}

async function acceptCandidate(
  rawUrl: string,
  sponsor: { kvk: string; name: string },
  getPage: WebsiteResolutionProviders["getPage"],
): Promise<string | null> {
  const httpsUrl = toHttpsUrl(rawUrl);
  if (!httpsUrl) return null;
  const candidateHost = hostnameOf(httpsUrl);
  if (!candidateHost || isRejectedHost(candidateHost)) return null;
  const page = await getPage(httpsUrl);
  const host = hostIfValidPage(page, sponsor.name);
  if (host) return host;
  if (!page?.tlsValid || !page.finalUrl) return null;
  const origin = originOf(page.finalUrl);
  if (!origin) return null;
  for (const path of ABOUT_PATHS) {
    const extra = await getPage(`${origin}${path}`);
    const extraHost = hostIfValidPage(extra, sponsor.name);
    if (extraHost && extraHost === hostnameOf(page.finalUrl)) {
      return extraHost;
    }
  }
  return null;
}

function hostIfValidPage(
  page: PageGetResult | null,
  registeredName: string,
): string | null {
  if (!page || !page.tlsValid) return null;
  if (page.status < 200 || page.status >= 400) return null;
  const host = hostnameOf(page.finalUrl);
  if (!host || isRejectedHost(host)) return null;
  if (isParkPage(page.bodyText)) return null;
  if (!hasNameTokens(page.bodyText, registeredName)) return null;
  return host;
}

function domainGuessUrls(name: string): string[] {
  const stripped = stripLegalSuffixes(name);
  const urls: string[] = [];
  const embedded = embeddedHost(stripped);
  if (embedded) {
    urls.push(`https://${embedded}/`);
  }
  const slug = slugify(stripped);
  if (slug.length >= 2) {
    urls.push(`https://${slug}.nl/`, `https://${slug}.com/`);
  }
  return [...new Set(urls)];
}

function stripLegalSuffixes(name: string): string {
  let remaining = name.trim();
  for (let i = 0; i < 4; i += 1) {
    const next = LEGAL_SUFFIXES.reduce((acc, re) => acc.replace(re, ""), remaining).trim();
    if (next === remaining) break;
    remaining = next;
  }
  return remaining;
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function embeddedHost(name: string): string | null {
  const match = name.toLowerCase().match(/\b([a-z0-9-]+(?:\.[a-z]{2,})+)\b/);
  return match?.[1] ?? null;
}

function hasNameTokens(body: string, registeredName: string): boolean {
  const haystack = body.toLowerCase();
  const tokens = nameTokens(registeredName);
  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

function nameTokens(name: string): string[] {
  const parts = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const distinctive = parts.filter((part) => part.length >= 3 && !NAME_STOPWORDS.has(part));
  return distinctive.length > 0 ? distinctive : parts.filter((part) => part.length >= 2);
}

function isRejectedHost(host: string): boolean {
  const lowered = host.toLowerCase();
  return REJECTED_HOSTS.some((banned) => lowered === banned || lowered.endsWith(`.${banned}`));
}

function isParkPage(body: string): boolean {
  return PARK_RE.test(body);
}

function toHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return null;
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normalizeHost(value: string): string | null {
  if (value.includes("://") || value.includes("/")) {
    return hostnameOf(toHttpsUrl(value) ?? "");
  }
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  return host.length > 0 ? host : null;
}

export type TimedFetchOptions = {
  timeoutMs?: number;
};

export function createWikidataSparqlLookup(
  fetchImpl: typeof fetch,
  options: TimedFetchOptions = {},
): WebsiteResolutionProviders["wikidata"] {
  return {
    async websiteForKvk(kvk) {
      const padded = kvk.replace(/\D/g, "").padStart(8, "0");
      const ids = [...new Set([padded, padded.replace(/^0+/, "") || padded])];
      for (const id of ids) {
        const website = await sparqlOfficialWebsite(id, fetchImpl, options.timeoutMs);
        if (website) return website;
      }
      return null;
    },
  };
}

async function sparqlOfficialWebsite(
  kvkId: string,
  fetchImpl: typeof fetch,
  timeoutMs = DEFAULT_CRAWL_FETCH_TIMEOUT_MS,
): Promise<string | null> {
  const query = `SELECT ?website WHERE { ?item wdt:P3220 "${kvkId}" . ?item wdt:P856 ?website . } LIMIT 1`;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "hsm-jobs-mcp/0.1 (website-resolution; P3220 lookup)",
        },
      },
      { timeoutMs },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: { bindings?: Array<{ website?: { value?: string } }> };
    };
    return payload.results?.bindings?.[0]?.website?.value ?? null;
  } catch {
    return null;
  }
}

export function createHttpsPageGetter(
  fetchImpl: typeof fetch,
  options: TimedFetchOptions = {},
): WebsiteResolutionProviders["getPage"] {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CRAWL_FETCH_TIMEOUT_MS;
  return async (url) => {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          redirect: "follow",
          headers: {
            "User-Agent": PRODUCT_USER_AGENT,
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          },
        },
        { timeoutMs },
      );
      return {
        status: response.status,
        finalUrl: response.url || url,
        tlsValid: true,
        bodyText: await response.text(),
      };
    } catch {
      return { status: 0, finalUrl: url, tlsValid: false, bodyText: "" };
    }
  };
}
