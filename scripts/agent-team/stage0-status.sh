#!/usr/bin/env bash
set -euo pipefail

RUNTIME_PARENT="/workspaces/.signalforge-agent-runtime"

latest_run="$(find "$RUNTIME_PARENT" -mindepth 1 -maxdepth 1 -type d -name 'stage0-*' 2>/dev/null | sort | tail -n 1 || true)"

if [[ -z "$latest_run" ]]; then
  echo "[Stage0Status] No Stage-0 run found."
  exit 0
fi

echo "============================================================"
echo "SignalForge Stage-0 Status"
echo "Run: $(basename "$latest_run")"
echo "Path: $latest_run"
echo "============================================================"

if [[ -f "$latest_run/reports/run-info.txt" ]]; then
  cat "$latest_run/reports/run-info.txt"
  echo
fi

if [[ -f "$latest_run/reports/final-status.txt" ]]; then
  echo "FINAL STATUS"
  cat "$latest_run/reports/final-status.txt"
  echo
fi

logs_dir="$latest_run/logs"
if [[ ! -d "$logs_dir" ]]; then
  echo "No agent logs directory exists yet."
  exit 0
fi

shopt -s nullglob
logs=("$logs_dir"/*.log)
if (( ${#logs[@]} == 0 )); then
  echo "No agent logs have been created yet."
  exit 0
fi

for log in "${logs[@]}"; do
  name="$(basename "$log" .log)"
  echo "------------------------------------------------------------"
  echo "AGENT: $name"
  echo "LOG:   $log"

  if grep -Eqi 'scope violation|error|failed|not logged in|unauthorized|authentication|panic|fatal' "$log"; then
    echo "STATE: FAILED / NEEDS ATTENTION"
  elif grep -Eqi 'complete|completed|final answer|done' "$log"; then
    echo "STATE: OUTPUT PRESENT"
  elif [[ -s "$log" ]]; then
    echo "STATE: LOG PRESENT (may still be working or may have exited)"
  else
    echo "STATE: NO OUTPUT"
  fi

  echo "LAST 20 LINES:"
  tail -n 20 "$log" || true
  echo
 done

echo "============================================================"
echo "Tip: rerun this command any time:"
echo "  bash scripts/agent-team/stage0-status.sh"
echo "============================================================"
