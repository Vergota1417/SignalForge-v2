#!/usr/bin/env bash
set -euo pipefail

RUNTIME_PARENT="/workspaces/.signalforge-agent-runtime"
RUN="${1:-}"
if [[ -z "$RUN" ]]; then
  RUN="$(find "$RUNTIME_PARENT" -maxdepth 1 -type d -name 'stage3-*' 2>/dev/null | sort | tail -n 1 || true)"
fi
[[ -n "$RUN" && -d "$RUN" ]] || { echo "No Stage 3 runtime found."; exit 1; }

echo "===== STAGE 3 ====="
echo "RUN=$RUN"
if [[ -f "$RUN/reports/status.txt" ]]; then
  cat "$RUN/reports/status.txt"
elif [[ -f "$RUN/reports/final-status.txt" ]]; then
  cat "$RUN/reports/final-status.txt"
else
  echo "STATUS_FILE=NOT_CREATED_YET"
fi

echo
echo "===== ACTIVE PROCESSES ====="
pgrep -af 'launch-stage3-codespaces|codex exec' || echo "No Stage 3/Codex process found."

echo
echo "===== LOG TAILS ====="
for log in "$RUN"/logs/*.log; do
  [[ -f "$log" ]] || continue
  echo "--- $(basename "$log") ---"
  tail -n 8 "$log" || true
  echo
done
