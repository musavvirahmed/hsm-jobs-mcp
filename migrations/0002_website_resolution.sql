-- Accepted official websites (website resolution succeeded; extraction may still be open)
-- and operator website overrides. Clients never write these tables.

CREATE TABLE official_websites (
  kvk TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE website_overrides (
  kvk TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('pin', 'force_unresolved')),
  pin_host TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (mode = 'pin' AND pin_host IS NOT NULL)
    OR (mode = 'force_unresolved' AND pin_host IS NULL)
  )
);
