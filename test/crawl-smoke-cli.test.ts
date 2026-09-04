import { spawn } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");

test(
  "crawl:smoke prints start expectation, mid-run progress, and JSON report",
  async () => {
    const result = await runSmokeCrawl();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/\[crawl\].*smoke/i);
    expect(result.stderr).toMatch(/~1 min|under ~1 min/i);
    expect(result.stderr).toMatch(/\[crawl\].*(register loaded|board refresh)/i);
    const report = JSON.parse(result.stdout) as { smoke?: boolean };
    expect(report.smoke).toBe(true);
  },
  120_000,
);

function runSmokeCrawl(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const tsxBin = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxBin, join(ROOT, "scripts/run-crawl.ts")], {
      cwd: ROOT,
      env: { ...process.env, CRAWL_SMOKE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
