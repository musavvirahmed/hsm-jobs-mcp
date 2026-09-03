import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import {
  ingestWebsiteResolutions,
  type WebsiteResolutionProviders,
} from "../src/opening-ingest";
import { createFixtureRegister, createHsmMcpRegisterSource } from "../src/register-source";
import { createHttpsPageGetter, createWikidataSparqlLookup, resolveOfficialWebsite } from "../src/website-resolution";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

const RENTMAN = { kvk: "60733144", name: "Rentman B.V." };
const NOW = "2026-08-27T10:00:00Z";

const RENTMAN_HOME = "<html><body><h1>Rentman</h1><p>Event rental software.</p></body></html>";

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

let connected: Connected | undefined;

afterEach(async () => {
  if (connected) {
    await connected.close();
    connected = undefined;
  }
});

function rentmanGuessPages(): Record<string, FakePage> {
  return {
    "https://rentman.nl/": { redirectTo: "https://rentman.io/nl" },
    "https://rentman.nl": { redirectTo: "https://rentman.io/nl" },
    "https://rentman.io/nl": { bodyText: RENTMAN_HOME },
    "https://rentman.io/": { bodyText: RENTMAN_HOME },
    "https://rentman.io": { bodyText: RENTMAN_HOME },
    "https://rentman.com/": { tlsValid: false },
    "https://rentman.com": { tlsValid: false },
  };
}

type FakePage = {
  status?: number;
  redirectTo?: string;
  tlsValid?: boolean;
  bodyText?: string;
};

function fakeGetPage(pages: Record<string, FakePage>): WebsiteResolutionProviders["getPage"] {
  return async (url) => {
    let current = url;
    const seen = new Set<string>();
    for (let hop = 0; hop < 10; hop += 1) {
      if (seen.has(current)) return null;
      seen.add(current);
      const page = pages[current] ?? pages[stripSlash(current)] ?? pages[withSlash(current)];
      if (!page) return null;
      if (page.tlsValid === false) {
        return { status: 0, finalUrl: current, tlsValid: false, bodyText: "" };
      }
      if (page.redirectTo) {
        current = page.redirectTo;
        continue;
      }
      return {
        status: page.status ?? 200,
        finalUrl: current,
        tlsValid: true,
        bodyText: page.bodyText ?? "",
      };
    }
    return null;
  };
}

function stripSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function rentmanProviders(
  extras: Partial<WebsiteResolutionProviders> = {},
): WebsiteResolutionProviders {
  return {
    wikidata: { websiteForKvk: async () => null },
    getPage: fakeGetPage(rentmanGuessPages()),
    ...extras,
  };
}

test("stage-2 golden: ingest resolves KvK 60733144 to rentman.io and get_index_status counts the attempt", async () => {
  const index = createEmptyWritableJobsIndex();
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([RENTMAN], "2026-08-03"),
    index,
    providers: rentmanProviders(),
    now: () => NOW,
  });

  expect(report.results).toEqual([
    {
      kvk: "60733144",
      name: "Rentman B.V.",
      official_website_host: "rentman.io",
      terminal_outcome: null,
      resolved_via: "domain_guess",
    },
  ]);
  expect(await index.getOfficialWebsite("60733144")).toBe("rentman.io");
  expect(await index.getTerminalOutcome("60733144")).toBeNull();

  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    stale: true,
    last_successful_crawl: null,
    index_scope: {
      pass: "partial",
      sponsors_attempted: 1,
      sponsors_with_openings: 0,
      register_size: 1,
      register_as_of: "2026-08-03",
      omissions_possible: true,
    },
  });
});

test("failed guess without search writes unresolved_website and bumps sponsors_attempted", async () => {
  const index = createEmptyWritableJobsIndex();
  const unknown = { kvk: "99999999", name: "No Such Sponsor B.V." };
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([unknown], "2026-08-03"),
    index,
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: fakeGetPage({}),
    },
    now: () => NOW,
  });

  expect(report.results).toEqual([
    {
      kvk: "99999999",
      name: "No Such Sponsor B.V.",
      official_website_host: null,
      terminal_outcome: "unresolved_website",
      resolved_via: "unresolved",
    },
  ]);
  expect(await index.getOfficialWebsite("99999999")).toBeNull();
  expect(await index.getTerminalOutcome("99999999")).toMatchObject({
    kvk: "99999999",
    outcome: "unresolved_website",
    official_website_host: null,
  });

  const snapshot = await index.snapshot();
  expect(snapshot.index_scope).toMatchObject({
    sponsors_attempted: 1,
    sponsors_with_openings: 0,
    register_size: 1,
  });
});

