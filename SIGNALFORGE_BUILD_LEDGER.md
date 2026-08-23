# SignalForge Build Ledger

This file is the persistent source of truth for the build sequence. Complete and merge each stage before moving to the next one unless a production bug blocks operation.

## DONE

- Stages 1–10: decision engine, dynamic discovery, Smart Screener, after-hours research, telemetry, background summaries, Weekend Intelligence, forward paper simulation, realistic paper capital/contributions, UI routing fixes.
- Weekend research breadth: active candidates are backfilled from the 36-symbol weekly research universe instead of stopping on a thin Friday pool.

## CURRENT

### Stage 11 — Evidence Database

Goal: turn SignalForge from a cache-driven decision app into a point-in-time learning system.

- [ ] Append radar observations instead of only keeping the latest quote.
- [ ] Append deep-analysis snapshots instead of only keeping the latest signal state.
- [ ] Save decision inputs: price, movement, RVOL, discovery score/velocity, liquidity, readiness, four critical gates, entry/stop/target, R/R, benchmark regime.
- [ ] Attach an analysis model/config version to every deep-analysis observation.
- [ ] Prevent UI refreshes from creating duplicate evidence by using time buckets/idempotency.
- [ ] Add evidence health/status counts for later telemetry.

### Stage 11.1 — Outcome Tracker

- [ ] Evaluate saved observations after 1, 3, 5, 10, and 20 trading sessions.
- [ ] Record forward return, benchmark-relative return, MFE, MAE, target-hit/stop-hit ordering.
- [ ] Track rejected and WAIT observations as well as BUY observations.
- [ ] Preserve unresolved outcomes until enough future market data exists.

### Stage 11.2 — Scanner / Request Budget Engine

- [ ] Divide discovery into HOT / ACTIVE / EXPLORE tiers.
- [ ] Revisit HOT names more frequently than cold exploration names.
- [ ] Use every useful 15-minute market-hours slot within the provider safety budget.
- [ ] Record where daily provider requests were spent.
- [ ] Reserve remaining quota for after-hours research/outcome completion.

### Stage 11.3 — Benchmark Context

- [ ] Automatically map stock → industry/sector benchmark → broad-market benchmark.
- [ ] Persist sector and market relative-strength context with evidence observations.
- [ ] Test whether sector rotation improves forward outcomes before using it as a critical gate.

### Stage 11.4 — Evidence / Model Evaluation

- [ ] Measure win rate, expectancy, profit factor, drawdown, false positives, false negatives, and missed winners.
- [ ] Segment performance by readiness, gate configuration, research score, RVOL, regime, sector, holding horizon, and model version.
- [ ] Compare SignalForge against the appropriate benchmark rather than merely checking whether trades made money.
- [ ] Calibrate displayed probabilities only from sufficiently large forward evidence cohorts.

### Stage 11.5 — Paper Simulator Hardening

- [ ] Mark open paper positions from fresher market observations.
- [ ] Calculate lifetime aggregate metrics independently from the recent-trade UI limit.
- [ ] Fix long-run equity-curve retention/downsampling.
- [ ] Add benchmark return and excess return.
- [ ] Save model/config version with every paper trade.
- [ ] Separate results by model cohort when algorithms change.

## NEXT RULE

Do not add another large UI feature until Stages 11–11.5 are working. Production bugs may be fixed immediately, but feature requests should be placed in this ledger and resumed after the evidence foundation.
