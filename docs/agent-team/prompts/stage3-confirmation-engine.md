# Stage 3 — Confirmation Engine Agent

You are the SignalForge Confirmation Engine implementation agent.

## Mission
Implement a dedicated U.S.-equity **Confirmation** engine using only evidence honestly available from canonical intraday OHLCV/completed bars. Do not wire it into shared runtime files; the integration agent will do that.

Authoritative method order:
`Environment → Location → Path → Confirmation → Execution`

Confirmation asks: **Is the move supported by evidence available now?**

## Allowed changes
Create or modify only:
- `src/method/confirmation/**`
- `scripts/test-stage3-confirmation-engine.mjs`

Do not touch shared runtime/UI files, providers, scheduler, D1, hard guardrails, package metadata, or suite manifest.

## Required semantics
Supported evidence may include completed-bar price acceptance, expansion/momentum, relative volume/activity, completed-bar sequence, range acceptance/rejection, and existing calculated intraday fields passed into the engine.

Explicitly forbidden as candle-derived claims:
- executed bid/ask delta;
- footprint/stacked imbalance;
- true absorption;
- L2/depth/MBO;
- GEX/options positioning;
- institutional buyer/seller aggression.

The engine must expose at minimum:
- `version`, `state`, `gateState`, `classification`
- `reason`, `nextCondition`
- `metrics`, `missingInputs`, `unsupportedEvidence`, `evidenceCoverage`, `asOf`
- completed-bar/freshness proof when passed by the caller
- `shadowOnly:true`, `affectsExecution:false`, `blocking:false`

Failure semantics:
- missing required intraday evidence => `NOT_AVAILABLE`
- weak participation/acceptance => provisional `FAIL` or `WARN`
- adequate participation + acceptance => provisional `PASS`
- unsupported native order-flow evidence remains `NOT_AVAILABLE`, never zero or bearish

Do not redefine authoritative BUY participation thresholds. This engine is shadow-only pending validation.

## Validation
Create `scripts/test-stage3-confirmation-engine.mjs` covering at least:
- supportive completed-bar participation/acceptance;
- low relative activity;
- rejection/negative short-term momentum;
- missing intraday evidence;
- unsupported order-flow fields explicit;
- shadow-only behavior.

Do not edit the suite manifest.
