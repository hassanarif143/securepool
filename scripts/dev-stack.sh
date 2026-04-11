#!/bin/sh
set -eu

# API and frontend must use different ports (Vite proxies /api → localhost:8080).
API_PORT="${API_PORT:-8080}"
FE_PORT="${FE_PORT:-5173}"
BASE_PATH="${BASE_PATH:-/}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Starting API (PORT=$API_PORT) — load env from artifacts/api-server/.env if present..."
PORT="$API_PORT" pnpm --filter @workspace/api-server run dev &
API_PID=$!

echo "Waiting for API at http://127.0.0.1:$API_PORT/health ..."
i=0
while [ "$i" -lt 120 ]; do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    echo "API is ready."
    break
  fi
  i=$((i + 1))
  sleep 1
done
if ! curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
  echo "Warning: API did not respond on /health — Vite may show proxy errors until the API is up." >&2
fi

cleanup() {
  echo ""
  echo "Stopping API server (pid $API_PID)..."
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting frontend (PORT=$FE_PORT, BASE_PATH=$BASE_PATH)..."
PORT="$FE_PORT" BASE_PATH="$BASE_PATH" pnpm --filter @workspace/usdtluck run dev
