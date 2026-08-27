-- Failed cautious board guesses. Negatively cached until official website or board seed
-- changes, or an operator invalidates. Clients never write this table.

CREATE TABLE board_guess_misses (
  kvk TEXT NOT NULL,
  ats_family TEXT NOT NULL,
  board_token TEXT NOT NULL,
  official_website_host TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kvk, ats_family, board_token)
);
