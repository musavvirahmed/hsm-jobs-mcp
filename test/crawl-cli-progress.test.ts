import { expect, test } from "vitest";
import { crawlStartLines } from "../src/crawl-cli-progress";

test("smoke start lines set a short wait expectation", () => {
  const lines = crawlStartLines({
    smoke: true,
    fullPass: false,
    targetLabel: "memory (CRAWL_SMOKE=1)",
  });
  expect(lines.length).toBeGreaterThanOrEqual(1);
  expect(lines[0]).toMatch(/^\[crawl\]/);
  expect(lines.join("\n")).toMatch(/smoke/i);
  expect(lines.join("\n")).toMatch(/memory \(CRAWL_SMOKE=1\)/);
  expect(lines.join("\n")).toMatch(/~1 min|under ~1 min|about one minute/i);
});

test("live start lines warn that the run can take hours and prefer smoke or public MCP", () => {
  const lines = crawlStartLines({
    smoke: false,
    fullPass: false,
    targetLabel: "local-d1",
  });
  const text = lines.join("\n");
  expect(text).toMatch(/^\[crawl\]/m);
  expect(text).toMatch(/local-d1/);
  expect(text).toMatch(/hours|long time/i);
  expect(text).toMatch(/crawl:smoke/);
  expect(text).toMatch(/hsmjobs\.musavvir\.work\/mcp|public MCP/i);
});

test("full-pass live start lines mention a longer run", () => {
  const text = crawlStartLines({
    smoke: false,
    fullPass: true,
    targetLabel: "remote-d1",
  }).join("\n");
  expect(text).toMatch(/full careers pass|full-?pass/i);
  expect(text).toMatch(/hours|longer/i);
  expect(text).toMatch(/remote-d1/);
});
