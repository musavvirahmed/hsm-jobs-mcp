const JOB_LIKE_PATH =
  /^\/(jobs?|careers?|vacatures?|werken-bij|work-with-us|join-us|opportunities|openings)(\/|$)/i;

export const PRODUCT_USER_AGENT = "hsm-jobs-mcp/0.1 (opening-ingest; careers HTML fallback)";

export function isJobLikePath(pathname: string): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return JOB_LIKE_PATH.test(path);
}

export type RobotsDecision = {
  allowed: boolean;
  softIgnoredJobPath: boolean;
};

/**
 * Soft-ignore robots.txt on job-like employer paths (ADR 0001).
 * Unrelated Disallows stay in force. Prefer vendor feeds when a token is known.
 */
export function robotsAllowsPath(
  robotsTxt: string | null,
  pathname: string,
  opts?: { userAgent?: string },
): RobotsDecision {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!robotsTxt) {
    return { allowed: true, softIgnoredJobPath: false };
  }
  const ua = (opts?.userAgent ?? PRODUCT_USER_AGENT).toLowerCase();
  const disallows = disallowsForUserAgent(robotsTxt, ua);
  const blocked = disallows.some((rule) => pathMatchesRobotsRule(path, rule));
  if (!blocked) {
    return { allowed: true, softIgnoredJobPath: false };
  }
  if (isJobLikePath(path)) {
    return { allowed: true, softIgnoredJobPath: true };
  }
  return { allowed: false, softIgnoredJobPath: false };
}

function disallowsForUserAgent(robotsTxt: string, userAgent: string): string[] {
  const lines = robotsTxt.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim());
  const groups: Array<{ agents: string[]; disallows: string[] }> = [];
  let current: { agents: string[]; disallows: string[] } | null = null;

  for (const line of lines) {
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || current.disallows.length > 0 || current.agents.length === 0) {
        current = { agents: [value.toLowerCase()], disallows: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
      continue;
    }
    if (!current) continue;
    if (key === "disallow") {
      current.disallows.push(value);
    }
  }

  const specific = groups.find((group) =>
    group.agents.some((agent) => agent !== "*" && (userAgent.includes(agent) || agent.includes("hsm-jobs-mcp"))),
  );
  const star = groups.find((group) => group.agents.includes("*"));
  const chosen = specific ?? star;
  if (!chosen) return [];
  return chosen.disallows.filter((rule) => rule.length > 0);
}

function pathMatchesRobotsRule(pathname: string, rule: string): boolean {
  if (rule === "/") return true;
  if (!rule.startsWith("/")) return false;
  return pathname === rule || pathname.startsWith(rule.endsWith("/") ? rule : `${rule}`);
}
