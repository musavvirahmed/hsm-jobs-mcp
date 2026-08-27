import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import { ingestOpening, type OpeningDraft } from "../src/opening-ingest";
import { createEmptyWritableJobsIndex } from "./sqlite-writable-index";

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

let connected: Connected | undefined;

afterEach(async () => {
  if (connected) {
    await connected.close();
    connected = undefined;
  }
});

test("labeled quantitative salary span is returned unchanged on search_jobs and get_job", async () => {
  const url = "https://honesty.example.invalid/jobs/salary-span";
  connected = await ingestAndConnect([
    draft({
      title: "Salary Span Designer",
      primary_url: url,
      register_kvk: "20202020",
      jd_extract: "Salary €4,500–€5,500 per month. Fluent English.",
    }),
  ]);

  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "20202020" },
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [{ honesty_salary: "€4,500–€5,500 per month" }],
  });
  expect(JSON.stringify(searched.structuredContent)).not.toMatch(/meets|below|salary criterion/i);

  const detailed = await connected.client.callTool({ name: "get_job", arguments: { url } });
  expect(detailed.structuredContent).toMatchObject({
    found: true,
    honesty_salary: "€4,500–€5,500 per month",
    honesty_dutch_required: "unknown",
    honesty_sponsorship_willingness: "unknown",
  });
});

test("thin ATS row with no JD body and no structured compensation is all unknown on search and get_job", async () => {
  connected = await ingestAndConnect([
    draft({
      title: "Thin ATS Row",
      primary_url: "https://honesty.example.invalid/jobs/thin-row",
      register_kvk: "10101010",
      jd_extract: null,
    }),
  ]);

  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "10101010" },
  });
  expect(searched.isError).toBeFalsy();
  expect(searched.structuredContent).toMatchObject({
    openings: [
      {
        title: "Thin ATS Row",
        honesty_salary: "unknown",
        honesty_dutch_required: "unknown",
        honesty_sponsorship_willingness: "unknown",
      },
    ],
  });
  expect(JSON.stringify(searched.structuredContent)).not.toMatch(/jd_extract|jd_body|description/);

  const detailed = await connected.client.callTool({
    name: "get_job",
    arguments: { url: "https://honesty.example.invalid/jobs/thin-row" },
  });
  expect(detailed.structuredContent).toMatchObject({
    found: true,
    honesty_salary: "unknown",
    honesty_dutch_required: "unknown",
    honesty_sponsorship_willingness: "unknown",
    jd_extract: null,
  });
});

test("salary fixtures: competitive, conflicts, ATS compensation, and signing bonus", async () => {
  connected = await ingestAndConnect([
    draft({
      title: "Competitive Pay",
      primary_url: "https://honesty.example.invalid/jobs/competitive",
      register_kvk: "30303030",
      jd_extract: "Competitive salary. Market rate compensation.",
    }),
    draft({
      title: "Conflicting Salaries",
      primary_url: "https://honesty.example.invalid/jobs/salary-conflict",
      register_kvk: "30303031",
      jd_extract: "Salary €4,000 per month. Salary €80,000 per year.",
    }),
    draft({
      title: "ATS Compensation",
      primary_url: "https://honesty.example.invalid/jobs/ats-comp",
      register_kvk: "30303032",
      jd_extract: "We hire designers in Amsterdam.",
      ats_compensation: "€5,000–€6,000 per month",
    }),
    draft({
      title: "ATS Body Conflict",
      primary_url: "https://honesty.example.invalid/jobs/ats-body-conflict",
      register_kvk: "30303033",
      jd_extract: "Salary €80,000 per year.",
      ats_compensation: "€5,000 per month",
    }),
    draft({
      title: "Signing Bonus Beside Base",
      primary_url: "https://honesty.example.invalid/jobs/signing-bonus",
      register_kvk: "30303034",
      jd_extract: "Salary €5,000–€6,000 per month. Signing bonus €5,000.",
    }),
    draft({
      title: "Laptop Euros",
      primary_url: "https://honesty.example.invalid/jobs/laptop",
      register_kvk: "30303035",
      jd_extract: "We provide a laptop worth €2,000.",
    }),
    draft({
      title: "NL Salary Span",
      primary_url: "https://honesty.example.invalid/jobs/nl-salary",
      register_kvk: "30303036",
      jd_extract: "Salaris €4.500–€5.500 per maand.",
    }),
    draft({
      title: "ATS Poison Equity",
      primary_url: "https://honesty.example.invalid/jobs/ats-equity",
      register_kvk: "30303037",
      jd_extract: "We hire designers in Amsterdam.",
      ats_compensation: "equity €100,000",
    }),
    draft({
      title: "ATS Period Completes Body",
      primary_url: "https://honesty.example.invalid/jobs/ats-period",
      register_kvk: "30303038",
      jd_extract: "Salary €5,000–€6,000 per month.",
      ats_compensation: "€5,000–€6,000",
    }),
    draft({
      title: "Lunch Pay",
      primary_url: "https://honesty.example.invalid/jobs/lunch-pay",
      register_kvk: "30303039",
      jd_extract: "We pay €20 for lunch.",
    }),
  ]);

  const byKvk = async (kvk: string) => {
    const result = await connected!.client.callTool({ name: "search_jobs", arguments: { kvk } });
    return (result.structuredContent as { openings: Array<{ honesty_salary: string }> }).openings[0];
  };

  expect(await byKvk("30303030")).toMatchObject({ honesty_salary: "unknown" });
  expect(await byKvk("30303031")).toMatchObject({ honesty_salary: "unknown" });
  expect(await byKvk("30303032")).toMatchObject({ honesty_salary: "€5,000–€6,000 per month" });
  expect(await byKvk("30303033")).toMatchObject({ honesty_salary: "unknown" });
  expect(await byKvk("30303034")).toMatchObject({ honesty_salary: "€5,000–€6,000 per month" });
  expect(await byKvk("30303035")).toMatchObject({ honesty_salary: "unknown" });
  expect(await byKvk("30303036")).toMatchObject({ honesty_salary: "€4.500–€5.500 per maand" });
  expect(await byKvk("30303037")).toMatchObject({ honesty_salary: "unknown" });
  expect(await byKvk("30303038")).toMatchObject({ honesty_salary: "€5,000–€6,000" });
  expect(await byKvk("30303039")).toMatchObject({ honesty_salary: "unknown" });
});

