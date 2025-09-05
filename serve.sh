#!/usr/bin/env bash

set -euo pipefail

# Simple static dev server for myfantasyfund
# - Serves current directory on PORT (default 8080)
# - Prefers npx http-server (no cache), falls back to Python http.server
# - Opens browser automatically

PORT="${PORT:-8080}"
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}"

kill_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti tcp:"${port}" || true)
    if [[ -n "${pids}" ]]; then
      echo "Killing processes on port ${port}: ${pids}"
      kill -9 ${pids} || true
    fi
  fi
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "${URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${URL}"
  fi
}

echo "Starting static server at ${URL}"
kill_port "${PORT}"

start_http_server() {
  if command -v npx >/dev/null 2>&1; then
    echo "Using npx http-server (no cache)"
    npx --yes http-server . --port "${PORT}" --host "${HOST}" --no-cache --cors --silent &
    echo $! > .serve_pid
  else
    echo "npx not found; falling back to Python http.server"
    if command -v python3 >/dev/null 2>&1; then
      PY=python3
    else
      PY=python
    fi
    ${PY} -m http.server "${PORT}" --bind "${HOST}" >/dev/null 2>&1 &
    echo $! > .serve_pid
  fi
}

cleanup() {
  if [[ -f .serve_pid ]]; then
    srv_pid=$(cat .serve_pid || true)
    if [[ -n "${srv_pid:-}" ]]; then
      kill ${srv_pid} 2>/dev/null || true
    fi
    rm -f .serve_pid
  fi
}

trap cleanup EXIT INT TERM

start_http_server
sleep 1
open_browser

echo "Server running. Press Ctrl+C to stop."
wait


