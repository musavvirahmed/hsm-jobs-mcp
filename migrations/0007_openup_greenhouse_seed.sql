-- OpenUp Technologies B.V. (KvK 76848337): trade site is openup.com with Greenhouse
-- board token `openup`. Automatic website resolution previously left this KvK as
-- unresolved_website (legal-name slug ≠ brand host). Operator pin + board seed.

INSERT INTO website_overrides (kvk, mode, pin_host, updated_at)
VALUES (
  '76848337',
  'pin',
  'openup.com',
  '2026-09-15T00:00:00Z'
)
ON CONFLICT(kvk) DO UPDATE SET
  mode = excluded.mode,
  pin_host = excluded.pin_host,
  updated_at = excluded.updated_at;

INSERT INTO board_seeds (kvk, ats_family, board_token, public_board_feed_url, updated_at)
VALUES (
  '76848337',
  'greenhouse',
  'openup',
  'https://boards-api.greenhouse.io/v1/boards/openup/jobs?content=true',
  '2026-09-15T00:00:00Z'
)
ON CONFLICT(kvk, ats_family) DO UPDATE SET
  board_token = excluded.board_token,
  public_board_feed_url = excluded.public_board_feed_url,
  updated_at = excluded.updated_at;
