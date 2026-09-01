import { awaitWithTimeout, DEFAULT_RUNTIME_CLOSE_TIMEOUT_MS } from "./fetch-timeout";
import { PRODUCT_USER_AGENT } from "./robots";
import type { PageGetResult } from "./website-resolution";

export type PlaywrightPageGetter = {
  getPage: (url: string) => Promise<PageGetResult | null>;
  close: () => Promise<void>;
};

/**
 * Headless Chromium fetch for the extraction ladder's last resort.
 * Dynamic import keeps the default unit suite free of a Playwright install.
 */
export async function createPlaywrightPageGetter(): Promise<PlaywrightPageGetter> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: PRODUCT_USER_AGENT });

  return {
    getPage: async (url: string): Promise<PageGetResult | null> => {
      const page = await context.newPage();
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        if (!response) return null;
        return {
          status: response.status(),
          finalUrl: page.url(),
          tlsValid: page.url().startsWith("https:"),
          bodyText: await page.content(),
        };
      } catch {
        return null;
      } finally {
        await page.close();
      }
    },
    close: async () => {
      const killBrowser = (): void => {
        try {
          browser.process()?.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      };
      try {
        await awaitWithTimeout(
          (async () => {
            await context.close();
            await browser.close();
          })(),
          DEFAULT_RUNTIME_CLOSE_TIMEOUT_MS,
          "playwright close",
        );
      } catch {
        killBrowser();
      }
    },
  };
}