test("Dutch-required fixtures: hard cues, preferred, fluent English, and conflicts", async () => {
  connected = await ingestAndConnect([
    draft({
      title: "Dutch Required NL",
      primary_url: "https://honesty.example.invalid/jobs/dutch-nl",
      register_kvk: "40404040",
      jd_extract: "Nederlands is vereist. Salaris in overleg.",
    }),
    draft({
      title: "Dutch Not Required",
      primary_url: "https://honesty.example.invalid/jobs/dutch-false",
      register_kvk: "40404041",
      jd_extract: "Salary €5,000–€6,000 per month. Dutch not required. We sponsor HSM transfers.",
    }),
    draft({
      title: "Dutch Preferred",
      primary_url: "https://honesty.example.invalid/jobs/dutch-preferred",
      register_kvk: "40404042",
      jd_extract: "Dutch preferred. Nederlands is een pré. Fluent English.",
    }),
    draft({
      title: "Fluent English Only",
      primary_url: "https://honesty.example.invalid/jobs/english-only",
      register_kvk: "40404043",
      jd_extract: "Fluent English. International team.",
    }),
    draft({
      title: "Dutch Conflict",
      primary_url: "https://honesty.example.invalid/jobs/dutch-conflict",
      register_kvk: "40404044",
      jd_extract: "Dutch is required. Dutch not required.",
    }),
    draft({
      title: "ATS Language Field",
      primary_url: "https://honesty.example.invalid/jobs/ats-language",
      register_kvk: "40404045",
      jd_extract: "We hire writers in Rotterdam.",
      ats_structured_fields: "Nederlands is vereist.",
    }),
  ]);

  const byKvk = async (kvk: string) => {
    const result = await connected!.client.callTool({ name: "search_jobs", arguments: { kvk } });
    return (
      result.structuredContent as {
        openings: Array<{ honesty_dutch_required: boolean | "unknown" }>;
      }
    ).openings[0];
  };

  expect(await byKvk("40404040")).toMatchObject({ honesty_dutch_required: true });
  expect(await byKvk("40404041")).toMatchObject({ honesty_dutch_required: false });
  expect(await byKvk("40404042")).toMatchObject({ honesty_dutch_required: "unknown" });
  expect(await byKvk("40404043")).toMatchObject({ honesty_dutch_required: "unknown" });
  expect(await byKvk("40404044")).toMatchObject({ honesty_dutch_required: "unknown" });
  expect(await byKvk("40404045")).toMatchObject({ honesty_dutch_required: true });

  const detailed = await connected.client.callTool({
    name: "get_job",
    arguments: { url: "https://honesty.example.invalid/jobs/dutch-nl" },
  });
  expect(detailed.structuredContent).toMatchObject({
    found: true,
    honesty_dutch_required: true,
    honesty_salary: "unknown",
  });
});

