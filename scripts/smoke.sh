#!/usr/bin/env bash
# Smoke-tests a deployed API. Usage: scripts/smoke.sh [base-url]
# DEVICE_TOKEN comes from the environment or apps/web/.env.local.
# Writes one fixed heartbeat event dated 2000-01-01 (device_id "smoke-test"), so re-runs are
# duplicates and real "last seen" timestamps are never moved.
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://stefanslifelog.vercel.app}}"
ENV_FILE="$(dirname "$0")/../apps/web/.env.local"
if [[ -z "${DEVICE_TOKEN:-}" && -f "$ENV_FILE" ]]; then
  DEVICE_TOKEN="$(grep '^DEVICE_TOKEN=' "$ENV_FILE" | cut -d= -f2-)"
fi
: "${DEVICE_TOKEN:?set DEVICE_TOKEN or add it to apps/web/.env.local}"

fail=0
check() { # name, expected, actual
  if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; fail=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
auth=(-H "Authorization: Bearer $DEVICE_TOKEN")

check "ping" 200 "$(status "$BASE_URL/api/v1/ping")"
check "config without token" 401 "$(status "$BASE_URL/api/v1/config")"
check "config with token" 200 "$(status "${auth[@]}" "$BASE_URL/api/v1/config")"

batch='{"events":[{"id":"00000000-0000-4000-8000-00000000c0de","type":"heartbeat","occurred_at":"2000-01-01T00:00:00Z","device_id":"smoke-test","payload":{"app_version":"smoke","pending_count":0,"collection_paused":false,"usage_access_granted":true,"battery_optimization_ignored":true}}]}'
post() { curl -s "${auth[@]}" -H 'Content-Type: application/json' --data "$batch" "$BASE_URL/api/v1/events/batch"; }
post >/dev/null # first run stores it; afterwards it is always a duplicate
check "re-sent batch is a duplicate" '{"accepted":0,"duplicates":1,"rejected":[]}' "$(post)"
check "health with token" 200 "$(status "${auth[@]}" "$BASE_URL/api/v1/health")"

exit $fail
