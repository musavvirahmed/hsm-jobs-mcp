import type {
  HonestyDutchRequired,
  SponsorshipWillingness,
} from "./jobs-index";

export type HonestyTextSurface = {
  jdBody: string | null;
  atsCompensation: string | null;
  atsStructuredFields: string | null;
};

export type HonestyFields = {
  honesty_salary: string;
  honesty_dutch_required: HonestyDutchRequired;
  honesty_sponsorship_willingness: SponsorshipWillingness;
};

const UNKNOWN = "unknown" as const;

const SALARY_LABEL =
  /\b(?:salary|salaris|wage|compensation|remuneration|bezoldiging|loon|pay range|base(?:\s+pay)?|gross|bruto(?:salaris)?|(?:maand|jaar)salaris)\b/i;
const POISON_LABEL =
  /\b(?:signing|sign-on|sign on|welkomst(?:bonus)?|bonus|equity|stock|rsu|laptop|commute|reiskosten|telefoon|phone|pension|pensioen)\b/i;
const MONEY =
  /(?:€|eur(?:o(?:s)?)?)\s*\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\s*(?:€|eur(?:o(?:s)?)?)/gi;
const RANGE_JOIN = /\s*(?:–|—|-|tot|to|until|t\/m)\s*/i;

type SalarySpan = {
  text: string;
  amounts: number[];
  period: string;
};

const DUTCH_NOT_REQUIRED = [
  /\bdutch(?:\s+language)?\s+is\s+not\s+required\b/i,
  /\bdutch(?:\s+language)?\s+not\s+required\b/i,
  /\bno dutch(?:\s+language)? required\b/i,
  /\bdutch(?:\s+language)? is not (?:necessary|needed)\b/i,
  /\bnederlands(?:e taal)? is niet vereist\b/i,
  /\bnederlands(?:e taal)? niet vereist\b/i,
];

const DUTCH_REQUIRED = [
  /\bdutch(?:\s+language)?\s+is\s+required\b/i,
  /\bdutch(?:\s+language)?\s+required\b/i,
  /\bmust speak dutch\b/i,
  /\bfluent dutch required\b/i,
  /\bnative dutch\b/i,
  /\bnederlands(?:e taal)? is vereist\b/i,
  /\bnederlands(?:e taal)? vereist\b/i,
  /\bnederlandse taal is een must\b/i,
  /\bvloeiend nederlands (?:is )?(?:een )?vereiste\b/i,
];

const DUTCH_PREFERRED = [
  /\bdutch(?:\s+language)?(?:\s+is)?\s+preferred\b/i,
  /\bdutch(?:\s+language)? is a (?:plus|pre|pré)\b/i,
  /\bnederlands(?:e taal)? is een (?:pré|pre|plus)\b/i,
  /\bnice to have[:\s]+dutch\b/i,
  /\bdutch(?:\s+language)? is nice to have\b/i,
];

const SPONSOR_HEDGE = [
  /\bfor the right candidate\b/i,
  /\bmay (?:be )?(?:available|sponsor|consider)\b/i,
  /\bsponsorship may\b/i,
  /\bmogelijk(?:e)? sponsoring\b/i,
];

const SPONSOR_NO = [
  /\bno sponsorship\b/i,
  /\bwe do not sponsor\b/i,
  /\bcannot sponsor\b/i,
  /\bmust already have (?:a |the )?right to work\b/i,
  /\bgeen visumsponsoring\b/i,
  /\bgeen sponsoring\b/i,
  /\bje moet al het recht hebben om in nederland te werken\b/i,
];

const SPONSOR_YES = [
  /\bwe (?:will |can )?sponsor(?:s)?\s+(?:hsm|visa|visas|work permits?|kennismigrant)/i,
  /\b(?:hsm|visa|work permit) sponsorship\b/i,
  /\bsponsorship (?:is )?(?:available|provided|offered)\b/i,
  /\bwij sponsoren\s+(?:hsm|visa|visas|visum|kennismigrant)/i,
  /\bwij begeleiden de (?:hsm|kennismigrant)/i,
  /(?<!geen )\bvisumsponsoring\b/i,
];

export function extractHonesty(surface: HonestyTextSurface): HonestyFields {
  const text = honestyText(surface);
  return {
    honesty_salary: extractSalary(surface),
    honesty_dutch_required: extractDutch(text),
    honesty_sponsorship_willingness: extractSponsorship(text),
  };
}

