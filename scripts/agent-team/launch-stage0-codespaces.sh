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

exec bash "$RUNTIME_LAUNCHER"
