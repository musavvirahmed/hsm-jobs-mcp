import { extractHonesty } from "./honesty";
import type { OpeningRecord, WritableJobsIndex } from "./jobs-index";
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

export type OpeningDraft = Omit<
  OpeningRecord,
  "honesty_salary" | "honesty_dutch_required" | "honesty_sponsorship_willingness"
> & {
  /** Structured ATS compensation only. Not FAQ, culture, or company visa pages. */
  ats_compensation?: string | null;
  /** Other structured ATS fields (language, visa, eligibility) joined as text. */
  ats_structured_fields?: string | null;
};

export function openingFromDraft(draft: OpeningDraft): OpeningRecord {
  const { ats_compensation, ats_structured_fields, ...stored } = draft;
  return {
    ...stored,
    ...extractHonesty({
      jdBody: draft.jd_extract,
      atsCompensation: ats_compensation ?? null,
      atsStructuredFields: ats_structured_fields ?? null,
    }),
  };
}

export async function ingestOpening(
  index: WritableJobsIndex,
  draft: OpeningDraft,
): Promise<OpeningRecord> {
  const opening = openingFromDraft(draft);
  await index.upsertOpening(opening);
  return opening;
}

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
