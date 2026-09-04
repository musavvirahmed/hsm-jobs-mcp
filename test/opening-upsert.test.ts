import { expect, test } from "vitest";
import type { OpeningRecord } from "../src/jobs-index";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

function opening(partial: Pick<OpeningRecord, "identity" | "primary_url" | "title"> & Partial<OpeningRecord>): OpeningRecord {
  return {
    careers_url: partial.careers_url ?? partial.primary_url,
    ats_url: partial.ats_url ?? null,
    location: partial.location ?? null,
    jd_extract: partial.jd_extract ?? null,
    source_class: partial.source_class ?? "ats_board",
    honesty_salary: partial.honesty_salary ?? "unknown",
    honesty_dutch_required: partial.honesty_dutch_required ?? "unknown",
    honesty_sponsorship_willingness: partial.honesty_sponsorship_willingness ?? "unknown",
    register_name: partial.register_name ?? "Example B.V.",
    register_kvk: partial.register_kvk ?? "12345678",
    register_join_strength: partial.register_join_strength ?? "exact_kvk",
    ats_family: partial.ats_family ?? "ashby",
    board_token: partial.board_token ?? "example",
    posting_id: partial.posting_id ?? "post-1",
    ...partial,
  };
}

test("upsertOpening replaces a different identity that already owns the same primary_url", async () => {
  const index = createEmptyWritableJobsIndex();
  const sharedUrl = "https://example.com/jobs/shared-slug";

  await index.upsertOpening(
    opening({
      identity: "ashby:example:old-id",
      primary_url: sharedUrl,
      title: "Old Title",
      posting_id: "old-id",
    }),
  );

  await expect(
    index.upsertOpening(
      opening({
        identity: "ashby:example:new-id",
        primary_url: sharedUrl,
        title: "New Title",
        posting_id: "new-id",
      }),
    ),
  ).resolves.toBeUndefined();

  expect(await index.getOpening(sharedUrl)).toMatchObject({
    identity: "ashby:example:new-id",
    title: "New Title",
  });
});

test("upsertOpening still updates the same identity in place", async () => {
  const index = createEmptyWritableJobsIndex();
  const url = "https://example.com/jobs/same-id";
  await index.upsertOpening(opening({ identity: "ashby:example:1", primary_url: url, title: "V1" }));
  await index.upsertOpening(opening({ identity: "ashby:example:1", primary_url: url, title: "V2" }));
  expect(await index.getOpening(url)).toMatchObject({ identity: "ashby:example:1", title: "V2" });
});
