#!/bin/sh
set -eu

# Frontend requires these in vite.config.ts; provide safe local defaults.
PORT="${PORT:-5173}"
BASE_PATH="${BASE_PATH:-/}"
export PORT BASE_PATH

echo "Starting API server..."
pnpm --filter @workspace/api-server run dev &
API_PID=$!

cleanup() {
  echo ""
  echo "Stopping API server..."
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting frontend on PORT=$PORT BASE_PATH=$BASE_PATH ..."
pnpm --filter @workspace/usdtluck run dev
