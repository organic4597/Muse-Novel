#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_HOST="127.0.0.1"
SERVER_PORT="${TAG_RECOMMENDER_PORT:-9877}"
SERVER_URL="http://${SERVER_HOST}:${SERVER_PORT}/health"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SERVER_SCRIPT="${ROOT_DIR}/scripts/tag_recommender_server.py"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    curl -fsS -X POST "http://${SERVER_HOST}:${SERVER_PORT}/shutdown" >/dev/null 2>&1 || true
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}

if [[ $# -eq 0 ]]; then
  echo "usage: bash scripts/run-with-tag-server.sh <command...>" >&2
  exit 1
fi

cd "${ROOT_DIR}"

if ! curl -fsS "${SERVER_URL}" >/dev/null 2>&1; then
  trap cleanup EXIT INT TERM
  "${PYTHON_BIN}" "${SERVER_SCRIPT}" --serve --port "${SERVER_PORT}" &
  SERVER_PID="$!"

  for _ in $(seq 1 240); do
    if curl -fsS "${SERVER_URL}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! curl -fsS "${SERVER_URL}" >/dev/null 2>&1; then
    echo "tag recommender server failed to start on port ${SERVER_PORT}" >&2
    exit 1
  fi
fi

"$@"