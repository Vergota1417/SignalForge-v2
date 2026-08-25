# SignalForge Build Ledger — Historical Chronology

This file is an **archive of the build sequence**, not the current architecture authority.

For current system ownership, production rules, deployment structure, and future-change procedure, read `README.md`. For the exact deployed release identity, read `public/build-info.js`. Git and pull-request history remain the detailed audit trail for every implementation stage.

Do not use an old stage entry in this ledger to override current production code, current regression tests, or the architecture rules in `README.md`.

## Completed build sequence

### Stages 1–10

Established the original decision engine, dynamic discovery, Smart Screener, after-hours research, telemetry, background summaries, Weekend Intelligence, forward paper simulation, realistic paper capital/contributions, and centralized UI routing.

### Stage 11 — Evidence Database

Added append-only radar and deep-analysis observations, model/config identity, decision inputs, 15-minute evidence deduplication, and evidence health/status reporting.

### Stage 11.1 — Outcome Tracker

Added 1/3/5/10/20-session forward outcomes, MFE/MAE, target/stop ordering, unresolved-outcome retention, and grouped outcome maintenance without look-ahead.

### Stage 11.2 — Scanner / Request Budget Engine

Added HOT/ACTIVE/EXPLORE scanner tiers, bounded recheck cadences, exploration preservation, provider-purpose accounting, and provider-budget-aware live/research work.

### Stage 11.3 — Benchmark Context

Added industry/sector/market benchmark mapping, relative-strength context, benchmark-relative forward outcomes, and evidence-only sector-rotation evaluation.

### Stage 11.4 — Evidence / Model Evaluation

Added win rate, expectancy, profit factor, drawdown, false-positive/false-negative/missed-winner analysis, segmented evaluation, and sample-qualified probability calibration.

### Stage 11.5 — Paper Simulator Hardening

Added fresher marks, lifetime metrics, bounded chart downsampling, cached SPY comparison, and model-cohort identity for paper positions/trades.

### Stage 12 — Evidence-Guided Strategy Optimization

Added setup cohort ranking, decision-error analysis, gate-value analysis, Champion/Challenger comparison, and explicit evidence-only optimization policy.

### Stage 13 — Earlier Movement Detection

Added movement acceleration/RVOL/liquidity scoring before BUY readiness, Early Movement evidence, late-chase penalties, and explicit non-BUY movement states.

### Stage 14 — Forward Shadow Validation

Added persistent challenger definitions, rollout timestamps, post-rollout forward-only comparison, sample thresholds, and review-only promotion semantics. A shadow pass does not change production automatically.

### Stage 14.1 — Unified Action Experience

Unified Early Movement and saved deep-analysis state into one user-facing action progression while preserving BUY NOW as the only entry-permission state.

### Stage 14.2 — Production Visibility / PWA Freshness

Added visible deployed version/shell identity, stronger service-worker update behavior, PWA shell versioning, and build-metadata validation.

## Later Stage 14 work

Stage 14 continued well beyond the original ledger snapshot. Later work includes opening-pipeline reliability, provider-symbol quarantine, mobile Radar/watchlist improvements, last-symbol persistence, opportunity crawling, participation/execution confirmation, session/opening-range shadow models, mobile decision-first UX, adaptive request scheduling, trade planning and position management, Activity Rhythm, Pattern Context and Pattern validation, decision/setup episode validation, detection-latency auditing, chart-control reliability, request-usage hardening, Pattern-network quarantine, and hard production guardrails.

The authoritative details for those changes are the merged pull requests and regression tests in `scripts/`. Do not add a new `CURRENT` section here. Current state belongs in `README.md`, `public/build-info.js`, production health endpoints, and executable tests.

## Historical policy that remains important

- Research and shadow models are evidence-only until deliberately promoted after sufficient validation.
- Repeated observations must not manufacture independent setup samples.
- Provider usage must stay budgeted and attributable.
- BUY authorization must remain stricter than a score or a visual pattern.
- Production changes should be isolated, tested, reviewed, and merged before unrelated work is layered on top.