test("search is skipped when no provider is configured even if a search would have hit", async () => {
  const index = createEmptyWritableJobsIndex();
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([{ kvk: "88888888", name: "Searchable Brand B.V." }], null),
    index,
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: fakeGetPage({
        "https://searchablebrand.example/": {
          bodyText: "<html>Searchable Brand careers</html>",
        },
      }),
    },
    now: () => NOW,
  });
  expect(report.results[0]).toMatchObject({
    official_website_host: null,
    terminal_outcome: "unresolved_website",
    resolved_via: "unresolved",
  });
});

test("search + validate runs only after Wikidata and domain-guess miss", async () => {
  const index = createEmptyWritableJobsIndex();
  const searched: string[] = [];
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([{ kvk: "88888888", name: "Searchable Brand B.V." }], null),
    index,
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: fakeGetPage({
        "https://searchablebrand.example/": {
          bodyText: "<html>Searchable Brand careers</html>",
        },
      }),
      search: {
        async candidateUrls(name, kvk) {
          searched.push(`${name}:${kvk}`);
          return ["https://searchablebrand.example/"];
        },
      },
    },
    now: () => NOW,
  });
  expect(searched).toEqual(["Searchable Brand B.V.:88888888"]);
  expect(report.results[0]).toMatchObject({
    official_website_host: "searchablebrand.example",
    terminal_outcome: null,
    resolved_via: "search",
  });
});

test("Wikidata candidate is accepted after validation without using domain-guess", async () => {
  const index = createEmptyWritableJobsIndex();
  const guessed = { called: false };
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([{ kvk: "34259528", name: "Adyen N.V." }], "2026-08-03"),
    index,
    providers: {
      wikidata: { websiteForKvk: async () => "http://www.adyen.com/" },
      getPage: async (url) => {
        if (url.includes("adyen.com")) {
          return {
            status: 200,
            finalUrl: "https://www.adyen.com/",
            tlsValid: true,
            bodyText: "<html>Adyen payment platform</html>",
          };
        }
        guessed.called = true;
        return null;
      },
    },
    now: () => NOW,
  });
  expect(guessed.called).toBe(false);
  expect(report.results[0]).toMatchObject({
    official_website_host: "www.adyen.com",
    resolved_via: "wikidata",
  });
});

test("Wikidata URL is rejected without name tokens even when the KvK appears on the page", async () => {
  const index = createEmptyWritableJobsIndex();
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([{ kvk: "34259528", name: "Adyen N.V." }], null),
    index,
    providers: {
      wikidata: { websiteForKvk: async () => "https://unrelated.example/" },
      getPage: fakeGetPage({
        "https://unrelated.example/": {
          bodyText: "<html>KvK 34259528 but no matching brand</html>",
        },
      }),
    },
    now: () => NOW,
  });
  expect(report.results[0]).toMatchObject({
    official_website_host: null,
    terminal_outcome: "unresolved_website",
  });
});

test("validation rejects LinkedIn, aggregator, ATS board, park hosts, and invalid TLS without fetching LinkedIn", async () => {
  const fetched: string[] = [];
  const index = createEmptyWritableJobsIndex();
  const rows = [
    { kvk: "10101010", name: "Social Corp B.V." },
    { kvk: "10101011", name: "Agg Jobs B.V." },
    { kvk: "10101012", name: "Ashby Seeded B.V." },
    { kvk: "10101013", name: "Parked Name B.V." },
    { kvk: "10101014", name: "Tls Fail B.V." },
  ];
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister(rows, null),
    index,
    providers: {
      wikidata: {
        async websiteForKvk(kvk) {
          if (kvk === "10101010") return "https://www.linkedin.com/company/social-corp";
          if (kvk === "10101011") return "https://www.indeed.com/cmp/agg-jobs";
          if (kvk === "10101012") return "https://jobs.ashbyhq.com/ashby-seeded";
          if (kvk === "10101013") return "https://parkedname.nl/";
          if (kvk === "10101014") return "https://tlsfail.com/";
          return null;
        },
      },
      getPage: async (url) => {
        fetched.push(url);
        return fakeGetPage({
          "https://www.linkedin.com/company/social-corp": {
            bodyText: "<html>Social Corp on LinkedIn</html>",
          },
          "https://www.indeed.com/cmp/agg-jobs": {
            bodyText: "<html>Agg Jobs on Indeed</html>",
          },
          "https://jobs.ashbyhq.com/ashby-seeded": {
            bodyText: "<html>Ashby Seeded board</html>",
          },
          "https://parkedname.nl/": {
            bodyText: "<html>Parked Name — this domain is parked by Sedo Domain parking</html>",
          },
          "https://tlsfail.com/": { tlsValid: false },
        })(url);
      },
    },
    now: () => NOW,
  });
  expect(fetched.some((url) => url.includes("linkedin.com"))).toBe(false);
  expect(fetched.some((url) => url.includes("indeed.com"))).toBe(false);
  expect(fetched.some((url) => url.includes("ashbyhq.com"))).toBe(false);
  expect(report.results.map((row) => row.terminal_outcome)).toEqual([
    "unresolved_website",
    "unresolved_website",
    "unresolved_website",
    "unresolved_website",
    "unresolved_website",
  ]);
});

