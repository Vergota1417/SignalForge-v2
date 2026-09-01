# Autonomous Multi-Agent Orchestration

## Goal

The user should not have to review every agent's code or translate disagreements between agents.

The system should automate routine engineering review and escalate only genuine product decisions that are not already resolved by repository authority.

---

## 1. Team topology

Use one lead/integration agent and isolated implementation agents.

```text
                    LEAD / INTEGRATION
                           |
             reads contracts + owns task graph
                           |
      -------------------------------------------------
      |        |        |        |        |           |
   MASTER     ENV    LOCATION    PATH   CONFIRM    EXECUTION
    DATA
      |        |        |        |        |           |
      -------------------------------------------------
                           |
                   CALCULATED MASTER
                           |
                    DASHBOARD AGENT
                           |
                  VALIDATION / QA AGENT
                           |
                    INTEGRATION GATE
                           |
                         RELEASE
```

Implementation agents never merge directly to `main`.

---

## 2. Lead-agent startup sequence

The lead agent must perform these steps before assigning implementation work:

1. Read `AGENTS.md`.
2. Read `README.md`.
3. Read `MASTER-ARCHITECTURE.md`.
4. Read `WORK-PACKAGES.yaml`.
5. Inspect current Git status and base commit.
6. Confirm which work packages are unblocked by dependency state.
7. Create one branch/worktree per unblocked package.
8. Give each implementation agent only its package ID plus repository context; do not rewrite the package in free-form prose unless clarification is needed.

This reduces prompt drift. The repository contract, not an improvised prompt, is the source of truth.

---

## 3. Agent assignment template

Each coding agent should receive a short assignment like:

```text
You are assigned SignalForge work package WP-30.

Before editing anything:
1. Read AGENTS.md.
2. Read README.md.
3. Read docs/agent-team/MASTER-ARCHITECTURE.md.
4. Read WP-30 in docs/agent-team/WORK-PACKAGES.yaml.

Work only inside WP-30 allowed_paths.
Do not edit forbidden_paths or another package's contract.
Do not broaden scope.
Do not modify production BUY policy.
Do not create provider/network calls unless the package explicitly owns them.

Implement the package, add its required tests, run the required checks, and return a structured completion report.
If an out-of-scope change is necessary, stop and report BLOCKED instead of making the change.
```

No giant natural-language prompt should be needed after the repository contract exists.

---

## 4. Structured completion report

Every implementation agent returns exactly these fields to the integration agent:

```text
WORK_PACKAGE:
STATUS: READY | BLOCKED | NOT_READY
BASE_COMMIT:
HEAD_COMMIT:
FILES_CHANGED:
BEHAVIOR_CHANGED:
INTERFACES_PRODUCED:
INTERFACES_CONSUMED:
TESTS_RUN:
TEST_RESULTS:
PROVIDER_REQUEST_IMPACT:
AUTHORITATIVE_RULES_TOUCHED:
OUT_OF_SCOPE_CHANGES: NONE | list
KNOWN_LIMITATIONS:
BLOCKERS:
```

If `OUT_OF_SCOPE_CHANGES` is not `NONE`, the integration agent rejects the package unless a later authorized package owns those changes.

---

## 5. Automatic integration review order

The integration agent reviews packages in this order.

### Gate A — Scope

Reject immediately when:

- changed file is outside `allowed_paths`;
- forbidden path was modified;
- unrelated refactor/formatting appears;
- dependency/package contract was modified by the implementation agent.

Do not spend time semantically reviewing an out-of-scope diff.

### Gate B — Contract

Verify:

- required input/output shapes;
- shared snapshot identity;
- missing-data semantics;
- freshness/provenance fields;
- method-stage ordering;
- no duplicated authoritative policy.

### Gate C — Safety

Verify:

- no hard BUY bypass;
- no provider amplification;
- no direct UI provider calls;
- no fabricated unavailable evidence;
- no stale-symbol contamination;
- no chart-timeframe effect on decision data.

### Gate D — Tests

Run:

1. package-specific tests;
2. syntax checks;
3. baseline suite;
4. production reliability suite when applicable.

A package with red required tests is `NOT_READY`.

### Gate E — Integration

Only after A-D pass:

- integrate dependency-compatible packages;
- run interface tests across package boundaries;
- run full baseline and reliability suites again.

---

## 6. Conflict policy

Agents are not allowed to resolve architectural conflicts by compromise or majority vote.

Use this authority order:

1. `AGENTS.md`
2. `README.md`
3. `MASTER-ARCHITECTURE.md`
4. `WORK-PACKAGES.yaml`
5. authoritative owner source file
6. package implementation

If two packages disagree, the lower-authority implementation changes.

If the repository authority itself is genuinely ambiguous and the choice changes product behavior, escalate one concise decision to the user.

---

## 7. User involvement threshold

Do NOT ask the user to:

- review implementation details;
- choose variable names;
- choose equivalent libraries already allowed by the package;
- approve routine refactors that remain inside scope;
- decide which agent is correct when authority already resolves the issue;
- manually compare PR diffs.

Ask the user only when:

- two materially different product behaviors are both valid under current contracts;
- a new paid/external data source is required;
- a production trading rule would need to change;
- a new risk/cost/security tradeoff has no existing policy;
- required credentials/account permissions need user action.

---

## 8. Merge policy

Implementation-agent branches are never merged directly to `main`.

Preferred model:

```text
agent branches
     ↓
integration branch
     ↓
full CI + adversarial QA
     ↓
one release PR
     ↓
main
```

This gives the user one coherent release instead of ten unrelated PRs.

The release PR should include a single acceptance matrix:

```text
WP-10 Master Data        PASS
WP-20 Environment        PASS
WP-30 Location           PASS
WP-40 Path               PASS
WP-50 Confirmation       PASS
WP-60 Execution          PASS
WP-70 Master State       PASS
WP-80 Dashboard          PASS
WP-90 Calibration        PASS
WP-95 Adversarial QA     PASS

Baseline                 PASS
Production Reliability   PASS
Provider Budget Impact   NO INCREASE / documented
BUY Policy Changed       NO
Known Limitations        ...
```

---

## 9. Rollback policy

Every release integration must retain a known-good pre-integration commit.

If post-integration tests reveal cross-package behavior that cannot be resolved without broadening scope:

1. stop release;
2. revert the offending package(s) from the integration branch;
3. return them to their owner as `NOT_READY`;
4. keep unaffected packages isolated;
5. do not patch production policy as a shortcut.

---

## 10. Cost/request containment

Parallel coding agents do not receive permission to increase runtime market-data traffic.

Provider/runtime cost is an application architecture concern, not an agent-compute concern.

Any work package that would add a new upstream market/provider request must be separately authorized and document:

- why shared/master cached data cannot satisfy it;
- expected calls/minute;
- expected calls/day;
- cache TTL;
- fallback behavior;
- effect on existing provider budget;
- how System/Data Validation proves the request.

Without that authorization, the integration agent rejects the change.

---

## 11. Definition of autonomous success

The process is working correctly when the user can say a product-level goal and later receive one result such as:

```text
Release ready.
10/10 work packages passed.
All baseline and production reliability checks passed.
No BUY-policy change.
No provider-request increase.
No unrelated files changed.
Known limitation: validated news feed not connected.
```

The user should not need to understand which implementation agent wrote which function for the release to be trustworthy.
