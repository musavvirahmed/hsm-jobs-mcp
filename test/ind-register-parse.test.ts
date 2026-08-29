import { expect, test } from "vitest";
import { parseIndRegisterHtml, parseIndUpdatedDate } from "../src/ind-register-parse";

test("parseIndUpdatedDate reads IND last-updated sentence", () => {
  expect(parseIndUpdatedDate("The overview was last updated on 3 August 2026.")).toBe("2026-08-03");
});

test("parseIndRegisterHtml extracts organisation and KvK rows", () => {
  const html = `
    <html><body>
      <p>The overview was last updated on 3 August 2026.</p>
      <table>
        <tr><th scope="row">Rentman B.V.</th><td>60733144</td></tr>
        <tr><th scope="row">Adyen N.V.</th><td>34259528</td></tr>
        <tr><th>Organisation</th><th>KVK number</th></tr>
      </table>
    </body></html>
  `;
  const parsed = parseIndRegisterHtml(html);
  expect(parsed.indUpdatedAt).toBe("2026-08-03");
  expect(parsed.entries).toEqual([
    { name: "Rentman B.V.", kvk: "60733144" },
    { name: "Adyen N.V.", kvk: "34259528" },
  ]);
});
