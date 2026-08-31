import { expect, test } from "vitest";
import { runFullCareersPass } from "../src/full-careers-pass";
import { createFixtureRegister } from "../src/register-source";
import { createHttpsPageGetter } from "../src/website-resolution";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

const ACME = { kvk: "12345678", name: "Acme B.V." };
const NOW = "2026-08-31T20:00:00Z";

test("HTTPS page getter returns within timeout when fetch never resolves", async () => {
  const hangingFetch: typeof fetch = () => new Promise(() => {});
  const getPage = createHttpsPageGetter(hangingFetch, { timeoutMs: 40 });
  const started = Date.now();
  const result = await getPage("https://hang.example/jobs");
  expect(Date.now() - started).toBeLessThan(500);
  expect(result).toEqual({
    status: 0,
    finalUrl: "https://hang.example/jobs",
    tlsValid: false,
    bodyText: "",
  });
});

test("full careers pass loads the register once (no subset re-fetch)", async () => {
  let loads = 0;
  const register = {
    async load() {
      loads += 1;
      return { asOf: "2026-08-03", sponsors: [ACME] };
    },
  };
  const index = createEmptyWritableJobsIndex();
  await runFullCareersPass({
    register,
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: async () => null,
    },
    now: () => NOW,
  });
  expect(loads).toBe(1);
});

test("full careers pass emits progress lines for register load and batch phases", async () => {
  const lines: string[] = [];
  const index = createEmptyWritableJobsIndex();
  await runFullCareersPass({
    register: createFixtureRegister([ACME], "2026-08-03"),
    index,
    fetchBoardFeed: async () => ({ ok: false, status: 404 }),
    providers: {
      wikidata: { websiteForKvk: async () => null },
      getPage: async () => null,
    },
    now: () => NOW,
    onProgress: (line) => lines.push(line),
  });
  expect(lines.some((line) => /loading register/i.test(line))).toBe(true);
  expect(lines.some((line) => /register loaded/i.test(line))).toBe(true);
  expect(lines.some((line) => /batch/i.test(line))).toBe(true);
  expect(lines.some((line) => /done|complete|finished/i.test(line))).toBe(true);
});
