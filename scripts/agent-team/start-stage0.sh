#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="signalforge-agent-governance-v1"

fail() {
  echo "[Stage0Auth][ERROR] $*" >&2
  exit 1
}

info() {
  echo "[Stage0Auth] $*"
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$REPO_ROOT" ]] || fail "Run this from inside the SignalForge repository."
cd "$REPO_ROOT"

[[ "${SIGNALFORGE_SANDBOX:-}" == "1" ]] || fail "Refusing to run outside the SignalForge Codespace sandbox."
[[ "$(git branch --show-current)" == "$BASE_BRANCH" ]] || fail "Expected branch $BASE_BRANCH."

if ! command -v codex >/dev/null 2>&1; then
  info "Installing the current Codex CLI inside the Codespace only..."
  npm install -g @openai/codex@latest
fi

info "Codex CLI: $(codex --version 2>/dev/null || echo unknown)"

login_status="$(codex login status 2>&1 || true)"

# IMPORTANT: `Not logged in` contains the substring `logged in`, so never use
# a loose grep here. Authentication is valid only when the status begins with
# the affirmative phrase returned by Codex.
if ! grep -Eqi '^Logged in([[:space:]]|$)' <<<"$login_status"; then
  info "Codex is not authenticated. Starting one-time device-code sign-in."
  info "Open the URL Codex prints in your normal browser, enter the code, and approve the same ChatGPT account you intend to use for Codex."
  codex login --device-auth
fi

login_status="$(codex login status 2>&1 || true)"
if ! grep -Eqi '^Logged in([[:space:]]|$)' <<<"$login_status"; then
  fail "Codex authentication did not complete. Current status: $login_status"
fi

info "$login_status"
info "Authentication gate passed. Launching Stage-0 research swarm."
exec bash "$REPO_ROOT/scripts/agent-team/launch-stage0-research.sh"
