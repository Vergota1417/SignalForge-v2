#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="signalforge-agent-governance-v1"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUNTIME_PARENT="/workspaces/.signalforge-agent-runtime"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUNTIME_ROOT="$RUNTIME_PARENT/stage0-$RUN_ID"

fail() {
  echo "[Stage0][ERROR] $*" >&2
  exit 1
}

info() {
  echo "[Stage0] $*"
}

[[ -n "$REPO_ROOT" ]] || fail "Run this from inside the SignalForge git repository."
cd "$REPO_ROOT"

[[ "${SIGNALFORGE_SANDBOX:-}" == "1" ]] || fail "SIGNALFORGE_SANDBOX is not 1. Refusing to run outside the SignalForge sandbox."

CURRENT_BRANCH="$(git branch --show-current)"
[[ "$CURRENT_BRANCH" == "$BASE_BRANCH" ]] || fail "Expected branch $BASE_BRANCH, found $CURRENT_BRANCH."

[[ -z "$(git status --porcelain)" ]] || fail "Base worktree is not clean. Commit/stash/remove local changes before launching agents."

for secret_name in \
  CLOUDFLARE_API_TOKEN CF_API_TOKEN CF_ACCOUNT_ID CLOUDFLARE_ACCOUNT_ID \
  ALPACA_API_KEY ALPACA_SECRET_KEY APCA_API_KEY_ID APCA_API_SECRET_KEY \
  TWELVE_DATA_API_KEY ROBINHOOD_USERNAME ROBINHOOD_PASSWORD \
  BROKERAGE_API_KEY BROKERAGE_API_SECRET; do
  if [[ -n "${!secret_name:-}" ]]; then
    fail "Sensitive environment variable $secret_name is present. Remove it from the Codespace before running the agent swarm."
  fi
done

command -v node >/dev/null || fail "node is missing. Rebuild the dev container first."
command -v npm >/dev/null || fail "npm is missing. Rebuild the dev container first."
command -v git >/dev/null || fail "git is missing."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 24 )) || fail "Node 24+ required; found $(node -v)."

info "Refreshing governance branch..."
git fetch origin "$BASE_BRANCH"
git pull --ff-only origin "$BASE_BRANCH"

[[ -z "$(git status --porcelain)" ]] || fail "Base worktree became dirty after refresh."

info "Running sandbox preflight tests..."
npm run test:manifest
npm run check:syntax

if ! command -v codex >/dev/null 2>&1; then
  info "Installing current OpenAI Codex CLI inside the Codespace only..."
  npm install -g @openai/codex@latest
fi

info "Codex CLI: $(codex --version 2>/dev/null || echo unknown)"

LOGIN_STATUS="$(codex login status 2>&1 || true)"
if ! grep -qi "Logged in" <<<"$LOGIN_STATUS"; then
  info "Codex needs one-time ChatGPT authentication. Follow the device-code instructions shown next."
  codex login --device-auth
  LOGIN_STATUS="$(codex login status 2>&1 || true)"
fi

grep -qi "Logged in" <<<"$LOGIN_STATUS" || fail "Codex authentication did not complete."
info "$LOGIN_STATUS"

mkdir -p "$RUNTIME_ROOT"/{worktrees,logs,prompts,reports}
BASE_SHA="$(git rev-parse HEAD)"
printf '%s\n' \
  "run_id=$RUN_ID" \
  "base_branch=$BASE_BRANCH" \
  "base_sha=$BASE_SHA" \
  "node=$(node -v)" \
  "codex=$(codex --version 2>/dev/null || true)" \
  > "$RUNTIME_ROOT/reports/run-info.txt"

make_worktree() {
  local branch="$1"
  local base_ref="$2"
  local path="$3"

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    fail "Local branch already exists unexpectedly: $branch"
  fi
  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    fail "Remote branch already exists unexpectedly: $branch"
  fi

  git worktree add -q -b "$branch" "$path" "$base_ref"
}

build_agent_prompt() {
  local name="$1"
  local prompt_rel="$2"
  local resolved="$RUNTIME_ROOT/prompts/$name-resolved.md"

  cat "$REPO_ROOT/$prompt_rel" > "$resolved"
  cat >> "$resolved" <<'EOF'

---
## Launcher safety override — authoritative for this run
Do **not** run `git add`, `git commit`, `git push`, `gh`, deployment commands, or any command that writes Git metadata. Leave exactly the one assigned output file as an uncommitted worktree change. The trusted launcher will verify the exact path, commit that single file with hooks disabled, and push the isolated branch only after scope validation.
EOF
  printf '%s\n' "$resolved"
}

