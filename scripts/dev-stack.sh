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

cleanup() {
  echo ""
  echo "Stopping API server (pid $API_PID)..."
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting frontend (PORT=$FE_PORT, BASE_PATH=$BASE_PATH)..."
PORT="$FE_PORT" BASE_PATH="$BASE_PATH" pnpm --filter @workspace/usdtluck run dev
