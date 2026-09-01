#!/usr/bin/env bash
set -euo pipefail

RUNTIME_PARENT="/workspaces/.signalforge-agent-runtime"
LAUNCHER_DIR="$RUNTIME_PARENT/launcher"

latest_preflight="$(find "$LAUNCHER_DIR" -mindepth 1 -maxdepth 1 -type d -name 'preflight-*' 2>/dev/null | sort | tail -n 1 || true)"
latest_run="$(find "$RUNTIME_PARENT" -mindepth 1 -maxdepth 1 -type d -name 'stage0-*' 2>/dev/null | sort | tail -n 1 || true)"

echo "============================================================"
echo "SignalForge Stage-0 Status"
echo "============================================================"

if [[ -n "$latest_preflight" ]]; then
  echo "PREFLIGHT"
  echo "Path: $latest_preflight"
  if [[ -f "$latest_preflight/preflight-ok.txt" ]] \
    && [[ "$(tr -d '\r\n' < "$latest_preflight/preflight-ok.txt")" == "SIGNALFORGE_STAGE0_PREFLIGHT_OK" ]]; then
    echo "STATE: PASSED"
  elif [[ -f "$latest_preflight/preflight.log" ]]; then
    echo "STATE: IN PROGRESS / NOT YET PASSED"
    echo "LAST 15 PREFLIGHT LINES:"
    tail -n 15 "$latest_preflight/preflight.log" || true
  else
    echo "STATE: STARTING"
  fi
  echo
fi

if [[ -z "$latest_run" ]]; then
  echo "RESEARCH SWARM"
  echo "STATE: NOT STARTED YET"
  echo "No Stage-0 research run directory exists yet."
  echo "============================================================"
  exit 0
fi

echo "RESEARCH SWARM"
echo "Run: $(basename "$latest_run")"
echo "Path: $latest_run"
echo "------------------------------------------------------------"

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
  echo "============================================================"
  exit 0
fi

shopt -s nullglob
logs=("$logs_dir"/*.log)
if (( ${#logs[@]} == 0 )); then
  echo "No agent logs have been created yet."
  echo "============================================================"
  exit 0
fi

for log in "${logs[@]}"; do
  name="$(basename "$log" .log)"
  echo "------------------------------------------------------------"
  echo "AGENT: $name"
  echo "LOG:   $log"

  if grep -Eqi 'scope violation|error|failed|not logged in|unauthorized|authentication|panic|fatal|bwrap:' "$log"; then
    echo "STATE: FAILED / NEEDS ATTENTION"
  elif grep -Eqi 'complete|completed|final answer|done' "$log"; then
    echo "STATE: OUTPUT PRESENT"
  elif [[ -s "$log" ]]; then
    echo "STATE: WORKING / OUTPUT STREAM ACTIVE"
  else
    echo "STATE: STARTING / NO OUTPUT YET"
  fi

  echo "LAST 20 LINES:"
  tail -n 20 "$log" || true
  echo
 done

echo "============================================================"
echo "Refresh any time with:"
echo "  bash scripts/agent-team/stage0-status.sh"
echo "Or live refresh every 5 seconds with:"
echo "  watch -n 5 bash scripts/agent-team/stage0-status.sh"
echo "============================================================"
