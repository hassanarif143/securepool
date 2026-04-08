#!/usr/bin/env bash
set -euo pipefail

# P2P smoke test script
# Usage:
#   API_BASE="https://api.example.com" ./scripts/p2p-smoke.sh
#
# For authenticated checks, also set:
#   COOKIE="connect.sid=..."
#   CSRF_TOKEN="..."
#
# Optional:
#   OFFER_SIDE="buy"   # or sell

API_BASE="${API_BASE:-}"
COOKIE="${COOKIE:-}"
CSRF_TOKEN="${CSRF_TOKEN:-}"
OFFER_SIDE="${OFFER_SIDE:-buy}"

if [[ -z "$API_BASE" ]]; then
  echo "ERROR: API_BASE is required. Example:"
  echo "  API_BASE=\"https://your-api-domain.com\" ./scripts/p2p-smoke.sh"
  exit 1
fi

if [[ "$OFFER_SIDE" != "buy" && "$OFFER_SIDE" != "sell" ]]; then
  echo "ERROR: OFFER_SIDE must be 'buy' or 'sell'"
  exit 1
fi

BASE="${API_BASE%/}"

line() {
  echo "------------------------------------------------------------"
}

step() {
  echo
  echo "==> $1"
}

run_curl() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp
  tmp="$(mktemp)"

  local -a cmd=(curl -sS -i -X "$method" "$BASE$path" -o "$tmp")
  if [[ -n "$COOKIE" ]]; then
    cmd+=(-H "Cookie: $COOKIE")
  fi
  if [[ -n "$CSRF_TOKEN" ]]; then
    cmd+=(-H "x-csrf-token: $CSRF_TOKEN")
  fi
  if [[ -n "$body" ]]; then
    cmd+=(-H "Content-Type: application/json" --data "$body")
  fi

  "${cmd[@]}"
  awk 'NR<=1 || /^content-type:/I || /^set-cookie:/I || /^location:/I || /^ratelimit-/I {print}' "$tmp"
  echo
  tail -n 1 "$tmp" || true
  rm -f "$tmp"
}

line
echo "P2P smoke check for: $BASE"
line

step "Public health checks"
run_curl "GET" "/health"
run_curl "GET" "/api/health"

step "Unauth expected checks (should be 401 if no COOKIE)"
run_curl "GET" "/api/p2p/summary"
run_curl "GET" "/api/p2p/offers?side=$OFFER_SIDE"
run_curl "GET" "/api/p2p/offers/me"

if [[ -z "$COOKIE" ]]; then
  echo
  echo "No COOKIE provided. Authenticated flow checks skipped."
  echo "To run full checks, provide COOKIE and CSRF_TOKEN."
  exit 0
fi

step "Authenticated read checks"
run_curl "GET" "/api/p2p/summary"
run_curl "GET" "/api/p2p/offers?side=$OFFER_SIDE"
run_curl "GET" "/api/p2p/offers/me"
run_curl "GET" "/api/p2p/orders"

step "SSE endpoint reachability (quick check)"
echo "Opening stream for 5 seconds..."
timeout 5 curl -sS -N \
  -H "Accept: text/event-stream" \
  -H "Cookie: $COOKIE" \
  "$BASE/api/p2p/stream" | awk 'NR<=20 {print}'

echo
echo "Smoke script finished."
