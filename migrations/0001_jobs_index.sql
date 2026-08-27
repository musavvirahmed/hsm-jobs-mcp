-- Durable jobs index: Openings + terminal careers outcomes + crawl metadata.
-- Same schema for private wrangler and shared. Tools only read this store.

CREATE TABLE index_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  pass TEXT NOT NULL CHECK (pass IN ('partial', 'full_careers_pass')) DEFAULT 'partial',
  register_size INTEGER NOT NULL DEFAULT 0,
  register_as_of TEXT,
  last_successful_crawl TEXT,
  source_policy TEXT NOT NULL,
  register_join_note TEXT NOT NULL
);

INSERT INTO index_meta (
  singleton,
  pass,
  register_size,
  source_policy,
  register_join_note
) VALUES (
  1,
  'partial',
  0,
  'first-party careers/ATS only',
  'Hybrid KvK re-validation via upstream hsm-mcp at query time; last-known join plus visible stale/error on degrade.'
);

CREATE TABLE terminal_careers_outcomes (
  kvk TEXT PRIMARY KEY,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'openings_indexed',
    'unresolved_website',
    'no_careers_site',
    'no_matching_public_board',
    'blocked',
    'unsupported_extractor'
  )),
  official_website_host TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE openings (
  identity TEXT PRIMARY KEY,
  primary_url TEXT NOT NULL UNIQUE,
  careers_url TEXT,
  ats_url TEXT,
  title TEXT NOT NULL,
  location TEXT,
  jd_extract TEXT,
  source_class TEXT NOT NULL CHECK (source_class IN ('careers_site', 'ats_board', 'aggregator', 'unknown')),
  honesty_salary TEXT NOT NULL,
  honesty_dutch_required TEXT NOT NULL CHECK (honesty_dutch_required IN ('true', 'false', 'unknown')),
  honesty_sponsorship_willingness TEXT NOT NULL CHECK (
    honesty_sponsorship_willingness IN ('stated_yes', 'stated_no', 'unknown')
  ),
  register_name TEXT,
  register_kvk TEXT,
  register_join_strength TEXT CHECK (
    register_join_strength IS NULL
    OR register_join_strength IN ('exact_kvk', 'strong_name', 'weak', 'unmatched')
  ),
  ats_family TEXT,
  board_token TEXT,
  posting_id TEXT
);
