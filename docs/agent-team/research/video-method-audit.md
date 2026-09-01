# Stage-0 Video Methodology Audit — U.S. Equities

## Decision and scope

**Recommendation: MODIFY before implementation contracts are frozen.** The ordered architecture is a useful decomposition, but the current documents define stage questions and result shapes rather than deterministic rules. It can proceed as a gated research framework; it is not yet a validated U.S.-equity strategy.

This audit translates the secondary source notes into an implementation-safe specification. `EXACT_UNIVERSAL` means a logical or evidence-integrity rule transfers exactly, not that a trading edge is proven. Every retained concept has exactly one classification:

- `EXACT_UNIVERSAL`: transferable sequencing, logic, or truthfulness rule.
- `STOCK_ADAPTATION_REQUIRED`: coherent stock concept needing an equity-specific definition and validation.
- `DATA_REQUIRED`: cannot be truthfully calculated without a specified native feed.
- `RESEARCH_ONLY`: testable hypothesis that must remain shadow evidence.
- `REJECT_FOR_STOCKS`: must not be copied into single-stock logic.

“Production eligible” below means eligible to participate after the stated validation. It never means independent authority to create `BUY NOW`; `src/hard-guardrails.js` remains authoritative.

## Architecture audit

Keep `Environment → Location → Path → Confirmation → Execution` as conditional gates, never an averaged score.

1. **Environment** determines whether the surrounding auction is intelligible and directionally suitable for further evaluation.
2. **Location** requires a structurally definable thesis and invalidation point.
3. **Path** requires a declared destination, orders material obstacles, and proves adequate room. This is SignalForge's useful addition to the source method: it prevents a good location and attractive confirmation from licensing an entry directly into resistance, an exhausted range, or an economically inadequate target.
4. **Confirmation** uses correctly named observable behavior. Bar-based evidence must remain distinct from true order flow.
5. **Execution** consumes same-snapshot upstream results and authoritative production policy without reinterpreting it.

The contracts remain too vague to code safely. Each needs direction and horizon, required versus optional evidence, formulas and thresholds, completed-bar/as-of-time rules, session and corporate-action treatment, state enumeration, freshness, missing-data behavior, and `affectsExecution`. Confidence/coverage describe evidence quality; they cannot rescue a failed gate. Scores may rank research candidates only.

## Stage-by-stage specification

### Cross-stage

| Concept | Classification | Required inputs | Production eligibility | Validation requirement | Failure semantics |
| --- | --- | --- | --- | --- | --- |
| Ordered conditional gates | EXACT_UNIVERSAL | Same canonical symbol, snapshot ID, direction, horizon, and as-of time | Pipeline control only | Tests that later PASS/high confidence cannot compensate for an upstream block | Required `FAIL`, `LOCKED`, `NOT_AVAILABLE`, stale, or insufficient evidence locks execution; never average |
| Location before confirmation | EXACT_UNIVERSAL | Valid Environment result and defined Location thesis | Ordering rule | Confirmation must not independently create a candidate | Confirmation without valid location is non-actionable |
| Canonical dataset roles | EXACT_UNIVERSAL | Provenanced `ANALYSIS`, `EXECUTION`, `BENCHMARK`; visualization-only `CHART` | Data-integrity rule | Snapshot/no-lookahead/chart-isolation tests | Mixed roles/snapshots produce `ERROR`/`NOT_AVAILABLE` and lock affected gates |
| Required versus optional evidence | EXACT_UNIVERSAL | Per-feature criticality, minimum coverage, missing inputs, `affectsExecution` | After each setup enumerates requirements | Exhaustive missing/stale/partial matrix | Required missing evidence fails closed; optional absence is `PARTIAL`, never bearish/zero |
| Direction and holding-horizon binding | STOCK_ADAPTATION_REQUIRED | Long/short direction, decision/entry/holding horizons, canonical intervals | Not until each supported strategy is defined | Separate walk-forward stock validation by horizon | Ambiguity yields `NOT_EVALUATED` and locks downstream stages |
| Time/session/data boundaries | STOCK_ADAPTATION_REQUIRED | Exchange calendar, RTH/extended-hours policy, timezone, completed bars, split/dividend adjustment, halt and minimum-history policy | After master-data contract | DST, holidays, half-days, halts, splits, stale quote, incomplete-bar tests | Ambiguous/stale/halted/unadjusted data is `NOT_AVAILABLE`/`STALE`; no execution |
| Provenance and freshness | EXACT_UNIVERSAL | Source timestamps, calculation time, snapshot ID, age limits, missing-input map | Mandatory integrity control | Freshness and mixed-provenance tests | Missing provenance or stale required data fails closed |

