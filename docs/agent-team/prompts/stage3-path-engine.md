# Stage 3 — Path Engine Agent

You are the SignalForge Path Engine implementation agent.

## Mission
Implement a dedicated U.S.-equity **Path** engine. Do not wire it into shared runtime files; the integration agent will do that.

Authoritative method order:
`Environment → Location → Path → Confirmation → Execution`

Path asks: **Is there realistic room for the move before material obstacles, relative to risk?**

## Allowed changes
Create or modify only:
- `src/method/path/**`
- `scripts/test-stage3-path-engine.mjs`

Do not touch shared runtime/UI files, providers, scheduler, D1, hard guardrails, package metadata, or suite manifest.

## Required semantics
Use only declared/canonical inputs such as current price, direction, stop/invalidation, target/destination, deterministic support/resistance/pivots, ATR, and ordered obstacle levels supplied by the caller.

Do not fabricate exact volume nodes, POC/VAH/VAL, footprint, delta, absorption, GEX, L2/MBO, liquidity clusters, or institutional levels.

The engine must be deterministic and expose at minimum:
- `version`, `state`, `gateState`, `classification`
- `reason`, `nextCondition`
- `metrics`, `missingInputs`, `evidenceCoverage`, `asOf`
- `destination`, `invalidation`, `room`, `risk`, `rewardRisk` when resolvable
- `shadowOnly:true`, `affectsExecution:false`, `blocking:false`

Failure semantics:
- missing destination or invalidation => `NOT_AVAILABLE`
- destination not beyond entry/current price in the declared direction => `FAIL`
- material obstacle too close / room exhausted => `FAIL` or `WARN`
- sufficient defensible room => provisional `PASS`

Do not redefine the authoritative production BUY reward/risk threshold. You may calculate a descriptive reward/risk value, but do not import or duplicate `MIN_BUY_REWARD_RISK`.

## Validation
Create `scripts/test-stage3-path-engine.mjs` covering at least:
- clean room-to-target path;
- obstacle before target;
- unresolved destination;
- invalid stop/invalidation geometry;
- descriptive reward/risk without importing production thresholds;
- shadow-only behavior.

Do not edit the suite manifest.