test("name tokens on an about page can accept a host whose homepage is silent", async () => {
  const index = createEmptyWritableJobsIndex();
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([{ kvk: "12121212", name: "Quiet Home B.V." }], null),
    index,
    providers: {
      wikidata: { websiteForKvk: async () => "https://quiethome.nl/" },
      getPage: fakeGetPage({
        "https://quiethome.nl/": { bodyText: "<html>Welcome</html>" },
        "https://quiethome.nl/about": { bodyText: "<html>About Quiet Home</html>" },
      }),
    },
    now: () => NOW,
  });
  expect(report.results[0]).toMatchObject({
    official_website_host: "quiethome.nl",
    resolved_via: "wikidata",
  });
});

test("operator pin override skips the cascade; force unresolved skips an otherwise valid guess", async () => {
  const index = createEmptyWritableJobsIndex();
  await index.setWebsiteOverride("60733144", { mode: "pin", host: "careers.rentman.io" }, NOW);
  await index.setWebsiteOverride("77777777", { mode: "force_unresolved" }, NOW);

  const pinned = await ingestWebsiteResolutions({
    register: createFixtureRegister([RENTMAN, { kvk: "77777777", name: "Rentman B.V." }], null),
    index,
    providers: rentmanProviders(),
    now: () => NOW,
  });
  expect(pinned.results[0]).toMatchObject({
    kvk: "60733144",
    official_website_host: "careers.rentman.io",
    resolved_via: "override_pin",
  });
  expect(pinned.results[1]).toMatchObject({
    kvk: "77777777",
    official_website_host: null,
    terminal_outcome: "unresolved_website",
    resolved_via: "override_force_unresolved",
  });
});

test("jobs tools still cannot rewrite website overrides or the shared index", async () => {
  const index = createEmptyWritableJobsIndex();
  connected = await connectIndex(index);
  const listed = await connected.client.listTools();
  expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
    "get_index_status",
    "get_job",
    "search_jobs",
  ]);
  await expect(
    connected.client.callTool({
      name: "set_website_override",
      arguments: { kvk: "60733144", host: "evil.example" },
    }),
  ).rejects.toThrow(/set_website_override not found/);
  expect(await index.getWebsiteOverride("60733144")).toBeNull();
});

test("production register source wraps hsm-mcp identity, not a GitHub mirror", async () => {
  const loaded = await createHsmMcpRegisterSource({
    async getRegisterStatus() {
      return { ind_last_updated: "2026-08-03" };
    },
    async listSponsors() {
      return [RENTMAN];
    },
  }).load();
  expect(loaded).toEqual({ asOf: "2026-08-03", sponsors: [RENTMAN] });

  const index = createEmptyWritableJobsIndex();
  await ingestWebsiteResolutions({
    register: createHsmMcpRegisterSource({
      async getRegisterStatus() {
        return { ind_last_updated: "2026-08-03" };
      },
      async listSponsors() {
        return [RENTMAN];
      },
    }),
    index,
    providers: rentmanProviders(),
    now: () => NOW,
  });
  const snapshot = await index.snapshot();
  expect(snapshot.index_scope.register_as_of).toBe("2026-08-03");
  expect(await index.getOfficialWebsite("60733144")).toBe("rentman.io");
});