### Environment

| Concept | Classification | Required inputs | Production eligibility | Validation requirement | Failure semantics |
| --- | --- | --- | --- | --- | --- |
| Balance versus imbalance | STOCK_ADAPTATION_REQUIRED | Adjusted ANALYSIS bars; exact lookback, overlap, range, and expansion formulas | Shadow until validated; later setup gate | Pre-register formula/thresholds; walk-forward tests by liquidity, size, volatility, regime | Insufficient/indeterminate data is `UNKNOWN`, not sideways |
| Bullish/bearish/sideways structure | STOCK_ADAPTATION_REQUIRED | Deterministic swing algorithm, lookback, hierarchy, completed adjusted bars | Shadow initially | Define pivot sensitivity/conflict/invalidation; out-of-sample calibration | Conflicts are `MIXED`; missing history is `NOT_AVAILABLE` |
| Multiple-timeframe alignment | STOCK_ADAPTATION_REQUIRED | Fixed role intervals and per-horizon structure | Not until interval and conflict policy are stock-specific | Compare interval sets without lookahead by holding horizon | Missing required timeframe/conflict blocks setups that require alignment; never borrow chart interval |
| Source 4h/1h/15m/5m stack | RESEARCH_ONLY | Truthfully supported stock bars and session policy | Shadow only | Compare with alternative equity stacks by horizon/liquidity/gaps | No silent interval substitution |
| Volatility/regime context | STOCK_ADAPTATION_REQUIRED | Exact ATR/realized-volatility/regime formulas, lookbacks, adjusted bars, benchmark where used | Shadow until validated | Sensitivity and walk-forward tests across calm, event, gap, crisis regimes | Unclassified/stale regime is `UNKNOWN` |
| Market/sector alignment | STOCK_ADAPTATION_REQUIRED | Point-in-time benchmark/sector mapping, synchronized adjusted bars, exact formula | Shadow until mapping and incremental value validate | Delisting-bias controls and ablation versus stock-only model | Missing mapping is `NOT_AVAILABLE`, not aligned/opposed |
| Repeated failed breakouts / return to value | STOCK_ADAPTATION_REQUIRED | Exact level, acceptance window, excursion, count, lookback, valid value reference | Candidate no-trade gate only after validation | Define all events; forward stock outcomes | Unevaluable is `UNKNOWN`; validated degradation can become `FAIL/NO_TRADE` |
| Overlap with little expansion | STOCK_ADAPTATION_REQUIRED | Exact overlap/expansion metrics, lookback, volatility normalization | Candidate no-trade gate after validation | Threshold sensitivity and regime cohorts | Indeterminate is `UNKNOWN`; validated threshold may be `FAIL/NO_TRADE` |
| No clean location/path | EXACT_UNIVERSAL | Location and Path readiness with reasons | Fail-closed orchestration | Environment cannot waive missing later stages | Location/Path own definitive block; execution stays locked |
| Gamma/GEX, call/put walls, flip | DATA_REQUIRED | Point-in-time option chain, strikes/expiries, correctly timestamped OI, greeks or reproducible model inputs, price, multiplier/corporate actions, provenance | Context-only after feed audit and equity validation; never authorization | Vendor/method reconciliation, OI-lag/timestamp tests, forward tests by liquidity/expiry | Without legitimate feed return `NOT_AVAILABLE`; gamma never overrides actual price behavior |

### Location

