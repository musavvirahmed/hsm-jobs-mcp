-- Track consecutive out-of-band crawl failures for cheap alert hooks.
ALTER TABLE index_meta ADD COLUMN crawl_failure_streak INTEGER NOT NULL DEFAULT 0;