test("get_index_status counts resolved and unresolved KvKs as attempted", async () => {
  const index = createEmptyWritableJobsIndex();
  await ingestWebsiteResolutions({
    register: createFixtureRegister(
      [RENTMAN, { kvk: "99999999", name: "No Such Sponsor B.V." }],
      "2026-08-03",
    ),
    index,
    providers: rentmanProviders(),
    now: () => NOW,
  });
  connected = await connectIndex(index);
  const status = await connected.client.callTool({ name: "get_index_status", arguments: {} });
  expect(status.structuredContent).toMatchObject({
    index_scope: {
      sponsors_attempted: 2,
      sponsors_with_openings: 0,
      register_size: 2,
      register_as_of: "2026-08-03",
    },
  });
  expect(await index.getTerminalOutcome("99999999")).toMatchObject({ outcome: "unresolved_website" });
  expect(await index.getOfficialWebsite("60733144")).toBe("rentman.io");
});

test("Wikidata SPARQL lookup is used as the first cascade step", async () => {
  const index = createEmptyWritableJobsIndex();
  const queries: string[] = [];
  const report = await ingestWebsiteResolutions({
    register: createFixtureRegister([{ kvk: "34259528", name: "Adyen N.V." }], null),
    index,
    providers: {
      wikidata: createWikidataSparqlLookup(async (url) => {
        queries.push(String(url));
        return new Response(
          JSON.stringify({
            results: { bindings: [{ website: { value: "https://www.adyen.com/" } }] },
          }),
          { headers: { "content-type": "application/sparql-results+json" } },
        );
      }),
      getPage: async (url) => {
        if (String(url).includes("adyen.com")) {
          return {
            status: 200,
            finalUrl: "https://www.adyen.com/",
            tlsValid: true,
            bodyText: "<html>Adyen</html>",
          };
        }
        return null;
      },
    },
    now: () => NOW,
  });
  expect(queries[0]).toContain("query.wikidata.org/sparql");
  expect(decodeURIComponent(queries[0] ?? "")).toContain("P3220");
  expect(report.results[0]).toMatchObject({
    official_website_host: "www.adyen.com",
    resolved_via: "wikidata",
  });
});

test("Wikidata SPARQL socket failures return null after retries (do not abort)", async () => {
  let attempts = 0;
  const wikidata = createWikidataSparqlLookup(async () => {
    attempts += 1;
    const err = new TypeError("fetch failed");
    (err as Error & { cause: { code: string; name: string } }).cause = {
      code: "UND_ERR_SOCKET",
      name: "SocketError",
    };
    throw err;
  });
  expect(await wikidata.websiteForKvk("60733144")).toBeNull();
  expect(attempts).toBe(3);
});

test("Wikidata SPARQL transient failure then success retries", async () => {
  let attempts = 0;
  const wikidata = createWikidataSparqlLookup(async () => {
    attempts += 1;
    if (attempts < 2) {
      const err = new TypeError("fetch failed");
      (err as Error & { cause: { code: string } }).cause = { code: "UND_ERR_SOCKET" };
      throw err;
    }
    return new Response(
      JSON.stringify({
        results: { bindings: [{ website: { value: "https://rentman.io/" } }] },
      }),
      { headers: { "content-type": "application/sparql-results+json" } },
    );
  });
  expect(await wikidata.websiteForKvk("60733144")).toBe("https://rentman.io/");
  expect(attempts).toBe(2);
});

test("resolveOfficialWebsite continues cascade when wikidata provider throws", async () => {
  const resolved = await resolveOfficialWebsite(
    { kvk: "60733144", name: "Rentman B.V." },
    {
      wikidata: {
        async websiteForKvk() {
          throw new TypeError("fetch failed");
        },
      },
      getPage: async (url) => {
        if (String(url).includes("rentman.")) {
          return {
            status: 200,
            finalUrl: "https://rentman.nl/",
            tlsValid: true,
            bodyText: "<html>Rentman</html>",
          };
        }
        return null;
      },
    },
    null,
  );
  expect(resolved).toMatchObject({
    official_website_host: "rentman.nl",
    resolved_via: "domain_guess",
  });
});

test("https page getter treats fetch failures as invalid TLS", async () => {
  const getPage = createHttpsPageGetter(async () => {
    throw new Error("certificate mismatch");
  });
  expect(await getPage("https://rentman.com/")).toEqual({
    status: 0,
    finalUrl: "https://rentman.com/",
    tlsValid: false,
    bodyText: "",
  });
});

async function connectIndex(
  index: ReturnType<typeof createEmptyWritableJobsIndex>,
): Promise<Connected> {
  const handler = createMcpHandler(() =>
    createJobsMcpServer({ jobsIndex: index, hsmMcp: createStubHsmMcp() }),
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: "test-harness", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