function honestyText(surface: HonestyTextSurface): string {
  return [surface.atsCompensation, surface.atsStructuredFields, surface.jdBody]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

function extractDutch(text: string): HonestyDutchRequired {
  if (!text.trim()) return UNKNOWN;
  const required = DUTCH_REQUIRED.some((cue) => cue.test(text));
  const notRequired = DUTCH_NOT_REQUIRED.some((cue) => cue.test(text));
  const preferred = DUTCH_PREFERRED.some((cue) => cue.test(text));
  if (required && !notRequired && !preferred) return true;
  if (notRequired && !required && !preferred) return false;
  return UNKNOWN;
}

function extractSponsorship(text: string): SponsorshipWillingness {
  if (!text.trim()) return UNKNOWN;
  const hedge = SPONSOR_HEDGE.some((cue) => cue.test(text));
  const statedNo = SPONSOR_NO.some((cue) => cue.test(text));
  const statedYes = SPONSOR_YES.some((cue) => cue.test(text));
  if (hedge || (statedYes && statedNo)) return UNKNOWN;
  if (statedYes) return "stated_yes";
  if (statedNo) return "stated_no";
  return UNKNOWN;
}

function extractSalary(surface: HonestyTextSurface): string {
  const atsSpans = surface.atsCompensation
    ? spansFromChunk(surface.atsCompensation, { structured: true })
    : [];
  const bodyText = [surface.jdBody, surface.atsStructuredFields].filter(Boolean).join("\n");
  const bodySpans = bodyText ? spansFromChunk(bodyText, { structured: false }) : [];
  if (atsSpans.length && bodySpans.length) {
    const comparable = [...atsSpans, ...bodySpans];
    if (disagree(comparable)) return UNKNOWN;
  }
  const spans = [...atsSpans, ...bodySpans];
  if (spans.length === 0) return UNKNOWN;
  if (disagree(spans)) return UNKNOWN;
  return spans.reduce((shortest, span) =>
    span.text.length < shortest.text.length ? span : shortest,
  ).text;
}

function spansFromChunk(chunk: string, opts: { structured: boolean }): SalarySpan[] {
  const found: SalarySpan[] = [];
  const moneyRe = new RegExp(MONEY.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = moneyRe.exec(chunk))) {
    const start = match.index;
    let end = start + match[0].length;
    const after = chunk.slice(end);
    const join = after.match(RANGE_JOIN);
    let second: RegExpExecArray | null = null;
    if (join && join.index === 0) {
      const rest = after.slice(join[0].length);
      const secondRe = new RegExp(MONEY.source, "i");
      second = secondRe.exec(rest);
      if (second && second.index === 0) {
        end += join[0].length + second[0].length;
      } else {
        second = null;
      }
    }
    const trailing = chunk.slice(end, end + 24);
    const periodMatch = trailing.match(/^\s*(?:per|\/)\s*(month|maand|year|jaar|hour|uur|week)\b/i);
    if (periodMatch) {
      end += periodMatch[0].length;
    }
    moneyRe.lastIndex = end;
    const windowStart = Math.max(0, start - 48);
    const before = chunk.slice(windowStart, start);
    const spanText = collapseSpace(chunk.slice(start, end));
    if (POISON_LABEL.test(before) || POISON_LABEL.test(spanText)) continue;
    if (!opts.structured && !SALARY_LABEL.test(before) && !SALARY_LABEL.test(spanText)) continue;
    const amounts = [parseAmount(match[0])];
    if (second) amounts.push(parseAmount(second[0]));
    if (amounts.some((amount) => amount === null)) continue;
    found.push({
      text: spanText,
      amounts: amounts as number[],
      period: normalizePeriod(periodMatch?.[1] ?? ""),
    });
  }
  return found;
}

function disagree(spans: SalarySpan[]): boolean {
  const first = spans[0];
  return spans.some(
    (span) =>
      !periodsAgree(span.period, first.period) ||
      span.amounts.length !== first.amounts.length ||
      span.amounts.some((amount, i) => amount !== first.amounts[i]),
  );
}

function periodsAgree(a: string, b: string): boolean {
  return a === b || a === "" || b === "";
}

function parseAmount(raw: string): number | null {
  const digits = raw.replace(/[^\d.,]/g, "");
  if (!digits) return null;
  if (digits.includes(",") && digits.includes(".")) {
    const lastComma = digits.lastIndexOf(",");
    const lastDot = digits.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    const normalized = digits.split(thousandsSep).join("").replace(decimalSep, ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }
  if (/,\d{1,2}$/.test(digits)) {
    const value = Number(digits.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  if (/\.\d{1,2}$/.test(digits) && !/^\d{1,3}(\.\d{3})+\.\d{1,2}$/.test(digits)) {
    const value = Number(digits.replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  const value = Number(digits.replace(/[.,\s]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function normalizePeriod(raw: string): string {
  const value = raw.toLowerCase();
  if (value === "month" || value === "maand") return "month";
  if (value === "year" || value === "jaar") return "year";
  if (value === "hour" || value === "uur") return "hour";
  if (value === "week") return "week";
  return "";
}

function collapseSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
