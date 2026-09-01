# SignalForge Agent Governance

This file is mandatory for every coding agent, sub-agent, reviewer agent, integration agent, and automation that changes this repository.

## 1. Order of authority

Read these before making changes:

1. `AGENTS.md` — agent behavior, scope, integration, and safety rules.
2. `README.md` — current production architecture and source-of-truth ownership.
3. `docs/agent-team/MASTER-ARCHITECTURE.md` — target rebuild architecture and Dashboard block contracts.
4. `docs/agent-team/WORK-PACKAGES.yaml` — explicit work ownership, dependencies, and acceptance tests.
5. Authoritative source files named by `README.md` such as `src/hard-guardrails.js`, `src/scheduler.js`, and `public/api-request-policy.js`.

If instructions conflict, stop and report the conflict to the integration agent. Do not invent a compromise.

## 2. Product intent that must not drift

SignalForge is being rebuilt around this ordered method:

`Environment → Location → Path → Confirmation → Execution`

The Dashboard is a renderer of one centralized, validated symbol state. Dashboard blocks must not independently acquire market data, create their own provider requests, redefine a trading rule, or create a second source of truth.

During the zero-data Dashboard stage, the fixed visual placeholder is exactly:

`RandomSTOCKASAN FIXed example`

Do not replace it with a real ticker in examples, tests, screenshots, defaults, or UI copy unless a later work package explicitly changes the placeholder contract.

## 3. One owner per concern

Each work package has an explicit owner and allowed path set in `docs/agent-team/WORK-PACKAGES.yaml`.

An agent MAY:

- modify only paths explicitly owned by its work package;
- add tests directly required by its work package;
- make a narrowly necessary compatibility change only when the work package explicitly permits it.

An agent MUST NOT:

- refactor unrelated modules;
- rename unrelated files or symbols;
- change formatting across unrelated files;
- upgrade dependencies unless assigned;
- change provider credentials, provider policy, request budgets, scheduler cadence, D1 schema, BUY thresholds, evidence policy, or production guardrails unless those exact owners are assigned;
- re-enable dormant or quarantined network UI;
- modify another agent's work package contract;
- merge directly to `main`.

If a necessary change falls outside owned paths, create a blocker note for the integration agent. Do not make the out-of-scope edit.

## 4. Branch/worktree isolation

Every work package uses its own branch/worktree.

Recommended branch format:

`agent/<work-package-id>-<short-name>`

Never share a writable worktree between agents. Never have two agents edit the same file concurrently unless the integration plan explicitly assigns sequential ownership.

Before coding:

1. confirm the correct base commit;
2. confirm a clean worktree;
3. read the owning architecture documents;
4. list the exact files that will be changed;
5. compare the list to the work package `allowed_paths`.

## 5. Data architecture rules

### 5.1 Central acquisition

UI blocks do not call providers.

The eventual flow is:

`providers → raw cache → master symbol snapshot → engines → calculated master state → Dashboard blocks`

A visual block may consume shared state. It may not create an independent market-data fetch path.

### 5.2 Canonical datasets

Trading calculations must use fixed dataset roles, not whatever timeframe the user selected on a chart.

- `ANALYSIS`: canonical higher-timeframe data.
- `EXECUTION`: canonical completed intraday data.
- `BENCHMARK`: canonical benchmark data.
- `CHART`: visualization only; user timeframe changes do not change trading calculations.

Exact timeframe/interval values are defined by the master-data work package and must then be consumed, not redefined, by other engines.

### 5.3 Provenance and freshness

Every calculated block must eventually expose:

- snapshot ID;
- source/provider provenance;
- source timestamp;
- calculation timestamp;
- freshness state;
- evidence/input coverage;
- missing inputs;
- whether the result can affect execution.

No block may display stale data as current or missing data as zero.

### 5.4 No fabricated market microstructure

Do not synthesize unavailable data.

Examples that require real feeds include footprint bid/ask delta, true absorption, GEX, L2, and MBO/L3. If the necessary source is unavailable, return `NOT_AVAILABLE`/missing evidence rather than approximating it from OHLC candles.

## 6. Trading safety rules

The production BUY policy is owned by `src/hard-guardrails.js` and related authoritative owners documented in `README.md`.

No agent may weaken BUY authorization to make a new engine or UI look successful.

Research/shadow engines may calculate and validate outcomes but cannot silently authorize or block production BUY unless a future explicitly approved production-policy work package promotes them.

A `BUY NOW` string without authoritative hard-authorization proof is never sufficient downstream.

## 7. Agent completion contract

An implementation agent is not done when code compiles. It is done only when all of these are true:

1. work stayed inside allowed scope;
2. assigned acceptance tests pass;
3. full relevant baseline tests pass;
4. production reliability guardrails pass when the change can affect production behavior;
5. no new provider call was introduced unless assigned and budgeted;
6. no authoritative rule was duplicated;
7. no unrelated diff remains;
8. the agent reports files changed, behavior changed, tests run, and unresolved blockers.

If any item fails, return the work to the integration agent as `NOT READY`.

## 8. Integration-agent responsibilities

The integration agent is the only agent allowed to assemble work packages.

It must:

- verify dependency order;
- inspect changed-file scope before reviewing semantics;
- reject unrelated edits automatically;
- compare interfaces between producers and consumers;
- run the full test manifest after integration;
- run production reliability guardrails;
- check for provider-request amplification;
- check canonical symbol/snapshot consistency;
- check that Dashboard blocks consume the same master state;
- resolve conflicts by source-of-truth hierarchy, not by averaging agent opinions;
- refuse merge if any required acceptance test is red.

The integration agent must not silently rewrite production policy to resolve a conflict.

## 9. User-review policy

The intended workflow minimizes user code review.

The user should receive one release-level acceptance report containing:

- what changed in product behavior;
- which work packages passed;
- test/CI status;
- provider/request impact;
- known limitations;
- any decision that truly requires product-owner input.

Do not ask the user to review routine code, choose between equivalent implementation details, or reconcile agent disagreements that are already governed by this contract.

Escalate only when two valid product interpretations remain and repository authority does not resolve them.

## 10. Stop conditions

Stop the work package instead of guessing when:

- required data is unavailable;
- the contract is ambiguous in a way that changes product behavior;
- an out-of-scope authoritative file must change;
- a test reveals a production-policy conflict;
- the requested feature would fabricate evidence;
- the change would create an unbudgeted provider workload;
- another agent already owns the same write surface.

A clean blocker is preferable to an incorrect autonomous change.
