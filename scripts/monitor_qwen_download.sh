#!/usr/bin/env bash

set -euo pipefail

CACHE_DIR="${HOME}/.cache/huggingface/hub/models--Qwen--Qwen2.5-14B"
LOG_FILE="${1:-/tmp/qwen-download-progress.log}"
POLL_SECONDS="${POLL_SECONDS:-30}"
STEP_PERCENT="${STEP_PERCENT:-3}"

if [[ ! -d "${CACHE_DIR}" ]]; then
  echo "cache directory not found: ${CACHE_DIR}" >&2
  exit 1
fi

baseline_kb=$(du -sk "${CACHE_DIR}" | awk '{print $1}')
incomplete_total_bytes=$(find "${CACHE_DIR}/blobs" -name '*.incomplete' -printf '%s\n' 2>/dev/null | awk '{sum += $1} END {print sum + 0}')

if [[ "${incomplete_total_bytes}" -le 0 ]]; then
  echo "no incomplete files detected; nothing to monitor" >&2
  exit 0
fi

target_kb=$(( baseline_kb + (incomplete_total_bytes / 1024) ))
last_reported=0

printf 'started=%s baseline_kb=%s target_kb=%s step=%s%%\n' \
  "$(date '+%F %T')" "${baseline_kb}" "${target_kb}" "${STEP_PERCENT}" > "${LOG_FILE}"

while true; do
  current_kb=$(du -sk "${CACHE_DIR}" | awk '{print $1}')

  if [[ "${current_kb}" -ge "${target_kb}" ]]; then
    printf '[%s] 100%% (%s/%s KB) complete\n' \
      "$(date '+%F %T')" "${current_kb}" "${target_kb}" >> "${LOG_FILE}"
    break
  fi

  progress=$(( (current_kb - baseline_kb) * 100 / (target_kb - baseline_kb) ))
  if [[ "${progress}" -lt 0 ]]; then
    progress=0
  fi

  if [[ "${progress}" -ge $(( last_reported + STEP_PERCENT )) ]]; then
    milestone=$(( (progress / STEP_PERCENT) * STEP_PERCENT ))
    printf '[%s] %s%% (%s/%s KB)\n' \
      "$(date '+%F %T')" "${milestone}" "${current_kb}" "${target_kb}" >> "${LOG_FILE}"
    last_reported="${milestone}"
  fi

  sleep "${POLL_SECONDS}"
done