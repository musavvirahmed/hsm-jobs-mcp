-- Cut D1 rows_read: board refresh stops full-scanning openings; status/health
-- stop COUNT(*) / UNION over the corpus on every call.
-- Counters are maintained by the crawl write plane; snapshot reads them from meta.

CREATE INDEX IF NOT EXISTS openings_by_board ON openings (ats_family, board_token);

ALTER TABLE index_meta ADD COLUMN jobs_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE index_meta ADD COLUMN sponsors_attempted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE index_meta ADD COLUMN sponsors_with_openings INTEGER NOT NULL DEFAULT 0;

UPDATE index_meta
SET
  jobs_count = (SELECT COUNT(*) FROM openings),
  sponsors_attempted = (
    SELECT COUNT(*) FROM (
      SELECT kvk FROM terminal_careers_outcomes
      UNION
      SELECT kvk FROM official_websites
    )
  ),
  sponsors_with_openings = (
    SELECT COUNT(*) FROM terminal_careers_outcomes WHERE outcome = 'openings_indexed'
  )
WHERE singleton = 1;