| Concept | Classification | Required inputs | Production eligibility | Validation requirement | Failure semantics |
| --- | --- | --- | --- | --- | --- |
| Prior highs/lows and swing ranges | STOCK_ADAPTATION_REQUIRED | Adjusted bars, deterministic pivot algorithm, lookback, session, prominence | Shadow; later zones/invalidation/destination | Walk-forward robustness; prevent future-pivot leakage | Insufficient/unresolved swing is `NOT_AVAILABLE`; never invent a level |
| Support/resistance zones | STOCK_ADAPTATION_REQUIRED | Named construction, zone width, touches/recency, adjusted bars | Shadow; later structural evidence | Variant comparison, stability, incremental value | `NONE_FOUND` differs from missing-data `NOT_AVAILABLE` |
| Fixed/range volume profile | STOCK_ADAPTATION_REQUIRED | Volume-at-price observations or declared OHLCV allocation approximation; anchor/range, bin/tick, session, adjustment, value-area method | Exact profile after validation; OHLCV approximation explicitly labeled and shadow until error quantified | Trusted-reference reconciliation and anchor/bin/approximation sensitivity | Unsupported granularity/range is `NOT_AVAILABLE`; never call approximation exact traded volume-at-price |
| POC/VAH/VAL | STOCK_ADAPTATION_REQUIRED | Valid profile; value-area percentage/expansion, POC tie, range/session/bin rules | Shadow until reproducible and validated; never automatic entry | Golden fixtures and forward stock outcomes | Missing profile is `NOT_AVAILABLE`, not zero; ties use documented deterministic rule |
| High-/low-volume nodes | STOCK_ADAPTATION_REQUIRED | Valid profile; smoothing, extrema, prominence, minimum volume | Shadow | Reference fixtures, sensitivity, forward traversal/rejection cohorts | No node is `NONE_FOUND`; no profile is `NOT_AVAILABLE` |
| Premium/discount | STOCK_ADAPTATION_REQUIRED | Valid range low/high, current price, range provenance, midpoint and direction | Location filter after range validation; never predictor | Alternative anchors and direction-specific out-of-sample results | Invalid/stale/zero-width range is `NOT_AVAILABLE`; cannot authorize |
| Fibonacci 0.50/0.62/0.705/0.788/0.886/1.10 | RESEARCH_ONLY | Deterministic adjusted swing anchors, direction, exact formulas | Shadow annotation/features only | Pre-register anchors/ratios, correct multiple comparisons, compare simple range-position baselines | Missing anchors is `NOT_AVAILABLE`; proximity is not support/confirmation/entry |
| Preferred 0.705–0.886 response area | RESEARCH_ONLY | Valid Fib anchors and independently defined higher-timeframe alignment | Shadow only | Stock forward tests and ablation against arbitrary bands/midpoint | Presence cannot pass Location; absence cannot block production |
| Distance to invalidation/destination | STOCK_ADAPTATION_REQUIRED | Executable price, direction, deterministic stop/target, normalization, timestamps | After level owners/formulas freeze; hard R/R remains authoritative | Unit, gap, slippage, target/stop-ordering tests | No defensible stop or target locks Location/Path/Execution |

### Path

