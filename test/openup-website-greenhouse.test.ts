import { expect, test } from "vitest";
import { fingerprintBoardTokens } from "../src/board-families";
import { careersListingUrls } from "../src/html-careers";
import { isJobLikePath } from "../src/robots";
import { resolveOfficialWebsite } from "../src/website-resolution";

test("fingerprintBoardTokens reads Greenhouse EU hosts and Job Board API paths", () => {
  const html = `
    <a href="https://boards.eu.greenhouse.io/openup/jobs/4926203101?gh_jid=4926203101">Details</a>
    <div data-token-url="https://boards-api.greenhouse.io/v1/boards/openup/departments"></div>
    <script src="https://boards-api.greenhouse.io/embed/job_board/js?for=acme"></script>
  `;
  expect(fingerprintBoardTokens(html)).toEqual(
    expect.arrayContaining([
      { ats_family: "greenhouse", board_token: "openup" },
      { ats_family: "greenhouse", board_token: "acme" },
    ]),
  );
  expect(fingerprintBoardTokens(html).some((hit) => hit.board_token === "v1")).toBe(false);
});

test("careers listing probe includes /job-board", () => {
  expect(careersListingUrls("openup.com")).toContain("https://openup.com/job-board");
  expect(isJobLikePath("/job-board")).toBe(true);
  expect(isJobLikePath("/job-board/account-executive")).toBe(true);
});

test("domain guess accepts OpenUp Technologies B.V. → openup.com via brand slug", async () => {
  const pages = new Map<string, string>([
    [
      "https://openup.com/",
      "<html><body><h1>OpenUp</h1><p>Mental well-being for everyone.</p></body></html>",
    ],
  ]);
  const resolved = await resolveOfficialWebsite(
    { kvk: "76848337", name: "OpenUp Technologies B.V." },
    {
      wikidata: { websiteForKvk: async () => null },
      getPage: async (url) => {
        const body = pages.get(url);
        if (!body) return { status: 404, finalUrl: url, tlsValid: true, bodyText: "" };
        return { status: 200, finalUrl: url, tlsValid: true, bodyText: body };
      },
    },
    null,
  );
  expect(resolved).toEqual({
    official_website_host: "openup.com",
    resolved_via: "domain_guess",
  });
});
