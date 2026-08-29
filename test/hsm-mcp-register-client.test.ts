import { expect, test } from "vitest";
import {
  createNetworkHsmMcpRegisterClient,
  parseHsmRegisterStatusPayload,
} from "../src/hsm-mcp-register-client";
import { createHsmMcpRegisterSource } from "../src/register-source";

function sampleRegisterHtml(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const kvk = String(10_000_000 + index).padStart(8, "0");
    return `<tr><th scope="row">Sponsor ${index} B.V.</th><td>${kvk}</td></tr>`;
  }).join("");
  return `
    <html><body>
      <p>The overview was last updated on 3 August 2026.</p>
      <table>${rows}</table>
    </body></html>
  `;
}

test("parseHsmRegisterStatusPayload maps get_register_status fields", () => {
  expect(
    parseHsmRegisterStatusPayload({
      ind_last_updated: "2026-08-03",
      row_count: 12931,
      stale: false,
      source: "https://ind.nl/en/public-register-recognised-sponsors/public-register-work",
    }),
  ).toEqual({
    ind_last_updated: "2026-08-03",
    row_count: 12931,
    stale: false,
    source: "https://ind.nl/en/public-register-recognised-sponsors/public-register-work",
  });
});

test("network register client loads sponsors gated by hsm-mcp status", async () => {
  const rowCount = 1000;
  const fetchedUrls: string[] = [];
  const client = createNetworkHsmMcpRegisterClient({
    async getRegisterStatus() {
      return {
        ind_last_updated: "2026-08-03",
        row_count: rowCount,
        stale: false,
        source: "https://ind.test/register",
      };
    },
    async fetchRegisterHtml(url) {
      fetchedUrls.push(url);
      return sampleRegisterHtml(rowCount);
    },
  });

  const loaded = await createHsmMcpRegisterSource(client).load();
  expect(fetchedUrls).toEqual(["https://ind.test/register"]);
  expect(loaded.asOf).toBe("2026-08-03");
  expect(loaded.sponsors).toHaveLength(rowCount);
  expect(loaded.sponsors[0]).toEqual({ kvk: "10000000", name: "Sponsor 0 B.V." });
});

test("network register client refuses stale hsm-mcp status", async () => {
  const client = createNetworkHsmMcpRegisterClient({
    async getRegisterStatus() {
      return {
        ind_last_updated: "2026-08-03",
        row_count: 1000,
        stale: true,
        source: "https://ind.test/register",
      };
    },
    async fetchRegisterHtml() {
      throw new Error("should not fetch when stale");
    },
  });

  await expect(client.listSponsors()).rejects.toThrow(/stale/i);
});

test("network register client rejects row_count mismatch with parsed HTML", async () => {
  const client = createNetworkHsmMcpRegisterClient({
    async getRegisterStatus() {
      return {
        ind_last_updated: "2026-08-03",
        row_count: 1500,
        stale: false,
        source: "https://ind.test/register",
      };
    },
    async fetchRegisterHtml() {
      return sampleRegisterHtml(1000);
    },
  });

  await expect(client.listSponsors()).rejects.toThrow(/row count/i);
});