| Concept | Classification | Required inputs | Production eligibility | Validation requirement | Failure semantics |
| --- | --- | --- | --- | --- | --- |
| Destination before confirmation | EXACT_UNIVERSAL | Direction, declared destination/provenance, current location, invalidation | Pipeline requirement | Confirmation cannot advance an unspecified destination | Missing/indefensible destination makes Path `FAIL/NOT_AVAILABLE` |
| Ordered obstacle inventory | STOCK_ADAPTATION_REQUIRED | Prior levels, validated zones/nodes, opening range, price, destination; merge/materiality rules | Shadow until taxonomy/materiality validate | Golden ordering/merge fixtures and barrier-interaction cohorts | Missing required obstacle family is `PARTIAL`; unknown path is not clear |
| Room available / required | STOCK_ADAPTATION_REQUIRED | `roomAvailable = abs(nearest material obstacle or destination - entry reference)` in direction; `roomRequired` from stop distance, costs/slippage, authoritative R/R and/or validated volatility buffer | Candidate production gate after exact precedence is approved | Units/rounding, sensitivity, and net-of-cost walk-forward tests | `roomAvailable < roomRequired` is `FAIL/NO_TRADE`; missing price/stop/target/materiality is `NOT_AVAILABLE` |
| ATR-normalized distance | STOCK_ADAPTATION_REQUIRED | Adjusted completed bars, true-range formula, lookback/smoothing, gap/session policy | Shadow; later normalization evidence, not signal | Reproducibility and robustness by volatility/liquidity | Missing/zero ATR is `NOT_AVAILABLE`; no coercion/division |
| Opening range | RESEARCH_ONLY | U.S. calendar/RTH open, exact duration, completed intraday bars, halt/gap policy | Keep existing shadow role | Duration variants, gaps/halts, incremental value | Before completion/invalid session is `NOT_READY`/`NOT_AVAILABLE`, not inferred acceptance |
| Session-range consumption | RESEARCH_ONLY | Exact session, as-of highs/lows, denominator/range model, completed bars | Keep shadow | Time-of-day, volatility, gap, liquidity cohorts | Incomplete/zero range is `NOT_AVAILABLE`; high usage is not automatic exhaustion |
| Expected expansion/exhaustion | RESEARCH_ONLY | Stock-specific point-in-time distributions conditioned on time, horizon, volatility, gap, liquidity, regime | Shadow only | Walk-forward distributions, sample minimums, uncertainty, drift | Insufficient sample is `NOT_AVAILABLE`; no sample is not 0%; projections are not ceilings |
| NQ projections/fixed deviations | REJECT_FOR_STOCKS | None permitted | Ineligible | A newly derived stock model is a separate research concept, not copied constants | Do not calculate/display as stock evidence |
| Asia/London/New York NQ rotation model | REJECT_FOR_STOCKS | None permitted for direct implementation | Ineligible | A new extended-hours stock hypothesis needs its own research contract | Do not map futures sessions onto individual-stock gates |

### Confirmation

| Concept | Classification | Required inputs | Production eligibility | Validation requirement | Failure semantics |
| --- | --- | --- | --- | --- | --- |
| Completed-bar price acceptance/rejection | STOCK_ADAPTATION_REQUIRED | Completed EXECUTION bars, predeclared level/zone, close count, tolerance, hold/retest window, direction, freshness | After exact equity definition/validation; named price acceptance, not order flow | No-lookahead fixtures, sensitivity, forward cohorts | Incomplete bar is `NOT_READY`; missing level/history `NOT_AVAILABLE`; higher close does not prove aggressor |
| Price expansion/momentum | STOCK_ADAPTATION_REQUIRED | Completed bars, exact return/range/ATR formula, lookback, direction, freshness | Shadow; possible support after validation | Simple-baseline comparison, calibration, ablation | Missing/stale bars are `NOT_AVAILABLE/STALE`; bullish candle does not prove participation |
| Relative volume/activity | STOCK_ADAPTATION_REQUIRED | Point-in-time cumulative/per-bar volume, same-time historical baseline, lookback, session/corporate-action policy, minimum samples | Shadow; possible supporting evidence, not bid/ask participation | Seasonality, event, half-day, IPO, missing-volume, forward tests | Insufficient baseline is `NOT_AVAILABLE`; high volume does not identify aggressor side |
| Activity rhythm | RESEARCH_ONLY | Time-bucketed point-in-time volume/range history, calendar, samples, exact feature | Keep shadow | Walk-forward uncertainty and drift | Insufficient cohort is `NOT_AVAILABLE`; no production effect |
| Effort versus result from OHLCV proxy | RESEARCH_ONLY | Explicit relative-volume effort and price-progress result formulas, windows, location | Shadow only; label `OHLCV_PROXY` | Incremental value versus components; false positives versus native data where possible | Cannot satisfy a native-order-flow requirement or be called absorption |
| Executed bid/ask footprint and delta | DATA_REQUIRED | Tick trades with reliable aggressor side, corrections, sequence, exchange times, coverage/provenance | After feed audit and stock validation | Trusted-feed reconciliation, outage/correction tests, forward validation | Absent/incomplete/stale feed is `NOT_AVAILABLE`; native gate stays locked |
| Stacked imbalance | DATA_REQUIRED | Valid footprint plus ratio, minimum volume, stacking, diagonal/horizontal and zero-denominator rules | After feed contract and validation | Golden footprint fixtures, sensitivity, forward tests | No footprint is `NOT_AVAILABLE`; no accidental infinity/zero semantics |
| True absorption | DATA_REQUIRED | Native executed aggression plus price response at predeclared location; exact time/price window | Evidence only after feed/validation; never automatic reversal | Reproducible labels, continuation/reversal outcomes, false-positive study | No native evidence is `NOT_AVAILABLE`; OHLCV stall cannot be called absorption |
| Resting liquidity / L2 | DATA_REQUIRED | Timestamped depth, venue coverage, update/cancel/sequence semantics, provenance | Research first even with feed | Feed replay, fragmentation, spoof/cancel robustness, stock outcomes | Incomplete book is `NOT_AVAILABLE`; displayed size is not executed participation |
| MBO/L3 | DATA_REQUIRED | Native order IDs/events, sequence, venue coverage, corrections, time integrity | Research first | Replay/reconciliation and stock outcome tests | No feed is `NOT_AVAILABLE`; do not derive from L2/OHLCV |
| Post-absorption confirmation sequence | RESEARCH_ONLY | Valid native absorption first; exact continuation-failure/non-acceptance/pressure-shift windows | Shadow only | Pre-register sequence and outcomes; forward validation | Without valid absorption it is `NOT_AVAILABLE`; no automatic reversal |
| Location-conditioned confirmation | EXACT_UNIVERSAL | Same-snapshot/direction valid Location plus honestly named confirmation evidence | Orchestration principle after feature contracts | Interaction/ablation and snapshot mismatch tests | Confirmation at unrelated/invalid location cannot pass setup |

