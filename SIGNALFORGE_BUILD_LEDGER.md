# SignalForge Build Ledger

This file is the persistent source of truth for the build sequence. Complete and merge each stage before moving to the next one unless a production bug blocks operation.

## DONE

- Stages 1–10: decision engine, dynamic discovery, Smart Screener, after-hours research, telemetry, background summaries, Weekend Intelligence, forward paper simulation, realistic paper capital/contributions, UI routing fixes.
- Weekend research breadth: active candidates are backfilled from the 36-symbol weekly research universe instead of stopping on a thin Friday pool.

### Stage 11 — Evidence Database ✅

- [x] Append radar observations instead of only keeping the latest quote.
- [x] Append deep-analysis snapshots instead of only keeping the latest signal state.
- [x] Save decision inputs: price, movement, RVOL, discovery score/velocity, liquidity, readiness, four critical gates, entry/stop/target, R/R, benchmark regime.
- [x] Attach an analysis model/config version to every deep-analysis observation.
- [x] Prevent UI refreshes from creating duplicate evidence by using 15-minute time buckets/idempotency.
- [x] Add evidence health/status count functions for later telemetry.

### Stage 11.1 — Outcome Tracker ✅

- [x] Evaluate saved observations after 1, 3, 5, 10, and 20 trading sessions.
- [x] Record forward return, MFE, MAE, and target-hit/stop-hit ordering.
- [x] Track rejected and WAIT observations as well as BUY observations because outcomes attach to all saved evidence rows with a valid price.
- [x] Preserve unresolved outcomes until enough future completed sessions exist.
- [x] Group pending observations by symbol so one daily fetch can complete many observations/horizons.
- [x] Mark same-session target+stop collisions as ambiguous rather than inventing intraday ordering.

### Stage 11.2 — Scanner / Request Budget Engine ✅

- [x] Divide discovery into HOT / ACTIVE / EXPLORE tiers with bounded tier sizes.
- [x] Revisit HOT names every ~30 minutes when due and ACTIVE names every ~90 minutes, while preventing any name from being repeatedly hit inside 15 minutes.
- [x] Preserve at least one EXPLORE slot in the normal five-symbol scan batch so new movement can still be discovered.
- [x] Use every useful 15-minute non-Friday market slot from 09:45–15:30 ET instead of only hourly discovery.
- [x] Limit each market slot to five radar quotes and at most one deep promotion to preserve provider headroom.
- [x] Record provider request purposes for radar quotes, market time-series by timeframe/context, symbol search, and stock-catalog refresh while retaining the global daily safety counter.
- [x] Keep after-hours research/outcome maintenance and the existing quota target/reserve rather than consuming the full daily budget during live scanning.

### Stage 11.3 — Benchmark Context ✅

- [x] Automatically map stock → industry/sector benchmark → broad-market benchmark, with SPY fallback for unmapped names.
- [x] Persist calculated industry, sector, and market relative-strength/trend context with deep-analysis evidence observations.
- [x] Add 1/3/5/10/20-session industry, sector, and market benchmark returns plus excess returns using the last completed benchmark session at/before the observation as the no-lookahead baseline.
- [x] Add a sector-rotation cohort evaluator and regression coverage while explicitly keeping rotation evidence-only rather than silently promoting it to a critical gate.

### Stage 11.4 — Evidence / Model Evaluation ✅

- [x] Measure win rate, expectancy, profit factor, drawdown, false positives, false negatives, and missed winners.
- [x] Segment performance by readiness, gate configuration, research score, RVOL, regime, sector, holding horizon, and model version.
- [x] Compare SignalForge against the appropriate market and sector benchmarks rather than merely checking whether observations made money.
- [x] Qualify evidence-backed probability calibration only after a sufficiently large resolved BUY cohort, while keeping model-version cohorts separate.

### Stage 11.5 — Paper Simulator Hardening ✅

- [x] Mark open paper positions from the freshest available radar quote or saved signal observation.
- [x] Calculate lifetime aggregate metrics from the full closed-trade history independently from the recent 100-trade UI list.
- [x] Retain the full equity history for lifetime drawdown while downsampling the UI curve to a bounded representative series.
- [x] Add cached SPY benchmark return and SignalForge excess return without spending a provider request merely to render simulation results.
- [x] Save analysis model/config version with every new paper position and closed paper trade while preserving legacy rows as LEGACY/UNKNOWN.
- [x] Separate lifetime paper results by model cohort when algorithms change.

## CURRENT

Evidence foundation Stages 11–11.5 are complete. The next large feature/model stage must be selected from measured evidence rather than added ahead of validation.

## NEXT RULE

Use the Stage 11 evidence database, benchmark-relative outcomes, model evaluation, and hardened paper simulator to decide what improves real forward performance. Production bugs may be fixed immediately. New critical gates or major UI/model features should be justified by forward evidence before promotion.
