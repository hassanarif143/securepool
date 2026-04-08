#!/usr/bin/env bash
set -euo pipefail

# Cashout Arena smoke test script
# Usage:
#   API_BASE="https://api.example.com" ./scripts/cashout-arena-smoke.sh
#
# For authenticated checks:
#   COOKIE="connect.sid=..."
#   CSRF_TOKEN="..."
#
# Optional:
#   PLACE_BET=1            # place a real bet (default: 0)
#   AUTO_CASHOUT_AT=1.2    # used when PLACE_BET=1
#   STAKE_AMOUNT=1         # 1..5
#   TRY_MANUAL_CASHOUT=0   # when 1, script attempts /cashout right after bet

API_BASE="${API_BASE:-}"
COOKIE="${COOKIE:-}"
CSRF_TOKEN="${CSRF_TOKEN:-}"
PLACE_BET="${PLACE_BET:-0}"
AUTO_CASHOUT_AT="${AUTO_CASHOUT_AT:-1.2}"
STAKE_AMOUNT="${STAKE_AMOUNT:-1}"
TRY_MANUAL_CASHOUT="${TRY_MANUAL_CASHOUT:-0}"

if [[ -z "$API_BASE" ]]; then
  echo "ERROR: API_BASE is required."
  echo "Example:"
  echo "  API_BASE=\"https://your-api-domain.com\" ./scripts/cashout-arena-smoke.sh"
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

json_get() {
  local json="$1"
  local path="$2"
  python3 - "$json" "$path" <<'PY'
import json, sys
raw = sys.argv[1]
path = sys.argv[2].split(".")
try:
    v = json.loads(raw)
    for p in path:
        if p == "":
            continue
        if p.endswith("]") and "[" in p:
            name = p[:p.index("[")]
            idx = int(p[p.index("[")+1:-1])
            if name:
                v = v[name]
            v = v[idx]
        else:
            v = v[p]
    if isinstance(v, (dict, list)):
        print(json.dumps(v))
    else:
        print(v)
except Exception:
    print("")
PY
}

request_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp
  tmp="$(mktemp)"

  local -a cmd=(curl -sS -X "$method" "$BASE$path" -w "\n__STATUS__:%{http_code}")
  if [[ -n "$COOKIE" ]]; then
    cmd+=(-H "Cookie: $COOKIE")
  fi
  if [[ -n "$CSRF_TOKEN" ]]; then
    cmd+=(-H "x-csrf-token: $CSRF_TOKEN")
  fi
  if [[ -n "$body" ]]; then
    cmd+=(-H "Content-Type: application/json" --data "$body")
  fi

  "${cmd[@]}" > "$tmp"
  local status
  status="$(awk -F: '/__STATUS__:/ {print $2}' "$tmp" | tr -d '\r' | tail -n 1)"
  local response
  response="$(awk '/__STATUS__:/ {exit} {print}' "$tmp")"
  rm -f "$tmp"

  echo "$status"
  echo "$response"
}

print_call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local out
  out="$(request_json "$method" "$path" "$body")"
  local status="${out%%$'\n'*}"
  local payload="${out#*$'\n'}"
  [[ "$payload" == "$out" ]] && payload=""
  echo "$method $path -> $status"
  if [[ -n "$payload" ]]; then
    echo "$payload"
  fi
  echo
}

line
echo "Cashout Arena smoke check for: $BASE"
line

step "Public health checks"
print_call "GET" "/health"
print_call "GET" "/api/health"

step "Arena state quick check (unauth may be 401)"
print_call "GET" "/api/cashout-arena/state"

if [[ -z "$COOKIE" ]]; then
  echo "No COOKIE provided. Authenticated checks skipped."
  exit 0
fi

step "Authenticated state check"
state_out="$(request_json "GET" "/api/cashout-arena/state")"
state_status="${state_out%%$'\n'*}"
state_json="${state_out#*$'\n'}"
[[ "$state_json" == "$state_out" ]] && state_json=""
echo "GET /api/cashout-arena/state -> $state_status"
echo "$state_json"
echo

if [[ "$state_status" -lt 200 || "$state_status" -ge 300 ]]; then
  echo "State endpoint failed. Stop."
  exit 1
fi

round_id="$(json_get "$state_json" "round.id")"
multiplier="$(json_get "$state_json" "round.multiplier")"
wallet="$(json_get "$state_json" "wallet.withdrawableBalance")"
echo "Parsed: round.id=$round_id multiplier=$multiplier withdrawable=$wallet"

if [[ "$PLACE_BET" != "1" ]]; then
  echo
  echo "PLACE_BET=0 so no real wager executed."
  echo "Use PLACE_BET=1 to test live /bet and optional /cashout."
  exit 0
fi

step "Place bet (real wallet action)"
bet_body="{\"stakeAmount\":$STAKE_AMOUNT,\"autoCashoutAt\":$AUTO_CASHOUT_AT}"
bet_out="$(request_json "POST" "/api/cashout-arena/bet" "$bet_body")"
bet_status="${bet_out%%$'\n'*}"
bet_json="${bet_out#*$'\n'}"
[[ "$bet_json" == "$bet_out" ]] && bet_json=""
echo "POST /api/cashout-arena/bet -> $bet_status"
echo "$bet_json"
echo

if [[ "$bet_status" -lt 200 || "$bet_status" -ge 300 ]]; then
  echo "Bet request failed. Stop."
  exit 1
fi

bet_id="$(json_get "$bet_json" "betId")"
echo "Parsed: betId=$bet_id"

if [[ "$TRY_MANUAL_CASHOUT" != "1" ]]; then
  echo
  echo "TRY_MANUAL_CASHOUT=0 so manual cashout call skipped."
  echo "Bet should settle automatically by auto cashout or crash."
  exit 0
fi

if [[ -z "$bet_id" ]]; then
  echo "No betId parsed; cannot test manual cashout."
  exit 1
fi

step "Manual cashout attempt"
co_out="$(request_json "POST" "/api/cashout-arena/bets/$bet_id/cashout")"
co_status="${co_out%%$'\n'*}"
co_json="${co_out#*$'\n'}"
[[ "$co_json" == "$co_out" ]] && co_json=""
echo "POST /api/cashout-arena/bets/$bet_id/cashout -> $co_status"
echo "$co_json"
echo

echo "Cashout Arena smoke script finished."
