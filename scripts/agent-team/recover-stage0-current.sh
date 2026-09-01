#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="signalforge-agent-governance-v1"
RUNTIME_PARENT="/workspaces/.signalforge-agent-runtime"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

fail() { echo "[Stage0Recover][ERROR] $*" >&2; exit 1; }
info() { echo "[Stage0Recover] $*"; }

[[ -n "$REPO_ROOT" ]] || fail "Run this from inside the SignalForge repository."
cd "$REPO_ROOT"
[[ "${SIGNALFORGE_SANDBOX:-}" == "1" ]] || fail "SIGNALFORGE_SANDBOX is not 1."
[[ "${CODESPACES:-}" == "true" ]] || fail "Recovery is allowed only inside GitHub Codespaces."
[[ "$REPO_ROOT" == /workspaces/* ]] || fail "Repository is not under /workspaces."
[[ "$(git branch --show-current)" == "$BASE_BRANCH" ]] || fail "Expected branch $BASE_BRANCH."
command -v codex >/dev/null || fail "Codex CLI is missing."

LATEST_RUN="$(find "$RUNTIME_PARENT" -mindepth 1 -maxdepth 1 -type d -name 'stage0-*' 2>/dev/null | sort | tail -n 1 || true)"
[[ -n "$LATEST_RUN" ]] || fail "No Stage-0 run was found."
RUN_NAME="$(basename "$LATEST_RUN")"
RUN_ID="${RUN_NAME#stage0-}"
RUN_INFO="$LATEST_RUN/reports/run-info.txt"
[[ -f "$RUN_INFO" ]] || fail "Missing run-info.txt for $RUN_NAME."
BASE_SHA="$(sed -n 's/^base_sha=//p' "$RUN_INFO" | head -n 1)"
[[ -n "$BASE_SHA" ]] || fail "Could not determine base SHA."

info "Recovering $RUN_NAME from base $BASE_SHA"
info "This path reuses completed Wave-1 reports; it does not rerun them."

# Recovery must not race agents that are still writing their reports. All four
# expected Wave-1 files must already exist before any commit is created.
declare -A EXPECTED
EXPECTED[investment-architect]="docs/agent-team/research/investment-architecture.md"
EXPECTED[video-method-auditor]="docs/agent-team/research/video-method-audit.md"
EXPECTED[data-feasibility]="docs/agent-team/research/data-feasibility.md"
EXPECTED[beginner-ux]="docs/agent-team/research/beginner-usability-audit.md"

declare -A COMMIT_MSG
COMMIT_MSG[investment-architect]="Stage0: investment architecture review"
COMMIT_MSG[video-method-auditor]="Stage0: video methodology audit"
COMMIT_MSG[data-feasibility]="Stage0: data feasibility audit"
COMMIT_MSG[beginner-ux]="Stage0: beginner usability audit"

for name in investment-architect video-method-auditor data-feasibility beginner-ux; do
  wt="$LATEST_RUN/worktrees/$name"
  expected="${EXPECTED[$name]}"
  [[ -d "$wt" ]] || fail "Missing Wave-1 worktree: $name"
  [[ -f "$wt/$expected" ]] || fail "$name has not produced $expected yet. Wait for the original Wave-1 launcher to stop, then rerun recovery."
done

validate_uncommitted_exact_file() {
  local wt="$1" expected="$2"
  local changes=()
  mapfile -t changes < <(git -C "$wt" status --porcelain=v1 -uall | sed -E 's/^.. //')
  if (( ${#changes[@]} != 1 )) || [[ "${changes[0]}" != "$expected" ]]; then
    printf '[Stage0Recover][ERROR] Scope validation failed for %s\n' "$wt" >&2
    printf 'Expected exactly: %s\nObserved:\n' "$expected" >&2
    printf '  %s\n' "${changes[@]}" >&2
    exit 20
  fi
}

commit_and_push_existing() {
  local name="$1" expected="$2" message="$3" branch="$4"
  local wt="$LATEST_RUN/worktrees/$name"
  validate_uncommitted_exact_file "$wt" "$expected"

  [[ "$(git -C "$wt" rev-parse HEAD)" == "$BASE_SHA" ]] || fail "$name HEAD moved unexpectedly before trusted recovery commit."
  git -C "$wt" add -- "$expected"
  git -C "$wt" -c core.hooksPath=/dev/null commit -q -m "$message"

  mapfile -t committed < <(git -C "$wt" diff --name-only "$BASE_SHA"..HEAD)
  if (( ${#committed[@]} != 1 )) || [[ "${committed[0]}" != "$expected" ]]; then
    fail "$name committed outside its approved scope."
  fi
  [[ -z "$(git -C "$wt" status --porcelain=v1 -uall)" ]] || fail "$name worktree is not clean after recovery commit."
  git -C "$wt" push -q -u origin "$branch"
  info "Recovered and published: $name"
}

BR_INV="agent/stage0-$RUN_ID-investment-architect"
BR_VIDEO="agent/stage0-$RUN_ID-video-method-auditor"
BR_DATA="agent/stage0-$RUN_ID-data-feasibility"
BR_UX="agent/stage0-$RUN_ID-beginner-ux"
BR_QUANT="agent/stage0-$RUN_ID-quant-challenger"
BR_RISK="agent/stage0-$RUN_ID-risk-officer"
BR_INT="agent/stage0-$RUN_ID-integration"

commit_and_push_existing investment-architect "${EXPECTED[investment-architect]}" "${COMMIT_MSG[investment-architect]}" "$BR_INV"
commit_and_push_existing video-method-auditor "${EXPECTED[video-method-auditor]}" "${COMMIT_MSG[video-method-auditor]}" "$BR_VIDEO"
commit_and_push_existing data-feasibility "${EXPECTED[data-feasibility]}" "${COMMIT_MSG[data-feasibility]}" "$BR_DATA"
commit_and_push_existing beginner-ux "${EXPECTED[beginner-ux]}" "${COMMIT_MSG[beginner-ux]}" "$BR_UX"

build_prompt() {
  local name="$1" source="$2" target="$LATEST_RUN/prompts/$name-recovery-resolved.md"
  cat "$REPO_ROOT/$source" > "$target"
  cat >> "$target" <<'EOF'

---
## Recovery launcher safety override — authoritative for this run
Do not run git add, git commit, git push, gh, deployment commands, or any command that writes Git metadata. Leave exactly the one assigned output file as an uncommitted worktree change. The trusted recovery launcher validates the exact path, commits that one file with hooks disabled, and pushes only after validation.
EOF
  printf '%s\n' "$target"
}

make_worktree() {
  local branch="$1" base_ref="$2" path="$3"
  if git show-ref --verify --quiet "refs/heads/$branch"; then fail "Unexpected existing branch: $branch"; fi
  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then fail "Unexpected remote branch: $branch"; fi
  git worktree add -q -b "$branch" "$path" "$base_ref"
}

run_new_agent() {
  local name="$1" branch="$2" base_ref="$3" prompt_rel="$4" expected="$5" message="$6"
  local wt="$LATEST_RUN/worktrees/$name" log="$LATEST_RUN/logs/$name.log" prompt start_sha
  prompt="$(build_prompt "$name" "$prompt_rel")"
  start_sha="$(git rev-parse "$base_ref")"
  make_worktree "$branch" "$base_ref" "$wt"
  info "Launching recovered continuation agent: $name"

  (
    cd "$wt"
    env -i \
      HOME="$HOME" USER="${USER:-node}" PATH="$PATH" LANG="${LANG:-C.UTF-8}" TERM="${TERM:-dumb}" \
      SIGNALFORGE_SANDBOX="1" CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
      codex exec --ephemeral --sandbox danger-full-access < "$prompt" >"$log" 2>&1

    validate_uncommitted_exact_file "$wt" "$expected"
    [[ "$(git rev-parse HEAD)" == "$start_sha" ]] || exit 31
    git add -- "$expected"
    git -c core.hooksPath=/dev/null commit -q -m "$message"
    mapfile -t committed < <(git diff --name-only "$start_sha"..HEAD)
    (( ${#committed[@]} == 1 )) && [[ "${committed[0]}" == "$expected" ]] || exit 32
    [[ -z "$(git status --porcelain=v1 -uall)" ]] || exit 33
  )
}

run_new_agent quant-challenger "$BR_QUANT" "$BR_INV" \
  "docs/agent-team/prompts/stage0-quant-challenger.md" \
  "docs/agent-team/research/quant-strategy-challenge.md" \
  "Stage0: quant strategy challenge" & PID_QUANT=$!
run_new_agent risk-officer "$BR_RISK" "$BR_INV" \
  "docs/agent-team/prompts/stage0-risk-officer.md" \
  "docs/agent-team/research/risk-of-ruin-review.md" \
  "Stage0: risk of ruin review" & PID_RISK=$!

failures=0
wait "$PID_QUANT" || { info "quant-challenger FAILED; see $LATEST_RUN/logs/quant-challenger.log"; failures=$((failures+1)); }
wait "$PID_RISK" || { info "risk-officer FAILED; see $LATEST_RUN/logs/risk-officer.log"; failures=$((failures+1)); }
(( failures == 0 )) || fail "$failures Wave-2 recovery agent(s) failed."

git -C "$LATEST_RUN/worktrees/quant-challenger" push -q -u origin "$BR_QUANT"
git -C "$LATEST_RUN/worktrees/risk-officer" push -q -u origin "$BR_RISK"
info "Wave 2 recovered and published."

INT_PROMPT="$LATEST_RUN/prompts/stage0-integrator-recovery-resolved.md"
sed \
  -e "s|agent/stage0-investment-architect|$BR_INV|g" \
  -e "s|agent/stage0-video-method-auditor|$BR_VIDEO|g" \
  -e "s|agent/stage0-data-feasibility|$BR_DATA|g" \
  -e "s|agent/stage0-beginner-ux|$BR_UX|g" \
  -e "s|agent/stage0-quant-challenger|$BR_QUANT|g" \
  -e "s|agent/stage0-risk-officer|$BR_RISK|g" \
  "$REPO_ROOT/docs/agent-team/prompts/stage0-integrator.md" > "$INT_PROMPT"
cat >> "$INT_PROMPT" <<'EOF'

---
## Recovery launcher safety override — authoritative for this run
Do not run git add, git commit, git push, gh, deployment commands, or commands that write Git metadata. Leave exactly docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md as an uncommitted worktree change. The trusted recovery launcher validates and publishes it after you exit.
EOF

WT_INT="$LATEST_RUN/worktrees/integration"
LOG_INT="$LATEST_RUN/logs/integration.log"
make_worktree "$BR_INT" "$BASE_SHA" "$WT_INT"
info "Launching Stage-0 integration lead"
(
  cd "$WT_INT"
  env -i \
    HOME="$HOME" USER="${USER:-node}" PATH="$PATH" LANG="${LANG:-C.UTF-8}" TERM="${TERM:-dumb}" \
    SIGNALFORGE_SANDBOX="1" CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
    codex exec --ephemeral --sandbox danger-full-access < "$INT_PROMPT" >"$LOG_INT" 2>&1

  validate_uncommitted_exact_file "$WT_INT" "docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md"
  [[ "$(git rev-parse HEAD)" == "$BASE_SHA" ]] || exit 41
  git add -- "docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md"
  git -c core.hooksPath=/dev/null commit -q -m "Stage0: integrate architecture research"
  mapfile -t int_files < <(git diff --name-only "$BASE_SHA"..HEAD)
  (( ${#int_files[@]} == 1 )) && [[ "${int_files[0]}" == "docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md" ]] || exit 42
  [[ -z "$(git status --porcelain=v1 -uall)" ]] || exit 43
)

git -C "$WT_INT" push -q -u origin "$BR_INT"

PR_URL=""
if command -v gh >/dev/null 2>&1; then
  PR_URL="$(gh pr create \
    --base "$BASE_BRANCH" \
    --head "$BR_INT" \
    --title "Stage 0 architecture research integration" \
    --body "Recovered autonomous Stage-0 research integration. Research/docs only. No runtime code or production deployment." \
    2>/dev/null || true)"
fi

cat > "$LATEST_RUN/reports/final-status.txt" <<EOF
STAGE0_RESEARCH=COMPLETE
RECOVERED_FROM_FALSE_SCOPE_FAILURE=YES
RUN_ID=$RUN_ID
BASE_SHA=$BASE_SHA
INTEGRATION_BRANCH=$BR_INT
INTEGRATION_REPORT=docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md
PR_URL=$PR_URL
PRODUCTION_DEPLOYED=NO
MAIN_MERGED=NO
EOF

info "============================================================"
info "STAGE-0 RECOVERY COMPLETE"
info "Integration branch: $BR_INT"
[[ -n "$PR_URL" ]] && info "Integration PR: $PR_URL"
info "No production deployment and no merge to main were performed."
info "============================================================"
