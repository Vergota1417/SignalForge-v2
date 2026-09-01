#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="signalforge-agent-governance-v1"
RUNTIME_PARENT="/workspaces/.signalforge-agent-runtime"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

fail() { echo "[Stage0Integrate][ERROR] $*" >&2; exit 1; }
info() { echo "[Stage0Integrate] $*"; }

[[ -n "$REPO_ROOT" ]] || fail "Run this from inside the SignalForge repository."
cd "$REPO_ROOT"
[[ "${SIGNALFORGE_SANDBOX:-}" == "1" ]] || fail "SIGNALFORGE_SANDBOX is not 1."
[[ "${CODESPACES:-}" == "true" ]] || fail "Integration resume is allowed only inside GitHub Codespaces."
[[ "$REPO_ROOT" == /workspaces/* ]] || fail "Repository is not under /workspaces."
[[ "$(git branch --show-current)" == "$BASE_BRANCH" ]] || fail "Expected branch $BASE_BRANCH."
command -v codex >/dev/null || fail "Codex CLI is missing."

if pgrep -af 'recover-stage0-current|launch-stage0-research|codex exec' >/dev/null 2>&1; then
  echo "[Stage0Integrate][ERROR] Another Stage-0/Codex process appears to be running:" >&2
  pgrep -af 'recover-stage0-current|launch-stage0-research|codex exec' >&2 || true
  exit 2
fi

LATEST_RUN="$(find "$RUNTIME_PARENT" -mindepth 1 -maxdepth 1 -type d -name 'stage0-*' 2>/dev/null | sort | tail -n 1 || true)"
[[ -n "$LATEST_RUN" ]] || fail "No Stage-0 run was found."
RUN_NAME="$(basename "$LATEST_RUN")"
RUN_ID="${RUN_NAME#stage0-}"
RUN_INFO="$LATEST_RUN/reports/run-info.txt"
[[ -f "$RUN_INFO" ]] || fail "Missing run-info.txt for $RUN_NAME."
BASE_SHA="$(sed -n 's/^base_sha=//p' "$RUN_INFO" | head -n 1)"
[[ -n "$BASE_SHA" ]] || fail "Could not determine base SHA."

BR_INV="agent/stage0-$RUN_ID-investment-architect"
BR_VIDEO="agent/stage0-$RUN_ID-video-method-auditor"
BR_DATA="agent/stage0-$RUN_ID-data-feasibility"
BR_UX="agent/stage0-$RUN_ID-beginner-ux"
BR_QUANT="agent/stage0-$RUN_ID-quant-challenger"
BR_RISK="agent/stage0-$RUN_ID-risk-officer"
BR_INT="agent/stage0-$RUN_ID-integration"

info "Resuming integration only for $RUN_NAME"
info "Wave 1 and Wave 2 will NOT be rerun."

# Require all six completed research branches to exist remotely before integration.
for branch in "$BR_INV" "$BR_VIDEO" "$BR_DATA" "$BR_UX" "$BR_QUANT" "$BR_RISK"; do
  git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1 \
    || fail "Required completed research branch is not published: $branch"
done

# Refresh remote refs so the integration agent can inspect all six reports locally.
git fetch -q origin \
  "$BR_INV" "$BR_VIDEO" "$BR_DATA" "$BR_UX" "$BR_QUANT" "$BR_RISK" "$BASE_BRANCH"

REPORT_REL="docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md"
WT_INT="$LATEST_RUN/worktrees/integration"
LOG_INT="$LATEST_RUN/logs/integration.log"
STATUS_FILE="$LATEST_RUN/reports/integration-status.txt"
INT_PROMPT="$LATEST_RUN/prompts/stage0-integrator-resume-resolved.md"
mkdir -p "$LATEST_RUN/reports" "$LATEST_RUN/prompts" "$LATEST_RUN/logs"

# Build a prompt that points at the actual published remote refs. The final safety
# override is authoritative: Codex writes one report only; the trusted wrapper
# handles commit and push after exact-path validation.
sed \
  -e "s|agent/stage0-investment-architect|origin/$BR_INV|g" \
  -e "s|agent/stage0-video-method-auditor|origin/$BR_VIDEO|g" \
  -e "s|agent/stage0-data-feasibility|origin/$BR_DATA|g" \
  -e "s|agent/stage0-beginner-ux|origin/$BR_UX|g" \
  -e "s|agent/stage0-quant-challenger|origin/$BR_QUANT|g" \
  -e "s|agent/stage0-risk-officer|origin/$BR_RISK|g" \
  "$REPO_ROOT/docs/agent-team/prompts/stage0-integrator.md" > "$INT_PROMPT"
cat >> "$INT_PROMPT" <<'EOF'

---
## Integration-resume safety override — authoritative for this run
Do not run git add, git commit, git push, gh, deployment commands, or commands that write Git metadata. Create exactly `docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md` and leave it as an uncommitted worktree change. The trusted wrapper validates, commits, and publishes it after you exit. Do not modify any other file.
EOF

# Reuse the failed integration worktree only if it is still exactly at the
# original base and has no changes. Otherwise stop rather than destroy evidence.
if [[ -d "$WT_INT/.git" || -f "$WT_INT/.git" ]]; then
  [[ "$(git -C "$WT_INT" rev-parse HEAD)" == "$BASE_SHA" ]] \
    || fail "Existing integration worktree HEAD moved from the Stage-0 base; refusing to reset it."
  [[ -z "$(git -C "$WT_INT" status --porcelain=v1 -uall)" ]] \
    || fail "Existing integration worktree has changes. Inspect them before resuming; nothing was overwritten."
else
  if git show-ref --verify --quiet "refs/heads/$BR_INT"; then
    [[ "$(git rev-parse "$BR_INT")" == "$BASE_SHA" ]] \
      || fail "Existing local integration branch moved from the Stage-0 base."
    git worktree add -q "$WT_INT" "$BR_INT"
  else
    git worktree add -q -b "$BR_INT" "$WT_INT" "$BASE_SHA"
  fi
fi

# Remote integration branch should not already exist; if it does, the previous
# run may have completed farther than local status indicates.
if git ls-remote --exit-code --heads origin "$BR_INT" >/dev/null 2>&1; then
  fail "Integration branch already exists remotely: $BR_INT. Inspect it instead of rerunning integration."
fi

cat > "$STATUS_FILE" <<EOF
INTEGRATION_STATUS=RUNNING
RUN_ID=$RUN_ID
INTEGRATION_BRANCH=$BR_INT
REPORT=$REPORT_REL
STARTED_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

mark_failed() {
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    cat > "$STATUS_FILE" <<EOF
INTEGRATION_STATUS=FAILED
RUN_ID=$RUN_ID
INTEGRATION_BRANCH=$BR_INT
REPORT=$REPORT_REL
EXIT_CODE=$rc
FAILED_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOG=$LOG_INT
EOF
  fi
}
trap mark_failed EXIT

info "Launching ONLY the final integration agent."
info "Live log: $LOG_INT"
info "Status file: $STATUS_FILE"

# Truncate the stale failed-attempt log so monitoring reflects this resume run.
: > "$LOG_INT"
(
  cd "$WT_INT"
  env -i \
    HOME="$HOME" \
    USER="${USER:-node}" \
    PATH="$PATH" \
    LANG="${LANG:-C.UTF-8}" \
    TERM="${TERM:-dumb}" \
    SIGNALFORGE_SANDBOX="1" \
    CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
    codex exec --ephemeral --sandbox danger-full-access < "$INT_PROMPT" \
      >"$LOG_INT" 2>&1
)

[[ -f "$WT_INT/$REPORT_REL" ]] || {
  tail -n 60 "$LOG_INT" >&2 || true
  fail "Integration agent exited without creating $REPORT_REL"
}

mapfile -t changes < <(git -C "$WT_INT" status --porcelain=v1 -uall | sed -E 's/^.. //')
if (( ${#changes[@]} != 1 )) || [[ "${changes[0]}" != "$REPORT_REL" ]]; then
  printf '[Stage0Integrate][ERROR] Integration scope validation failed.\n' >&2
  printf 'Expected exactly: %s\nObserved:\n' "$REPORT_REL" >&2
  printf '  %s\n' "${changes[@]}" >&2
  exit 31
fi

# Trusted wrapper commits only the approved report.
git -C "$WT_INT" add -- "$REPORT_REL"
git -C "$WT_INT" -c core.hooksPath=/dev/null commit -q -m "Stage0: integrate architecture research"
[[ -z "$(git -C "$WT_INT" status --porcelain=v1 -uall)" ]] || fail "Integration worktree is not clean after trusted commit."
mapfile -t committed < <(git -C "$WT_INT" diff --name-only "$BASE_SHA"..HEAD)
if (( ${#committed[@]} != 1 )) || [[ "${committed[0]}" != "$REPORT_REL" ]]; then
  fail "Integration commit contains files outside the approved report."
fi

git -C "$WT_INT" push -q -u origin "$BR_INT"

PR_URL=""
if command -v gh >/dev/null 2>&1; then
  PR_URL="$(gh pr create \
    --base "$BASE_BRANCH" \
    --head "$BR_INT" \
    --title "Stage 0 architecture research integration" \
    --body "Resumed final Stage-0 integration using the six already-published research branches. Research/docs only. No runtime code, production deployment, or main merge." \
    2>/dev/null || true)"
fi

cat > "$LATEST_RUN/reports/final-status.txt" <<EOF
STAGE0_RESEARCH=COMPLETE
RUN_ID=$RUN_ID
BASE_SHA=$BASE_SHA
INTEGRATION_BRANCH=$BR_INT
INTEGRATION_REPORT=$REPORT_REL
PR_URL=$PR_URL
PRODUCTION_DEPLOYED=NO
MAIN_MERGED=NO
EOF

cat > "$STATUS_FILE" <<EOF
INTEGRATION_STATUS=COMPLETE
RUN_ID=$RUN_ID
INTEGRATION_BRANCH=$BR_INT
REPORT=$REPORT_REL
COMPLETED_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PR_URL=$PR_URL
EOF

trap - EXIT
info "============================================================"
info "STAGE-0 INTEGRATION COMPLETE"
info "Integration branch: $BR_INT"
[[ -n "$PR_URL" ]] && info "Integration PR: $PR_URL"
info "Final report: $REPORT_REL"
info "No production deployment and no merge to main were performed."
info "============================================================"
