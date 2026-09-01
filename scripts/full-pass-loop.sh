#!/usr/bin/env bash
# Unattended full careers pass: re-invoke capped crawl:full-pass until
# missing_terminal_outcomes_after is 0, then stop.
#
# Production (default):
#   tmux new -s crawl
#   ./scripts/full-pass-loop.sh
#
# Smoke dry-run (fixture register, no remote D1):
#   CRAWL_SMOKE=1 ./scripts/full-pass-loop.sh
#
# Tunables (env):
#   FULL_PASS_LOOP_BATCH          KvKs per invocation (default 200)
#   FULL_PASS_LOOP_PAUSE          Seconds between successful batches (default 30)
#   FULL_PASS_LOOP_FAIL_BACKOFF   Seconds after a failed run (default 120)
#   FULL_PASS_LOOP_MAX_CONSEC_FAILS  Abort after N consecutive failures (default 10)
#   JOBS_INDEX_TARGET             Default remote-d1 (ignored when CRAWL_SMOKE=1)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v caffeinate >/dev/null 2>&1 && [[ -z "${FULL_PASS_LOOP_CAFFEINATED:-}" ]]; then
  export FULL_PASS_LOOP_CAFFEINATED=1
  exec caffeinate -is -- "$0" "$@"
fi

BATCH="${FULL_PASS_LOOP_BATCH:-200}"
PAUSE="${FULL_PASS_LOOP_PAUSE:-30}"
FAIL_BACKOFF="${FULL_PASS_LOOP_FAIL_BACKOFF:-120}"
MAX_CONSEC_FAILS="${FULL_PASS_LOOP_MAX_CONSEC_FAILS:-10}"
TARGET="${JOBS_INDEX_TARGET:-remote-d1}"

LOG_DIR=".scratch/full-pass-logs"
mkdir -p "$LOG_DIR"
STARTED_AT="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="${LOG_DIR}/full-pass-${STARTED_AT}.log"

consec_fails=0
iteration=0

log() {
  printf '[full-pass-loop] %s\n' "$*" | tee -a "$LOG_FILE" >&2
}

parse_missing_after() {
  local out_file="$1"
  node --input-type=module -e '
import { readFileSync } from "node:fs";
const text = readFileSync(process.argv[1], "utf8");
const marker = "\"missing_terminal_outcomes_after\"";
const markerAt = text.lastIndexOf(marker);
if (markerAt < 0) {
  console.error("missing_terminal_outcomes_after not found in crawl stdout");
  process.exit(2);
}
let start = text.lastIndexOf("{", markerAt);
if (start < 0) {
  console.error("no JSON object start before missing_terminal_outcomes_after");
  process.exit(2);
}
let depth = 0;
let end = -1;
for (let i = start; i < text.length; i += 1) {
  const ch = text[i];
  if (ch === "{") depth += 1;
  else if (ch === "}") {
    depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
}
if (end < 0) {
  console.error("unterminated crawl JSON object");
  process.exit(2);
}
let value;
try {
  value = JSON.parse(text.slice(start, end + 1));
} catch (err) {
  console.error(`failed to parse crawl JSON: ${err instanceof Error ? err.message : err}`);
  process.exit(2);
}
if (typeof value.missing_terminal_outcomes_after !== "number") {
  console.error("missing_terminal_outcomes_after missing or not a number");
  process.exit(2);
}
process.stdout.write(String(value.missing_terminal_outcomes_after));
' "$out_file"
}

log "starting (batch=${BATCH} pause=${PAUSE}s fail_backoff=${FAIL_BACKOFF}s target=${TARGET} smoke=${CRAWL_SMOKE:-0})"
log "log file: ${LOG_FILE}"

while true; do
  iteration=$((iteration + 1))
  tmp_out="$(mktemp)"
  # Named pipe so [crawl] stderr streams live to the terminal and the log
  # (redirecting to a temp file hid progress until each batch finished).
  err_fifo="$(mktemp -u "${TMPDIR:-/tmp}/full-pass-err.XXXXXX")"
  mkfifo "$err_fifo"
  tee -a "$LOG_FILE" <"$err_fifo" >&2 &
  tee_pid=$!
  log "iteration ${iteration}: crawl:full-pass CRAWL_MAX_ATTEMPTS=${BATCH}"

  set +e
  CRAWL_MAX_ATTEMPTS="${BATCH}" \
    JOBS_INDEX_TARGET="${TARGET}" \
    CRAWL_FULL_PASS=1 \
    npm run --silent crawl:full-pass > >(tee -a "$LOG_FILE" "$tmp_out") 2>"$err_fifo"
  rc=$?
  set -e

  wait "$tee_pid" 2>/dev/null || true
  rm -f "$err_fifo"

  if [[ "$rc" -ne 0 ]]; then
    consec_fails=$((consec_fails + 1))
    log "crawl exited ${rc} (consecutive failures: ${consec_fails}/${MAX_CONSEC_FAILS})"
    rm -f "${tmp_out}"
    if [[ "$consec_fails" -ge "$MAX_CONSEC_FAILS" ]]; then
      log "aborting after ${MAX_CONSEC_FAILS} consecutive failures — fix the crawl, then re-run this script"
      exit 1
    fi
    log "backing off ${FAIL_BACKOFF}s before retry (resume skips completed KvKs)"
    sleep "${FAIL_BACKOFF}"
    continue
  fi

  consec_fails=0

  if ! missing_after="$(parse_missing_after "${tmp_out}")"; then
    rm -f "${tmp_out}"
    consec_fails=$((consec_fails + 1))
    log "could not read missing_terminal_outcomes_after (consecutive failures: ${consec_fails}/${MAX_CONSEC_FAILS})"
    if [[ "$consec_fails" -ge "$MAX_CONSEC_FAILS" ]]; then
      log "aborting after ${MAX_CONSEC_FAILS} consecutive failures"
      exit 1
    fi
    sleep "${FAIL_BACKOFF}"
    continue
  fi
  rm -f "${tmp_out}"

  log "missing_terminal_outcomes_after=${missing_after}"

  if [[ "$missing_after" -eq 0 ]]; then
    log "full careers pass complete (missing=0)"
    log "next: run npm run shared-release:verify manually, then soften README public-site copy if verify passes"
    printf '\n=== full careers pass complete ===\n' >&2
    printf 'missing_terminal_outcomes_after=0\n' >&2
    printf 'Run: npm run shared-release:verify\n\n' >&2
    exit 0
  fi

  log "pausing ${PAUSE}s before next batch"
  sleep "${PAUSE}"
done
