import { expect, test } from "vitest";
import { createProductionCrawlRuntime } from "../src/crawl-runtime";
import { createWikidataSparqlLookup } from "../src/website-resolution";

test("production crawl runtime uses hsm-mcp register source and real website providers", async () => {
  const wikidataQueries: string[] = [];
  const pageUrls: string[] = [];
  const runtime = await createProductionCrawlRuntime({
    registerClient: {
      async getRegisterStatus() {
        return { ind_last_updated: "2026-08-03" };
      },
      async listSponsors() {
        return [{ kvk: "60733144", name: "Rentman B.V." }];
      },
    },
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("query.wikidata.org/sparql")) {
        wikidataQueries.push(url);
        return new Response(
          JSON.stringify({ results: { bindings: [] } }),
          { headers: { "content-type": "application/sparql-results+json" } },
        );
      }
      pageUrls.push(url);
      return new Response("<html>Rentman</html>", { status: 200 });
    },
  });

  const loaded = await runtime.register.load();
  expect(loaded.asOf).toBe("2026-08-03");
  expect(loaded.sponsors).toEqual([{ kvk: "60733144", name: "Rentman B.V." }]);

  await runtime.providers.wikidata.websiteForKvk("60733144");
  expect(wikidataQueries.some((url) => url.includes("query.wikidata.org/sparql"))).toBe(true);

  await runtime.providers.getPage("https://rentman.io/");
  expect(pageUrls).toContain("https://rentman.io/");

  await runtime.close();
});

test("production runtime does not launch Playwright until last-resort getPage", async () => {
  let launches = 0;
  const runtime = await createProductionCrawlRuntime({
    registerClient: {
      async getRegisterStatus() {
        return { ind_last_updated: "2026-08-03" };
      },
      async listSponsors() {
        return [{ kvk: "60733144", name: "Rentman B.V." }];
      },
    },
    createPageGetter: async () => {
      launches += 1;
      return {
        getPage: async () => null,
        close: async () => {},
      };
    },
  });
  expect(launches).toBe(0);
  await runtime.close();
  expect(launches).toBe(0);
});

test("runtime close returns when Playwright close hangs", async () => {
  const runtime = await createProductionCrawlRuntime({
    registerClient: {
      async getRegisterStatus() {
        return { ind_last_updated: "2026-08-03" };
      },
      async listSponsors() {
        return [{ kvk: "60733144", name: "Rentman B.V." }];
      },
    },
    closeTimeoutMs: 40,
    createPageGetter: async () => ({
      getPage: async () => null,
      close: () => new Promise(() => {}),
    }),
  });
  await runtime.getBrowserPage?.("https://example.test/");
  const started = Date.now();
  await runtime.close();
  expect(Date.now() - started).toBeLessThan(500);
});

test("mock hsm-mcp transport can gate IND HTML without live network", async () => {
  const { createNetworkHsmMcpRegisterClient } = await import("../src/hsm-mcp-register-client");
  const client = createNetworkHsmMcpRegisterClient({
    async getRegisterStatus() {
      return {
        ind_last_updated: "2026-08-03",
        row_count: 1,
        stale: false,
        source: "https://ind.test/register",
      };
    },
    async fetchRegisterHtml() {
      return `
        <html><body>
          <p>The overview was last updated on 3 August 2026.</p>
          <table><tr><th scope="row">Rentman B.V.</th><td>60733144</td></tr></table>
        </body></html>
      `;
    },
  });
  const wikidata = createWikidataSparqlLookup(async () =>
    new Response(JSON.stringify({ results: { bindings: [] } }), {
      headers: { "content-type": "application/sparql-results+json" },
    }),
  );
  await expect(client.listSponsors()).rejects.toThrow(/implausibly small/i);
  expect(await wikidata.websiteForKvk("60733144")).toBeNull();
});
