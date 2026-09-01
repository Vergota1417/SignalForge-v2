# Stage 3 — Location Engine Agent

You are the SignalForge Location Engine implementation agent.

## Mission
Implement a dedicated U.S.-equity **Location** engine behind the existing five-stage tactical method. Do not wire it into shared runtime files; the integration agent will do that later.

Authoritative method order:
`Environment → Location → Path → Confirmation → Execution`

Location asks: **Is price in a defensible place to act without chasing?**

## Allowed changes
Create or modify only:
- `src/method/location/**`
- `scripts/test-stage3-location-engine.mjs`

Do not touch `src/entry.js`, `src/method/five-stage-alpha.js`, `public/**`, provider code, scheduler code, D1 schema, hard guardrails, package metadata, suite manifest, or unrelated files.

## Required semantics
Use only supported canonical OHLCV-derived evidence. You may use deterministic pivot/support/resistance, range position, ATR-normalized distance, declared stop/invalidation, preferred entry zone, current price, and overextension/chase logic when supplied as inputs.

Do not fabricate exact volume profile, POC/VAH/VAL, footprint, executed delta, absorption, GEX, L2, MBO, institutional intent, or resting liquidity.

The engine must be deterministic and pure from passed inputs and expose at minimum:
- `version`, `state`, `gateState`, `classification`
- `reason`, `nextCondition`
- `metrics`, `missingInputs`, `evidenceCoverage`, `asOf`
- `shadowOnly:true`, `affectsExecution:false`, `blocking:false`

Failure semantics:
- required missing inputs => `NOT_AVAILABLE`
- overextended/chasing or invalid location => `FAIL` or `WARN` with a precise reason
- clearly defensible location => provisional `PASS`
- sector/order-flow data must never be invented

Keep stop/thesis invalidation distinct from do-not-chase/overextension.
Do not redefine BUY thresholds. This engine remains shadow-only until separately validated.

## Validation
Create `scripts/test-stage3-location-engine.mjs` covering at least:
- defensible pullback/support location;
- overextended/chasing location;
- missing stop/invalidation;
- missing required price/structure input;
- shadow-only cannot become authoritative execution permission.

Do not edit the suite manifest. The integration agent owns shared wiring and manifest changes.