run_codex_agent() {
  local name="$1"
  local branch="$2"
  local base_ref="$3"
  local prompt_rel="$4"
  local expected_file="$5"
  local commit_message="$6"

  local wt="$RUNTIME_ROOT/worktrees/$name"
  local log="$RUNTIME_ROOT/logs/$name.log"
  local resolved_prompt
  resolved_prompt="$(build_agent_prompt "$name" "$prompt_rel")"
  local start_sha
  start_sha="$(git rev-parse "$base_ref")"

  make_worktree "$branch" "$base_ref" "$wt"
  info "Launching $name on $branch"

  (
    cd "$wt"

    # Codex gets only the worktree and a deliberately minimal environment.
    # It does not receive Codespaces/GitHub tokens or provider/production secrets.
    # The agent is not trusted to commit or push; the launcher does that only
    # after exact-file scope validation.
    env -i \
      HOME="$HOME" \
      USER="${USER:-node}" \
      PATH="$PATH" \
      LANG="${LANG:-C.UTF-8}" \
      TERM="${TERM:-dumb}" \
      SIGNALFORGE_SANDBOX="1" \
      CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
      codex exec --ephemeral --sandbox workspace-write < "$resolved_prompt" \
      >"$log" 2>&1

    mapfile -t changed_files < <(git status --porcelain=v1 | sed -E 's/^.. //')
    if (( ${#changed_files[@]} != 1 )) || [[ "${changed_files[0]}" != "$expected_file" ]]; then
      {
        echo "Scope violation. Expected exactly one changed file: $expected_file"
        echo "Observed worktree changes:"
        printf '  %s\n' "${changed_files[@]}"
      } >>"$log"
      exit 31
    fi

    [[ -f "$expected_file" ]] || {
      echo "Expected output file missing: $expected_file" >>"$log"
      exit 32
    }

    # Trusted launcher commits only the pre-approved file. Hooks are disabled.
    git add -- "$expected_file"
    git -c core.hooksPath=/dev/null commit -q -m "$commit_message"

    [[ -z "$(git status --porcelain)" ]] || {
      echo "Worktree was not clean after trusted commit." >>"$log"
      exit 33
    }

    mapfile -t committed_files < <(git diff --name-only "$start_sha"..HEAD)
    if (( ${#committed_files[@]} != 1 )) || [[ "${committed_files[0]}" != "$expected_file" ]]; then
      {
        echo "Post-commit scope violation. Expected exactly: $expected_file"
        echo "Committed files:"
        printf '  %s\n' "${committed_files[@]}"
      } >>"$log"
      exit 34
    fi
  )
}

push_checked_branch() {
  local name="$1"
  local branch="$2"
  info "Publishing scope-checked research branch: $branch"
  git -C "$RUNTIME_ROOT/worktrees/$name" push -q -u origin "$branch"
}

wait_group() {
  local group_name="$1"
  shift
  local failures=0
  local entry name pid
  for entry in "$@"; do
    name="${entry%%:*}"
    pid="${entry##*:}"
    if wait "$pid"; then
      info "$group_name agent passed: $name"
    else
      info "$group_name agent FAILED: $name (see $RUNTIME_ROOT/logs/$name.log)"
      failures=$((failures + 1))
    fi
  done
  (( failures == 0 )) || fail "$failures agent(s) failed in $group_name. No later wave was launched."
}

BR_INV="agent/stage0-$RUN_ID-investment-architect"
BR_VIDEO="agent/stage0-$RUN_ID-video-method-auditor"
BR_DATA="agent/stage0-$RUN_ID-data-feasibility"
BR_UX="agent/stage0-$RUN_ID-beginner-ux"
BR_QUANT="agent/stage0-$RUN_ID-quant-challenger"
BR_RISK="agent/stage0-$RUN_ID-risk-officer"
BR_INT="agent/stage0-$RUN_ID-integration"

# Wave 1: independent architecture research that can run concurrently.
run_codex_agent "investment-architect" "$BR_INV" "$BASE_SHA" \
  "docs/agent-team/prompts/stage0-investment-architect.md" \
  "docs/agent-team/research/investment-architecture.md" \
  "Stage0: investment architecture review" & PID_INV=$!
run_codex_agent "video-method-auditor" "$BR_VIDEO" "$BASE_SHA" \
  "docs/agent-team/prompts/stage0-video-method-auditor.md" \
  "docs/agent-team/research/video-method-audit.md" \
  "Stage0: video methodology audit" & PID_VIDEO=$!
run_codex_agent "data-feasibility" "$BR_DATA" "$BASE_SHA" \
  "docs/agent-team/prompts/stage0-data-feasibility.md" \
  "docs/agent-team/research/data-feasibility.md" \
  "Stage0: data feasibility audit" & PID_DATA=$!
run_codex_agent "beginner-ux" "$BR_UX" "$BASE_SHA" \
  "docs/agent-team/prompts/stage0-beginner-ux-auditor.md" \
  "docs/agent-team/research/beginner-usability-audit.md" \
  "Stage0: beginner usability audit" & PID_UX=$!

wait_group "Wave 1" \
  "investment-architect:$PID_INV" \
  "video-method-auditor:$PID_VIDEO" \
  "data-feasibility:$PID_DATA" \
  "beginner-ux:$PID_UX"

push_checked_branch "investment-architect" "$BR_INV"
push_checked_branch "video-method-auditor" "$BR_VIDEO"
push_checked_branch "data-feasibility" "$BR_DATA"
push_checked_branch "beginner-ux" "$BR_UX"

# Wave 2: independent challengers intentionally see the architect's proposal.
run_codex_agent "quant-challenger" "$BR_QUANT" "$BR_INV" \
  "docs/agent-team/prompts/stage0-quant-challenger.md" \
  "docs/agent-team/research/quant-strategy-challenge.md" \
  "Stage0: quant strategy challenge" & PID_QUANT=$!
run_codex_agent "risk-officer" "$BR_RISK" "$BR_INV" \
  "docs/agent-team/prompts/stage0-risk-officer.md" \
  "docs/agent-team/research/risk-of-ruin-review.md" \
  "Stage0: risk of ruin review" & PID_RISK=$!

wait_group "Wave 2" \
  "quant-challenger:$PID_QUANT" \
  "risk-officer:$PID_RISK"

push_checked_branch "quant-challenger" "$BR_QUANT"
push_checked_branch "risk-officer" "$BR_RISK"

# Wave 3: one integration lead reconciles all independent reports.
INT_PROMPT="$RUNTIME_ROOT/prompts/stage0-integrator-resolved.md"
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
## Launcher safety override — authoritative for this run
Do **not** run `git add`, `git commit`, `git push`, `gh`, deployment commands, or any command that writes Git metadata. Leave exactly `docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md` as an uncommitted worktree change. The trusted launcher performs exact-path validation, commit, and isolated-branch push after you exit.
EOF

WT_INT="$RUNTIME_ROOT/worktrees/integration"
make_worktree "$BR_INT" "$BASE_SHA" "$WT_INT"
LOG_INT="$RUNTIME_ROOT/logs/integration.log"

info "Launching Stage-0 integration lead"
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
    codex exec --ephemeral --sandbox workspace-write < "$INT_PROMPT" \
    >"$LOG_INT" 2>&1

  mapfile -t int_changes < <(git status --porcelain=v1 | sed -E 's/^.. //')
  if (( ${#int_changes[@]} != 1 )) || [[ "${int_changes[0]}" != "docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md" ]]; then
    {
      echo "Integration scope violation."
      printf '  %s\n' "${int_changes[@]}"
    } >>"$LOG_INT"
    exit 41
  fi

  [[ -f "docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md" ]] || exit 42
  git add -- "docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md"
  git -c core.hooksPath=/dev/null commit -q -m "Stage0: integrate architecture research"

  [[ -z "$(git status --porcelain)" ]] || exit 43
  mapfile -t int_files < <(git diff --name-only "$BASE_SHA"..HEAD)
  if (( ${#int_files[@]} != 1 )) || [[ "${int_files[0]}" != "docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md" ]]; then
    exit 44
  fi
)

push_checked_branch "integration" "$BR_INT"

# Create a PR to the governance branch when GitHub CLI is available. This does
# not merge anything and cannot deploy production.
PR_URL=""
if command -v gh >/dev/null 2>&1; then
  PR_URL="$(gh pr create \
    --base "$BASE_BRANCH" \
    --head "$BR_INT" \
    --title "Stage 0 architecture research integration" \
    --body "Autonomous Stage-0 research integration. Research/docs only: investment architecture, methodology adaptation, data feasibility, beginner UX, quantitative challenge, and risk-of-ruin review. No runtime code or production deployment." \
    2>/dev/null || true)"
fi

cat > "$RUNTIME_ROOT/reports/final-status.txt" <<EOF
STAGE0_RESEARCH=COMPLETE
RUN_ID=$RUN_ID
BASE_SHA=$BASE_SHA
INTEGRATION_BRANCH=$BR_INT
INTEGRATION_REPORT=docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md
PR_URL=$PR_URL
PRODUCTION_DEPLOYED=NO
MAIN_MERGED=NO
EOF

info "============================================================"
info "STAGE-0 RESEARCH SWARM COMPLETE"
info "Integration branch: $BR_INT"
if [[ -n "$PR_URL" ]]; then
  info "Integration PR: $PR_URL"
fi
info "Report: docs/agent-team/STAGE0-ARCHITECTURE-REVIEW.md"
info "No merge to main and no production deployment were performed."
info "Runtime logs: $RUNTIME_ROOT/logs"
info "============================================================"