### Execution and capital use

| Concept | Classification | Required inputs | Production eligibility | Validation requirement | Failure semantics |
| --- | --- | --- | --- | --- | --- |
| Consume authoritative hard authorization | EXACT_UNIVERSAL | Same-snapshot stages and result from `src/hard-guardrails.js` | Required production behavior | No duplicated thresholds; no `BUY NOW` without hard proof | Missing/false/stale proof is `LOCKED`; status string is insufficient |
| Entry/ceiling/stop/targets/RR/overextension | STOCK_ADAPTATION_REQUIRED | Authoritative existing production outputs/provenance and executable price basis | Eligible only through existing owners; this audit does not redefine | Existing critical suite plus gap/fill/rounding/freshness tests | Missing/inconsistent trade plan blocks; confidence cannot waive |
| No-trade as first-class action | EXACT_UNIVERSAL | Enumerated blocker, owning stage, next condition, freshness, missing inputs | Eligible | Exhaustive state transitions; no forced conversion into low score | Any required failed/unknown/stale gate prevents entry and exposes reason |
| Opportunity versus portfolio permission | EXACT_UNIVERSAL | Stock decision and separately owned portfolio constraints when available | Stock setup must not imply capital allocation | A valid candidate may receive no capital | No fabricated portfolio authority, sizing, or leverage |
| Sizing, turnover, holding, wealth superiority | RESEARCH_ONLY | Portfolio, costs, taxes, slippage, liquidity, alternatives, benchmark, horizon outcomes | Outside method authorization | Walk-forward challenger, drawdown/risk-of-ruin, sensitivity | No evidence means no claim frequent execution improves compounding; never escalate risk by default |

## Explicit fail-closed/no-trade conditions

Contracts must preserve distinct `FAIL` (valid evidence says no), `NOT_AVAILABLE` (cannot calculate), `NOT_READY` (required observation incomplete), `STALE`, `PARTIAL` (only optional evidence absent), and `ERROR`. Never collapse them into confidence.

Universal locks for a new entry are:

- symbol, snapshot, direction, horizon, or as-of-time mismatch;
- stale/missing evidence declared required by an approved setup;
- an incomplete bar presented as completed confirmation;
- no defensible invalidation or destination;
- Path cannot establish required room, or valid evidence has `roomAvailable < roomRequired`;
- required Confirmation is absent/expired;
- any authoritative hard-guardrail failure or missing authorization proof;
- a halt, corporate-action discontinuity, or data-quality failure invalidating the calculation.

