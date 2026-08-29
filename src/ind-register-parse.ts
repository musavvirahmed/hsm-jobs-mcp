import type { RegisterSponsor } from "./register-source";

export type ParsedIndRegister = {
  entries: RegisterSponsor[];
  indUpdatedAt: string | null;
};

/** English-month date as printed by ind.nl, e.g. "1 July 2026" -> "2026-07-01". */
export function parseIndUpdatedDate(text: string): string | null {
  const match = text.match(
    /last updated on\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );
  if (!match) return null;
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const month = months.indexOf(match[2]!.toLowerCase()) + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(parseInt(match[1]!, 10)).padStart(2, "0")}`;
}

export function parseIndRegisterHtml(html: string): ParsedIndRegister {
  const entries: RegisterSponsor[] = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells: string[] = [];
    for (const cellMatch of rowHtml.matchAll(cellPattern)) {
      cells.push(stripHtml(cellMatch[1] ?? "").replace(/\s+/g, " ").trim());
    }
    if (cells.length < 2) continue;
    const kvk = cells[cells.length - 1]!.replace(/\s+/g, "");
    const name = cells[0]!;
    if (/^\d{8}$/.test(kvk) && name.length > 0) {
      entries.push({ kvk, name });
    }
  }

  return {
    entries,
    indUpdatedAt: parseIndUpdatedDate(stripHtml(html)),
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
