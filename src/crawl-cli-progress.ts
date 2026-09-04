export type CrawlStartMode = {
  smoke: boolean;
  fullPass: boolean;
  targetLabel: string;
};

/**
 * Human-facing stderr lines printed before long crawl work.
 * Final machine-readable summary stays JSON on stdout.
 */
export function crawlStartLines(mode: CrawlStartMode): string[] {
  const target = mode.targetLabel;
  if (mode.smoke) {
    return [
      `[crawl] smoke fixture → ${target}; expect under ~1 min; JSON report at end`,
    ];
  }

  if (mode.fullPass) {
    return [
      `[crawl] LIVE full careers pass → ${target}; can take many minutes to hours (longer than a normal crawl)`,
      `[crawl] prefer public MCP (https://hsmjobs.musavvir.work/mcp) or npm run crawl:smoke for a first try`,
    ];
  }

  return [
    `[crawl] LIVE → ${target}; this may take many minutes to hours`,
    `[crawl] prefer public MCP (https://hsmjobs.musavvir.work/mcp) or npm run crawl:smoke for a first try`,
  ];
}

export type CrawlProgress = (message: string) => void;

/** Prefix mid-run progress for stderr (`[crawl] …`). */
export function crawlProgressLine(message: string): string {
  return `[crawl] ${message}`;
}
