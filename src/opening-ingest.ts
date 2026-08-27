import type { WritableJobsIndex } from "./jobs-index";
import type { RegisterSource } from "./register-source";
import {
  resolveOfficialWebsite,
  type ResolvedVia,
  type WebsiteResolutionProviders,
} from "./website-resolution";

export type { WebsiteResolutionProviders } from "./website-resolution";

export type WebsiteIngestResult = {
  kvk: string;
  name: string;
  official_website_host: string | null;
  terminal_outcome: "unresolved_website" | null;
  resolved_via: ResolvedVia;
};

export type WebsiteIngestReport = {
  results: WebsiteIngestResult[];
};

export async function ingestWebsiteResolutions(opts: {
  register: RegisterSource;
  index: WritableJobsIndex;
  providers: WebsiteResolutionProviders;
  now?: () => string;
}): Promise<WebsiteIngestReport> {
  const now = opts.now ?? (() => new Date().toISOString());
  const stamp = now();
  const register = await opts.register.load();
  const results: WebsiteIngestResult[] = [];

  for (const sponsor of register.sponsors) {
    const override = await opts.index.getWebsiteOverride(sponsor.kvk);
    const resolved = await resolveOfficialWebsite(sponsor, opts.providers, override);
    await opts.index.recordWebsiteResolution({
      kvk: sponsor.kvk,
      official_website_host: resolved.official_website_host,
      now: stamp,
      replaceClosed: resolved.resolved_via === "override_force_unresolved",
    });
    results.push({
      kvk: sponsor.kvk,
      name: sponsor.name,
      official_website_host: resolved.official_website_host,
      terminal_outcome: resolved.official_website_host ? null : "unresolved_website",
      resolved_via: resolved.resolved_via,
    });
  }

  await opts.index.setRegisterMeta({
    register_size: register.sponsors.length,
    register_as_of: register.asOf,
  });

  return { results };
}
