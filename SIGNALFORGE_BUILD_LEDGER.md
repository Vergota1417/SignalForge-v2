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

### Stage 12 — Evidence-Guided Strategy Optimization ✅

- [x] Rank setup cohorts by resolved forward performance with minimum sample qualification.
- [x] Analyze losing BUY observations and missed winners to identify recurring false-positive and false-negative characteristics.
- [x] Measure the forward value and winner-block rate of individual decision gates before changing production rules.
- [x] Compare configurable Challenger rules against the current BUY NOW Champion on expectancy, benchmark excess return, false positives, adverse excursion, and sample size.
- [x] Keep retrospective promotion findings evidence-only and require forward shadow validation before any production gate change.
- [x] Expose the optimization report through the backend API and include Stage 12 regression checks in the complete validation suite.

### Stage 13 — Earlier Movement Detection ✅

- [x] Score developing movement from discovery-score velocity, RVOL participation, price expansion, and discovery strength before a setup reaches BUY NOW.
- [x] Penalize already-extended price moves so late momentum does not outrank healthier developing movement.
- [x] Persist Early Movement observations in the evidence database under a separate model version for later forward evaluation.
- [x] Surface EARLY MOVEMENT — BUILDING / MOVEMENT WATCH / QUIET states in radar cards with the contributing measurements and an explicit non-BUY action label.
- [x] Keep Early Movement evidence-only; it does not bypass the live BUY gates or automatically open paper positions.
- [x] Add Stage 13 regression coverage to the complete validation suite.

### Stage 14 — Forward Shadow Validation ✅

- [x] Add a persistent D1 challenger registry with a fixed rollout timestamp so pre-rollout evidence cannot leak into the forward test.
- [x] Evaluate Champion vs Challenger using only post-rollout resolved analysis outcomes.
- [x] Require a minimum forward sample before leaving COLLECTING state.
- [x] Persist COLLECTING / FORWARD_PASS / FORWARD_FAIL results and the full evaluation payload.
- [x] Include forward-shadow results inside the existing evidence optimization report without spending additional market-data requests.
- [x] Keep a forward pass evidence-only: it nominates a challenger for deliberate review but never mutates production gates automatically.
- [x] Add Stage 14 regression coverage to the complete validation suite.

### Stage 14.1 — Unified Action Experience ✅

- [x] Combine Early Movement and saved deep-analysis state into one primary action without weakening BUY NOW gates.
- [x] Present QUIET → WATCH → BUILDING → READY SOON → BUY NOW as the visible opportunity progression.
- [x] Preserve WAIT FOR PULLBACK, AVOID, and SELL / EXIT as explicit protective overrides rather than hiding them inside a score.
- [x] Show movement, readiness, gate count, and the blocking reason directly on Opportunity Radar cards.
- [x] Mirror the same unified action language on the selected-symbol dashboard so tapping a Radar candidate does not change interpretation.
- [x] Keep BUY NOW as the only entry-permission state; BUILDING and READY SOON remain preparation states.
- [x] Add Stage 14.1 regression and syntax coverage to the complete validation suite.

## CURRENT

Stage 14.1 is complete. SignalForge now presents one consistent action hierarchy from early discovery through deep-analysis confirmation while retaining the evidence-first production rules. The forward challenger remains in COLLECTING until enough post-rollout 10-session outcomes resolve.

## NEXT RULE

Do not invent another production model change while the forward cohort is immature. Continue collecting Early Movement and Challenger evidence. The next strategy change must be selected from measured outcomes, beat the current Champion retrospectively, and independently pass Stage 14 forward shadow validation before deliberate production review.