Candidate no-trade gates requiring formula and stock validation before production effect are: repeated failed breakouts, repeated return to value, excessive overlap/little expansion, poor timeframe alignment, incompatible volatility/regime, excessive session-range use, and material obstacle proximity. Until promotion they may annotate/rank shadow observations only.

Native order flow needs a setup-level rule. If a setup declares it mandatory, absent native data locks Confirmation. If an approved setup declares completed-bar price/volume evidence sufficient, unavailable order-flow fields only reduce native-order-flow coverage and cannot be treated as negative. Decide this per setup before coding.

## Exact contracts missing before coding behavior

1. **Strategy identity:** direction, decision/entry/holding horizons, canonical intervals, RTH/extended-hours use, setup-specific required gates.
2. **Structure:** pivot algorithm, lookbacks, prominence, confirmation delay, zones, conflict policy, split/gap handling.
3. **Auction profile:** granularity, range anchor, bins/ticks, volume allocation, value-area percentage/expansion, POC ties, nodes, and approximation disclosure/error.
4. **Acceptance:** level owner, tolerance, penetration, completed closes, retest/hold window, invalidation, freshness.
5. **Participation:** relative-volume numerator, point-in-time same-time cohort, lookback, samples, event/winsorization and calendar rules.
6. **Path:** destination owner, obstacle taxonomy/merge/materiality, entry reference, room formulas, cost/slippage buffer, ATR, and precedence with authoritative R/R.
7. **Environment:** exact overlap, expansion, failed-breakout, return-to-value, regime, and alignment formulas/windows.
8. **State machine:** input criticality, minimum coverage, transitions, blocker priority, and all state semantics.
9. **Validation:** outcome/horizon, entry timing, costs, point-in-time universe, survivorship/delisting controls, samples, uncertainty, multiple-testing control, walk-forward splits, promotion/rollback thresholds.

## Futures disposition

Do not copy NQ volatility projections/deviations, rotations, constants, platform labels, futures footprint/liquidity behavior, or index gamma interpretation into stock contracts. Changing a symbol or session name is not adaptation. A related stock hypothesis begins as a separate `RESEARCH_ONLY` feature with point-in-time equity data.

Fibonacci, opening/session behavior, and expected expansion can be represented for stocks but remain research hypotheses. Volume-profile and multiple-timeframe concepts have coherent stock variants, so they require adaptation rather than rejection.

## Validation and promotion

Promotion requires a versioned definition, reproducible point-in-time calculation, coverage/freshness contract, and evidence of incremental value after realistic costs. Use survivorship-bias-controlled U.S.-equity universes, corporate-action-adjusted history, forward/walk-forward evaluation, regime/liquidity cohorts, sensitivity tests, uncertainty intervals, benchmark/ablation comparisons, and multiple-testing controls.

Stage outcomes should match the claim:

- Environment: conditional setup expectancy/failure rate by regime.
- Location: adverse excursion to invalidation and favorable excursion to a declared destination.
- Path: obstacle interaction, target-before-stop, reachable net reward, time to destination.
- Confirmation: incremental target-before-stop/expectancy benefit over the first three stages.
- Execution: fill- and cost-aware outcomes under unchanged authoritative guardrails.

Promote incrementally: calculation-only → stored shadow evidence → forward shadow validation → integration/human approval → production effect, followed by drift monitoring and rollback criteria. In-sample win rate, visual plausibility, or higher turnover alone is insufficient.

## Final disposition

Keep the five-stage architecture, especially Path, but do not freeze engine semantics from the current prose. Immediately safe work is the shared-snapshot contract, ordered fail-closed state machine, provenance/freshness truthfulness, missing-data behavior, and authoritative Execution adapter. Stock-sensitive features begin as deterministic shadow calculations. Native order-flow and gamma remain `NOT_AVAILABLE` without legitimate feeds. NQ/session constants are rejected for direct stock use. Portfolio allocation, sizing, holding horizon, and capital-growth claims remain outside this method's production authority and in the separate wealth-strategy research path.
