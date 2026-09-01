#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "[Stage0Codespaces][ERROR] $*" >&2
  exit 1
}

info() {
  echo "[Stage0Codespaces] $*"
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$REPO_ROOT" ]] || fail "Run this from inside the SignalForge repository."
cd "$REPO_ROOT"

# This fallback deliberately disables Codex's *inner* Linux bubblewrap sandbox
# because GitHub Codespaces blocks the user-namespace operation it requires.
# It is NEVER allowed on a local workstation. The GitHub Codespace/container is
# the outer security boundary for this run.
[[ "${SIGNALFORGE_SANDBOX:-}" == "1" ]] || fail "SIGNALFORGE_SANDBOX is not 1."
[[ "${CODESPACES:-}" == "true" ]] || fail "This fallback is allowed only inside GitHub Codespaces (CODESPACES=true)."
[[ "$REPO_ROOT" == /workspaces/* ]] || fail "Repository is not under /workspaces; refusing inner-sandbox bypass."

SOURCE="$REPO_ROOT/scripts/agent-team/launch-stage0-research.sh"
[[ -f "$SOURCE" ]] || fail "Missing launcher: $SOURCE"

RUNTIME_DIR="/workspaces/.signalforge-agent-runtime/launcher"
mkdir -p "$RUNTIME_DIR"
RUNTIME_LAUNCHER="$RUNTIME_DIR/launch-stage0-codespaces-runtime.sh"

# Codex workspace-write currently fails in Codespaces with:
#   bwrap: No permissions to create new namespace
# Replace only the Codex inner sandbox mode at runtime. The repository launcher
# remains unchanged and continues to enforce secret checks, isolated worktrees,
# exact output-path validation, trusted commits, and no production deployment.
sed 's/--sandbox workspace-write/--sandbox danger-full-access/g' \
  "$SOURCE" > "$RUNTIME_LAUNCHER"
chmod 700 "$RUNTIME_LAUNCHER"

if grep -q -- '--sandbox workspace-write' "$RUNTIME_LAUNCHER"; then
  fail "Could not remove the incompatible inner workspace-write sandbox."
fi

if ! grep -q -- '--sandbox danger-full-access' "$RUNTIME_LAUNCHER"; then
  fail "Runtime launcher does not contain the expected Codespaces fallback."
fi

info "Using GitHub Codespace as the outer sandbox boundary."
info "Codex inner mode: danger-full-access INSIDE THIS CODESPACE ONLY."
info "Local PC access: NO. Production deployment: NO. Main merge: NO."
info "The normal Stage-0 secret checks, isolated worktrees, and exact-file validation remain active."

# Tiny one-agent capability probe before spending a full research wave.
# It runs in a disposable empty directory outside the repository and must create
# exactly one marker file. If this fails, no research agents are launched.
PREFLIGHT_DIR="$RUNTIME_DIR/preflight-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$PREFLIGHT_DIR"
PREFLIGHT_LOG="$PREFLIGHT_DIR/preflight.log"
PREFLIGHT_TIMEOUT_SECONDS=180

info "Running one small Codex read/write preflight before launching the swarm..."
info "Preflight timeout: ${PREFLIGHT_TIMEOUT_SECONDS}s"
info "Preflight log: $PREFLIGHT_LOG"

if ! (
  cd "$PREFLIGHT_DIR"
  env -i \
    HOME="$HOME" \
    USER="${USER:-node}" \
    PATH="$PATH" \
    LANG="${LANG:-C.UTF-8}" \
    TERM="${TERM:-dumb}" \
    SIGNALFORGE_SANDBOX="1" \
    CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
    timeout --signal=TERM "${PREFLIGHT_TIMEOUT_SECONDS}s" \
      codex exec --ephemeral --sandbox danger-full-access \
      "This is a capability preflight in a disposable empty directory. Do not access the repository, Git, GitHub, providers, or the network except what Codex itself requires. Create exactly one file named preflight-ok.txt containing exactly SIGNALFORGE_STAGE0_PREFLIGHT_OK and then stop." \
      >"$PREFLIGHT_LOG" 2>&1
); then
  tail -n 40 "$PREFLIGHT_LOG" >&2 || true
  fail "Codex preflight command failed or timed out after ${PREFLIGHT_TIMEOUT_SECONDS}s. No research agents were launched."
fi

[[ -f "$PREFLIGHT_DIR/preflight-ok.txt" ]] || {
  tail -n 40 "$PREFLIGHT_LOG" >&2 || true
  fail "Codex preflight did not create preflight-ok.txt. No research agents were launched."
}

[[ "$(tr -d '\r\n' < "$PREFLIGHT_DIR/preflight-ok.txt")" == "SIGNALFORGE_STAGE0_PREFLIGHT_OK" ]] || {
  tail -n 40 "$PREFLIGHT_LOG" >&2 || true
  fail "Codex preflight marker content was incorrect. No research agents were launched."
}

mapfile -t PREFLIGHT_FILES < <(find "$PREFLIGHT_DIR" -maxdepth 1 -type f -printf '%f\n' | sort)
# preflight.log is written by the trusted wrapper; preflight-ok.txt is the only
# file the agent is expected to create.
if (( ${#PREFLIGHT_FILES[@]} != 2 )) || [[ "${PREFLIGHT_FILES[0]}" != "preflight-ok.txt" ]] || [[ "${PREFLIGHT_FILES[1]}" != "preflight.log" ]]; then
  printf '[Stage0Codespaces][ERROR] Unexpected preflight files:\n' >&2
  printf '  %s\n' "${PREFLIGHT_FILES[@]}" >&2
  fail "Codex preflight exceeded its disposable-file scope. No research agents were launched."
fi

info "Codex preflight PASSED. Starting research swarm."
exec bash "$RUNTIME_LAUNCHER"
