import * as z from "zod/v4";

export const indexScopeSchema = z.object({
  pass: z.enum(["partial", "full_careers_pass"]),
  sponsors_attempted: z.number().int(),
  sponsors_with_openings: z.number().int(),
  register_size: z.number().int(),
  register_as_of: z.string().nullable(),
  omissions_possible: z.boolean(),
});

export const indexStatusOutputSchema = z.object({
  jobs_count: z.number().int(),
  stale: z.boolean(),
  last_successful_crawl: z.string().nullable(),
  source_policy: z.string(),
  coverage_note: z.string(),
  register_join_note: z.string(),
  index_scope: indexScopeSchema,
});

export type IndexStatusOutput = z.infer<typeof indexStatusOutputSchema>;

export const registerJoinStatusSchema = z.enum(["ok", "stale", "error"]);

export const registerJoinSchema = z.object({
  name: z.string().nullable(),
  kvk: z.string().nullable(),
  strength: z.enum(["exact_kvk", "strong_name", "weak", "unmatched"]),
});

export const openingSearchCardSchema = z.object({
  title: z.string(),
  url: z.string(),
  location: z.string().nullable(),
  careers_url: z.string().optional(),
  ats_url: z.string().optional(),
  register_join: registerJoinSchema,
  source_class: z.enum(["careers_site", "ats_board", "aggregator", "unknown"]),
  honesty_salary: z.string(),
  honesty_dutch_required: z.union([z.boolean(), z.literal("unknown")]),
  honesty_sponsorship_willingness: z.enum(["stated_yes", "stated_no", "unknown"]),
});

export const searchJobsInputSchema = z
  .object({
    query: z.string().min(1).optional(),
    kvk: z.string().regex(/^\d{8}$/).optional(),
    location: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(20).optional().default(10),
  })
  .refine((value) => value.query !== undefined || value.kvk !== undefined, {
    message: "require one of query or kvk",
  });

export const searchJobsOutputSchema = z.object({
  openings: z.array(openingSearchCardSchema),
  index_scope: indexScopeSchema,
  register_join_status: registerJoinStatusSchema,
});

export type SearchJobsOutput = z.infer<typeof searchJobsOutputSchema>;

export const getJobInputSchema = z.object({
  url: z.string().min(1),
});

export const getJobMissSchema = z.object({
  found: z.literal(false),
  index_scope: indexScopeSchema,
});

export const getJobHitSchema = openingSearchCardSchema.extend({
  found: z.literal(true),
  jd_extract: z.string().nullable(),
  index_scope: indexScopeSchema,
  register_join_status: registerJoinStatusSchema,
});

export const getJobOutputSchema = z.union([getJobHitSchema, getJobMissSchema]);

export type GetJobOutput = z.infer<typeof getJobOutputSchema>;
