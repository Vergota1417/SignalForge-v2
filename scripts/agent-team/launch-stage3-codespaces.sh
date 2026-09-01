#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="stage3-agent-swarm-orchestration-v1"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUNTIME_PARENT="/workspaces/.signalforge-agent-runtime"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUNTIME_ROOT="$RUNTIME_PARENT/stage3-$RUN_ID"
AGENT_TIMEOUT_SECONDS=2400

fail(){ echo "[Stage3][ERROR] $*" >&2; exit 1; }
info(){ echo "[Stage3] $*"; }

[[ -n "$REPO_ROOT" ]] || fail "Run this inside the SignalForge repository."
cd "$REPO_ROOT"
[[ "${SIGNALFORGE_SANDBOX:-}" == "1" ]] || fail "SIGNALFORGE_SANDBOX is not 1."
[[ "${CODESPACES:-}" == "true" ]] || fail "Stage 3 launcher is allowed only in GitHub Codespaces."
[[ "$REPO_ROOT" == /workspaces/* ]] || fail "Repository is not under /workspaces."
[[ "$(git branch --show-current)" == "$BASE_BRANCH" ]] || fail "Switch to $BASE_BRANCH before launching."
[[ -z "$(git status --porcelain=v1 -uall)" ]] || fail "Base worktree is dirty. Commit/stash/remove local changes first."

for secret_name in \
  CLOUDFLARE_API_TOKEN CF_API_TOKEN CF_ACCOUNT_ID CLOUDFLARE_ACCOUNT_ID \
  ALPACA_API_KEY ALPACA_SECRET_KEY APCA_API_KEY_ID APCA_API_SECRET_KEY \
  TWELVE_DATA_API_KEY ROBINHOOD_USERNAME ROBINHOOD_PASSWORD \
  BROKERAGE_API_KEY BROKERAGE_API_SECRET; do
  [[ -z "${!secret_name:-}" ]] || fail "Sensitive environment variable $secret_name is present. Remove it before launching agents."
done

for cmd in git node npm; do command -v "$cmd" >/dev/null || fail "$cmd is missing."; done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 24 )) || fail "Node 24+ required; found $(node -v)."

info "Refreshing $BASE_BRANCH..."
git fetch origin "$BASE_BRANCH"
git pull --ff-only origin "$BASE_BRANCH"
[[ -z "$(git status --porcelain=v1 -uall)" ]] || fail "Base worktree became dirty after refresh."

info "Verifying green starting point..."
npm run test:manifest
npm run check:syntax

if ! command -v codex >/dev/null 2>&1; then
  info "Installing OpenAI Codex CLI inside the Codespace..."
  npm install -g @openai/codex@latest
fi
LOGIN_STATUS="$(codex login status 2>&1 || true)"
if ! grep -qi "Logged in" <<<"$LOGIN_STATUS"; then
  info "Codex needs one-time authentication."
  codex login --device-auth
  LOGIN_STATUS="$(codex login status 2>&1 || true)"
fi
grep -qi "Logged in" <<<"$LOGIN_STATUS" || fail "Codex authentication did not complete."
info "$(codex --version 2>/dev/null || true) · $LOGIN_STATUS"

mkdir -p "$RUNTIME_ROOT"/{worktrees,logs,prompts,reports}
BASE_SHA="$(git rev-parse HEAD)"
cat > "$RUNTIME_ROOT/reports/run-info.txt" <<EOF
RUN_ID=$RUN_ID
BASE_BRANCH=$BASE_BRANCH
BASE_SHA=$BASE_SHA
NODE=$(node -v)
CODEX=$(codex --version 2>/dev/null || true)
EOF
cat > "$RUNTIME_ROOT/reports/status.txt" <<EOF
STAGE3_STATUS=RUNNING
RUN_ID=$RUN_ID
PHASE=WAVE1
STARTED_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

make_worktree(){
  local branch="$1" path="$2"
  git show-ref --verify --quiet "refs/heads/$branch" && fail "Local branch already exists: $branch"
  git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1 && fail "Remote branch already exists: $branch"
  git worktree add -q -b "$branch" "$path" "$BASE_SHA"
}

resolved_prompt(){
  local name="$1" rel="$2" out="$RUNTIME_ROOT/prompts/$name-resolved.md"
  cat "$REPO_ROOT/$rel" > "$out"
  cat >> "$out" <<'EOF'

---
## Trusted launcher safety override — authoritative
Do not run `git add`, `git commit`, `git push`, `git checkout`, `git switch`, `git reset`, `git clean`, `gh`, deployment commands, or commands that write Git metadata. Do not access production providers, brokerage accounts, Cloudflare deployment credentials, or secrets. Leave only the files allowed by your assignment as uncommitted worktree changes. The trusted launcher validates scope, runs checks, commits, and pushes after you exit.
EOF
  printf '%s\n' "$out"
}

path_allowed(){
  local name="$1" file="$2"
  case "$name" in
    location)
      [[ "$file" == src/method/location/* || "$file" == scripts/test-stage3-location-engine.mjs ]]
      ;;
    path)
      [[ "$file" == src/method/path/* || "$file" == scripts/test-stage3-path-engine.mjs ]]
      ;;
    confirmation)
      [[ "$file" == src/method/confirmation/* || "$file" == scripts/test-stage3-confirmation-engine.mjs ]]
      ;;
    ux)
      [[ "$file" == docs/agent-team/research/stage3-ux-coherence.md || "$file" == scripts/test-stage3-ux-coherence.mjs ]]
      ;;
    integration)
      case "$file" in
        src/entry.js|src/method/five-stage-alpha.js|public/dashboard-alpha.js|public/index.html|public/dashboard-blueprint.css|scripts/suite-manifest.mjs|scripts/test-stage3-integration.mjs) return 0;;
        *) return 1;;
      esac
      ;;
    qa)
      [[ "$file" == docs/agent-team/research/stage3-qa-review.md ]]
      ;;
    *) return 1;;
  esac
}

validate_changes(){
  local name="$1" wt="$2"
  mapfile -t files < <(git -C "$wt" status --porcelain=v1 -uall | sed -E 's/^.. //')
  (( ${#files[@]} > 0 )) || { echo "No changes produced by $name" >> "$RUNTIME_ROOT/logs/$name.log"; return 31; }
  local file
  for file in "${files[@]}"; do
    if ! path_allowed "$name" "$file"; then
      {
        echo "Scope violation for $name: $file"
        echo "All observed changes:"
        printf '  %s\n' "${files[@]}"
      } >> "$RUNTIME_ROOT/logs/$name.log"
      return 32
    fi
  done
}

validate_committed_scope(){
  local name="$1" wt="$2" start_sha="$3"
  mapfile -t files < <(git -C "$wt" diff --name-only "$start_sha"..HEAD)
  local file
  for file in "${files[@]}"; do
    path_allowed "$name" "$file" || return 33
  done
}

run_agent(){
  local name="$1" branch="$2" prompt_rel="$3" test_cmd="$4" commit_message="$5"
  local wt="$RUNTIME_ROOT/worktrees/$name" log="$RUNTIME_ROOT/logs/$name.log" prompt start_sha
  prompt="$(resolved_prompt "$name" "$prompt_rel")"
  make_worktree "$branch" "$wt"
  start_sha="$(git -C "$wt" rev-parse HEAD)"
  info "Launching $name → $branch"
  (
    cd "$wt"
    env -i \
      HOME="$HOME" USER="${USER:-node}" PATH="$PATH" LANG="${LANG:-C.UTF-8}" TERM="${TERM:-dumb}" \
      SIGNALFORGE_SANDBOX="1" CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
      timeout --signal=TERM "${AGENT_TIMEOUT_SECONDS}s" \
      codex exec --ephemeral --sandbox danger-full-access < "$prompt" >"$log" 2>&1

    validate_changes "$name" "$wt"
    if [[ -n "$test_cmd" ]]; then
      bash -lc "$test_cmd" >>"$log" 2>&1
    fi
    git add -A
    git -c core.hooksPath=/dev/null commit -q -m "$commit_message"
    [[ -z "$(git status --porcelain=v1 -uall)" ]] || exit 34
    validate_committed_scope "$name" "$wt" "$start_sha"
  )
}

wait_group(){
  local label="$1"; shift
  local failures=0 entry name pid
  for entry in "$@"; do
    name="${entry%%:*}"; pid="${entry##*:}"
    if wait "$pid"; then info "$label passed: $name"; else info "$label FAILED: $name (see $RUNTIME_ROOT/logs/$name.log)"; failures=$((failures+1)); fi
  done
  (( failures == 0 )) || fail "$failures agent(s) failed in $label. Later phases were not launched."
}

push_branch(){
  local name="$1" branch="$2"
  info "Publishing scope-checked branch: $branch"
  git -C "$RUNTIME_ROOT/worktrees/$name" push -q -u origin "$branch"
}

BR_LOC="agent/stage3-$RUN_ID-location"
BR_PATH="agent/stage3-$RUN_ID-path"
BR_CONF="agent/stage3-$RUN_ID-confirmation"
BR_UX="agent/stage3-$RUN_ID-ux-coherence"
BR_INT="agent/stage3-$RUN_ID-integration"
BR_QA="agent/stage3-$RUN_ID-qa"

run_agent location "$BR_LOC" docs/agent-team/prompts/stage3-location-engine.md \
  "node scripts/test-stage3-location-engine.mjs" "Stage3: dedicated Location engine" & PID_LOC=$!
run_agent path "$BR_PATH" docs/agent-team/prompts/stage3-path-engine.md \
  "node scripts/test-stage3-path-engine.mjs" "Stage3: dedicated Path engine" & PID_PATH=$!
run_agent confirmation "$BR_CONF" docs/agent-team/prompts/stage3-confirmation-engine.md \
  "node scripts/test-stage3-confirmation-engine.mjs" "Stage3: dedicated Confirmation engine" & PID_CONF=$!
run_agent ux "$BR_UX" docs/agent-team/prompts/stage3-ux-coherence.md \
  "" "Stage3: UX coherence contract" & PID_UX=$!

wait_group "Wave 1" "location:$PID_LOC" "path:$PID_PATH" "confirmation:$PID_CONF" "ux:$PID_UX"
push_branch location "$BR_LOC"
push_branch path "$BR_PATH"
push_branch confirmation "$BR_CONF"
push_branch ux "$BR_UX"

cat > "$RUNTIME_ROOT/reports/status.txt" <<EOF
STAGE3_STATUS=RUNNING
RUN_ID=$RUN_ID
PHASE=INTEGRATION
LOCATION_BRANCH=$BR_LOC
PATH_BRANCH=$BR_PATH
CONFIRMATION_BRANCH=$BR_CONF
UX_BRANCH=$BR_UX
EOF

WT_INT="$RUNTIME_ROOT/worktrees/integration"
make_worktree "$BR_INT" "$WT_INT"
info "Composing independent agent commits into integration worktree..."
for source_wt in location path confirmation ux; do
  commit_sha="$(git -C "$RUNTIME_ROOT/worktrees/$source_wt" rev-parse HEAD)"
  git -C "$WT_INT" cherry-pick -q "$commit_sha" || fail "Trusted cherry-pick failed for $source_wt."
done

INT_PROMPT="$(resolved_prompt integration docs/agent-team/prompts/stage3-integrator.md)"
INT_LOG="$RUNTIME_ROOT/logs/integration.log"
INT_SHARED_START="$(git -C "$WT_INT" rev-parse HEAD)"
info "Launching single Stage 3 integration agent..."
(
  cd "$WT_INT"
  env -i \
    HOME="$HOME" USER="${USER:-node}" PATH="$PATH" LANG="${LANG:-C.UTF-8}" TERM="${TERM:-dumb}" \
    SIGNALFORGE_SANDBOX="1" CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
    timeout --signal=TERM "${AGENT_TIMEOUT_SECONDS}s" \
    codex exec --ephemeral --sandbox danger-full-access < "$INT_PROMPT" >"$INT_LOG" 2>&1

  validate_changes integration "$WT_INT"
  npm run check:syntax >>"$INT_LOG" 2>&1
  npm run test:manifest >>"$INT_LOG" 2>&1
  npm run test:baseline >>"$INT_LOG" 2>&1
  git add -A
  git -c core.hooksPath=/dev/null commit -q -m "Stage3: integrate tactical engines and UX coherence"
  [[ -z "$(git status --porcelain=v1 -uall)" ]] || exit 41
  validate_committed_scope integration "$WT_INT" "$INT_SHARED_START"
)
push_branch integration "$BR_INT"

cat > "$RUNTIME_ROOT/reports/status.txt" <<EOF
STAGE3_STATUS=RUNNING
RUN_ID=$RUN_ID
PHASE=QA
INTEGRATION_BRANCH=$BR_INT
EOF

WT_QA="$RUNTIME_ROOT/worktrees/qa"
git worktree add -q -b "$BR_QA" "$WT_QA" "$BR_INT"
QA_PROMPT="$(resolved_prompt qa docs/agent-team/prompts/stage3-qa.md)"
QA_LOG="$RUNTIME_ROOT/logs/qa.log"
QA_START="$(git -C "$WT_QA" rev-parse HEAD)"
info "Launching independent QA agent..."
(
  cd "$WT_QA"
  env -i \
    HOME="$HOME" USER="${USER:-node}" PATH="$PATH" LANG="${LANG:-C.UTF-8}" TERM="${TERM:-dumb}" \
    SIGNALFORGE_SANDBOX="1" CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
    timeout --signal=TERM "${AGENT_TIMEOUT_SECONDS}s" \
    codex exec --ephemeral --sandbox danger-full-access < "$QA_PROMPT" >"$QA_LOG" 2>&1
  validate_changes qa "$WT_QA"
  git add -- docs/agent-team/research/stage3-qa-review.md
  git -c core.hooksPath=/dev/null commit -q -m "Stage3: independent QA review"
  [[ -z "$(git status --porcelain=v1 -uall)" ]] || exit 51
  validate_committed_scope qa "$WT_QA" "$QA_START"
)
push_branch qa "$BR_QA"

QA_REPORT="$WT_QA/docs/agent-team/research/stage3-qa-review.md"
[[ -f "$QA_REPORT" ]] || fail "QA report missing."
QA_VERDICT="$(head -n 1 "$QA_REPORT" | tr -d '\r')"
if [[ "$QA_VERDICT" != "VERDICT: PASS" ]]; then
  cat > "$RUNTIME_ROOT/reports/final-status.txt" <<EOF
STAGE3_IMPLEMENTATION=QA_FAILED
RUN_ID=$RUN_ID
INTEGRATION_BRANCH=$BR_INT
QA_BRANCH=$BR_QA
QA_VERDICT=$QA_VERDICT
EOF
  fail "Stage 3 QA did not pass. Integration branch is published for inspection but no completion claim is made."
fi

PR_URL=""
if command -v gh >/dev/null 2>&1; then
  PR_URL="$(gh pr create --base stage2-environment-engine-v1 --head "$BR_INT" \
    --title "Stage 3 — Parallel Location, Path and Confirmation integration" \
    --body "Parallel Stage 3 implementation: dedicated shadow-only Location, Path and Confirmation engines plus UX coherence integration. Existing hard BUY authorization remains authoritative. Independent QA branch: $BR_QA. No production deploy or main merge." 2>/dev/null || true)"
fi

cat > "$RUNTIME_ROOT/reports/final-status.txt" <<EOF
STAGE3_IMPLEMENTATION=COMPLETE
RUN_ID=$RUN_ID
BASE_SHA=$BASE_SHA
LOCATION_BRANCH=$BR_LOC
PATH_BRANCH=$BR_PATH
CONFIRMATION_BRANCH=$BR_CONF
UX_BRANCH=$BR_UX
INTEGRATION_BRANCH=$BR_INT
QA_BRANCH=$BR_QA
QA_VERDICT=PASS
PR_URL=$PR_URL
COMPLETED_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
cp "$RUNTIME_ROOT/reports/final-status.txt" "$RUNTIME_ROOT/reports/status.txt"

info "Stage 3 COMPLETE."
info "Integration branch: $BR_INT"
info "QA branch: $BR_QA"
[[ -n "$PR_URL" ]] && info "PR: $PR_URL" || info "PR creation was not available; integration branch is published."
info "Status: $RUNTIME_ROOT/reports/final-status.txt"