test("sponsorship-willingness fixtures: stated yes/no, hedges, licence-only, and conflicts", async () => {
  connected = await ingestAndConnect([
    draft({
      title: "HSM Sponsor Yes",
      primary_url: "https://honesty.example.invalid/jobs/sponsor-yes",
      register_kvk: "50505050",
      jd_extract: "We sponsor HSM transfers for this role.",
    }),
    draft({
      title: "No Sponsorship",
      primary_url: "https://honesty.example.invalid/jobs/sponsor-no",
      register_kvk: "50505051",
      jd_extract: "Must already have the right to work in the Netherlands. No sponsorship.",
    }),
    draft({
      title: "Soft Hedge",
      primary_url: "https://honesty.example.invalid/jobs/sponsor-hedge",
      register_kvk: "50505052",
      jd_extract: "Sponsorship may be available for the right candidate.",
    }),
    draft({
      title: "Recognised Sponsor Only",
      primary_url: "https://honesty.example.invalid/jobs/licence-only",
      register_kvk: "50505053",
      jd_extract: "We are a recognised sponsor. Join our international team.",
    }),
    draft({
      title: "Wij Sponsoren Boilerplate",
      primary_url: "https://honesty.example.invalid/jobs/wij-sponsoren",
      register_kvk: "50505056",
      jd_extract: "Wij sponsoren lokale sportclubs.",
    }),
    draft({
      title: "Sponsor Conflict",
      primary_url: "https://honesty.example.invalid/jobs/sponsor-conflict",
      register_kvk: "50505054",
      jd_extract: "We sponsor visas. No sponsorship.",
    }),
    draft({
      title: "NL No Visa",
      primary_url: "https://honesty.example.invalid/jobs/geen-visum",
      register_kvk: "50505055",
      jd_extract: "Je moet al het recht hebben om in Nederland te werken. Geen visumsponsoring.",
    }),
  ]);

  const byKvk = async (kvk: string) => {
    const result = await connected!.client.callTool({ name: "search_jobs", arguments: { kvk } });
    return (
      result.structuredContent as {
        openings: Array<{ honesty_sponsorship_willingness: string }>;
      }
    ).openings[0];
  };

  expect(await byKvk("50505050")).toMatchObject({ honesty_sponsorship_willingness: "stated_yes" });
  expect(await byKvk("50505051")).toMatchObject({ honesty_sponsorship_willingness: "stated_no" });
  expect(await byKvk("50505052")).toMatchObject({ honesty_sponsorship_willingness: "unknown" });
  expect(await byKvk("50505053")).toMatchObject({ honesty_sponsorship_willingness: "unknown" });
  expect(await byKvk("50505054")).toMatchObject({ honesty_sponsorship_willingness: "unknown" });
  expect(await byKvk("50505055")).toMatchObject({ honesty_sponsorship_willingness: "stated_no" });
  expect(await byKvk("50505056")).toMatchObject({ honesty_sponsorship_willingness: "unknown" });
});

test("reingesting an Opening refreshes honesty from the new honesty text surface", async () => {
  const url = "https://honesty.example.invalid/jobs/refresh";
  const jobsIndex = createEmptyWritableJobsIndex();
  const first = draft({
    identity: "html:honesty:refresh",
    title: "Refresh Role",
    primary_url: url,
    register_kvk: "60606060",
    jd_extract: "Competitive salary.",
  });
  await ingestOpening(jobsIndex, first);
  connected = await connectIndex(jobsIndex);
  const before = await connected.client.callTool({ name: "get_job", arguments: { url } });
  expect(before.structuredContent).toMatchObject({
    found: true,
    honesty_salary: "unknown",
  });
  await connected.close();

  await ingestOpening(jobsIndex, {
    ...first,
    jd_extract: "Salary €4,500–€5,500 per month. Dutch not required. We sponsor HSM transfers.",
  });
  connected = await connectIndex(jobsIndex);
  const after = await connected.client.callTool({ name: "get_job", arguments: { url } });
  const searched = await connected.client.callTool({
    name: "search_jobs",
    arguments: { kvk: "60606060" },
  });
  expect(after.structuredContent).toMatchObject({
    found: true,
    honesty_salary: "€4,500–€5,500 per month",
    honesty_dutch_required: false,
    honesty_sponsorship_willingness: "stated_yes",
  });
  expect(searched.structuredContent).toMatchObject({
    openings: [
      {
        honesty_salary: "€4,500–€5,500 per month",
        honesty_dutch_required: false,
        honesty_sponsorship_willingness: "stated_yes",
      },
    ],
  });
});

async function ingestAndConnect(drafts: OpeningDraft[]): Promise<Connected> {
  const jobsIndex = createEmptyWritableJobsIndex();
  for (const opening of drafts) {
    await ingestOpening(jobsIndex, opening);
  }
  return connectIndex(jobsIndex);
}

async function connectIndex(
  jobsIndex: ReturnType<typeof createEmptyWritableJobsIndex>,
): Promise<Connected> {
  const handler = createMcpHandler(() =>
    createJobsMcpServer({ jobsIndex, hsmMcp: createStubHsmMcp() }),
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: "test-harness", version: "0.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}

function draft(
  input: Pick<OpeningDraft, "title" | "primary_url" | "register_kvk"> & Partial<OpeningDraft>,
): OpeningDraft {
  return {
    identity: input.identity ?? `html:honesty:${input.register_kvk}`,
    primary_url: input.primary_url,
    careers_url: input.careers_url ?? input.primary_url,
    ats_url: input.ats_url ?? null,
    title: input.title,
    location: input.location ?? "Amsterdam",
    jd_extract: input.jd_extract === undefined ? null : input.jd_extract,
    source_class: input.source_class ?? "ats_board",
    register_name: input.register_name ?? "Honesty Fixture B.V.",
    register_kvk: input.register_kvk,
    register_join_strength: input.register_join_strength ?? "exact_kvk",
    ats_family: input.ats_family ?? null,
    board_token: input.board_token ?? null,
    posting_id: input.posting_id ?? null,
    ats_compensation: input.ats_compensation,
    ats_structured_fields: input.ats_structured_fields,
  };
}
