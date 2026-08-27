-- Operator-curated employer → board token / public board feed.
-- Complements fingerprinting; does not claim complete coverage. Clients never write this table.

CREATE TABLE board_seeds (
  kvk TEXT NOT NULL,
  ats_family TEXT NOT NULL,
  board_token TEXT NOT NULL,
  public_board_feed_url TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kvk, ats_family)
);

INSERT INTO board_seeds (kvk, ats_family, board_token, public_board_feed_url, updated_at)
VALUES (
  '60733144',
  'ashby',
  'rentman',
  'https://api.ashbyhq.com/posting-api/job-board/rentman?includeCompensation=true',
  '2026-08-27T00:00:00Z'
);
