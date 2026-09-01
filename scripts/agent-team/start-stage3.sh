#!/usr/bin/env bash
set -euo pipefail

fail(){ echo "[Stage3Start][ERROR] $*" >&2; exit 1; }
info(){ echo "[Stage3Start] $*"; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$REPO_ROOT" ]] || fail "Run this inside the SignalForge repository."
cd "$REPO_ROOT"
[[ "${SIGNALFORGE_SANDBOX:-}" == "1" ]] || fail "SIGNALFORGE_SANDBOX is not 1."
[[ "${CODESPACES:-}" == "true" ]] || fail "This launcher is allowed only inside GitHub Codespaces."
[[ "$REPO_ROOT" == /workspaces/* ]] || fail "Repository is not under /workspaces."

SOURCE="$REPO_ROOT/scripts/agent-team/launch-stage3-codespaces.sh"
[[ -f "$SOURCE" ]] || fail "Missing Stage 3 launcher."
RUNTIME_DIR="/workspaces/.signalforge-agent-runtime/launcher"
mkdir -p "$RUNTIME_DIR"
RUNTIME="$RUNTIME_DIR/launch-stage3-runtime.sh"

# Git in this Codespace does not expose cherry-pick -q. Keep the trusted
# orchestration identical but remove only that unsupported quiet flag.
sed 's/cherry-pick -q /cherry-pick /g' "$SOURCE" > "$RUNTIME"
chmod 700 "$RUNTIME"

if grep -q 'cherry-pick -q' "$RUNTIME"; then
  fail "Runtime launcher still contains unsupported cherry-pick -q."
fi
bash -n "$RUNTIME" || fail "Stage 3 runtime launcher failed shell syntax validation."

info "Stage 3 runtime launcher validated."
info "Parallel agents: Location + Path + Confirmation + UX contract."
info "Then: single integration agent → independent QA agent."
info "Production deploy: NO. Main merge: NO."
exec bash "$RUNTIME"
