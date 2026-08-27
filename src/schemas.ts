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
  openings: z.array(z.unknown()),
  index_scope: indexScopeSchema,
});

export type SearchJobsOutput = z.infer<typeof searchJobsOutputSchema>;

export const getJobInputSchema = z.object({
  url: z.string().min(1),
});

export const getJobOutputSchema = z.object({
  found: z.literal(false),
  index_scope: indexScopeSchema,
});

export type GetJobOutput = z.infer<typeof getJobOutputSchema>;
