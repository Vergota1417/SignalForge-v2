# Stage 0 Quantitative Strategy Challenge

## Challenger verdict

The Chief Investment Architect's `MODIFY` verdict is a reasonable hypothesis, not an evidence-backed strategy choice. The proposed core-plus-selective-tactical model should not be treated as the default merely because it sounds diversified and prudent. SignalForge has not yet shown that its selection, five-stage timing, exits, or cash states add incremental value beyond cheap passive exposure or simple quality, momentum, relative-strength, and trend rules.

The null hypothesis is therefore:

> After realistic implementation frictions and under comparable capital and information constraints, SignalForge does not improve risk- and tax-aware terminal wealth over the best simple eligible alternative.

Stage 0 should retain SignalForge as a research-only tactical challenger. It should reject SignalForge-only wealth claims unless a preregistered, point-in-time portfolio test demonstrates repeatable incremental value out of sample. The most credible likely use, if any edge survives, is as a bounded component whose contribution can be isolated from its core portfolio, cash filter, sizing, and exit policy. No performance result is asserted in this document.

## What in the architect's proposal could be wrong

| Architect assumption or implication | Why it may fail | Test that can disprove it |
| --- | --- | --- |
| Core plus selective SignalForge is the preferred model to test and likely operating model. | A tactical sleeve can add cost, tax drag, behavioral complexity, and correlated equity exposure while mostly duplicating the core. | Compare the hybrid with its identical core alone and with simple overlays at matched risk; attribute sleeve contribution after all frictions. |
| SignalForge improves entry quality. | Confirmation may enter after favorable price movement, miss gaps, concentrate fills in crowded conditions, or merely reduce exposure. | Hold selection, sizing, and exits fixed; compare actual five-stage entry with next-open, limit, and no-intraday-confirmation ablations. |
| Explicit technical gates improve survivability. | Stops are not guaranteed fills; correlated gaps can defeat name-level risk budgets, while whipsaws can compound small losses. | Simulate gaps, delayed/manual fills, stale signals, clustered sector losses, and stop slippage at portfolio level. |
| Adding investment quality and valuation will improve long-horizon decisions. | Point-in-time fundamental data are costly and revised; familiar quality definitions may be crowded, sector-biased, or overfit. | Compare price-only challengers with preregistered point-in-time quality variants and quality-plus-valuation variants. |
| A long-term core is the appropriate default benchmark. | For some mandate windows, a simple trend or relative-strength portfolio may dominate on drawdown or capital-floor survival; for others, tactical activity may be unnecessary. | Run identical horizons and contribution/liquidity scenarios without privileging a family in model selection. |
| Cash/regime states improve risk-adjusted compounding. | Market-timing errors and re-entry delay can turn protection into chronic underinvestment. Cash yields also vary by era. | Attribute cash return, avoided drawdown, missed upside, and re-entry cost against always-invested and fixed-allocation controls. |
| Fixed targets and active protection improve outcomes. | They may truncate the positive skew from rare long-duration winners and accelerate taxable realization. | Compare current exits with time exits, thesis exits, volatility trails, and periodic rebalancing while holding entries fixed. |
| The 1.80:1 planned reward/risk floor creates favorable realized asymmetry. | Targets may not trade before stops, gaps may enlarge losses, and selection can condition on optimistic or unstable levels. | Measure realized payoff distributions, target/stop ordering, gap loss, MFE/MAE, and calibration by planned reward/risk band. |
| Candidate rankings identify the best use of capital. | Scores may be uncalibrated and many candidates may express the same market, sector, or factor bet. | Compare score ranking with equal weight, volatility scaling, simple relative strength, and portfolio-aware marginal ranking. |
| More complete portfolio machinery will improve decisions. | Estimation error can make optimizers less robust than equal weight or simple caps. | Require complex allocation methods to beat transparent fixed-weight and volatility-scaled controls after estimation and turnover costs. |
| Manual decision support will resemble simulated execution. | User delay, skipped trades, discretionary overrides, and inability to monitor may materially change realized exposure. | Model latency/adherence scenarios and later compare prospective timestamped recommendations with recorded actions; do not infer live transfer from a backtest. |

The architect is strongest on architecture safety: centralized state, point-in-time provenance, missing-data honesty, portfolio permission, and research/production separation should be retained regardless of which strategy wins. Those controls do not themselves prove investment edge.

## Hard benchmarks and challenger definitions

Every rule must be frozen before its evaluation window. Exact lookbacks, rebalance cadence, eligible universe, benchmark instrument, and tie-breaking rules belong in a versioned strategy specification; they must not be selected after examining test results.

| ID | Strategy family | Minimum reproducible definition | Primary challenge |
| --- | --- | --- | --- |
| C0 | Cash / short-duration Treasury proxy | Hold a point-in-time investable cash-equivalent return series, net of applicable fees and tax scenario. | Did taking equity risk earn enough? |
| C1 | Broad-market passive | Buy and hold a low-cost total-return U.S. equity proxy; include an optional global passive specification as a separately declared benchmark. Reinvest distributions. | Did any complexity beat cheap continuous participation? |
| C2 | Equal-weight eligible universe | Equal-weight the same point-in-time universe available to active strategies, rebalanced on the same decision dates. | Is selection adding value rather than universe construction? |
| C3 | Quality plus momentum | Rank point-in-time eligible stocks using a small preregistered set of established quality fields and trailing price momentum with a skip/reversal convention fixed in advance; rebalance periodically with simple caps. | Do SignalForge's added stages beat a parsimonious selection model? |
| C4 | Relative-strength rotation | Periodically rank liquid eligible assets or stocks by trailing total return relative to the declared benchmark; hold the top group, equal- or volatility-weighted, with an explicit cash rule only if preregistered. | Does a simple price ranking capture the claimed discovery edge? |
| C5 | Trend following | Hold the broad equity proxy, eligible positions, or a declared defensive asset only when a fixed, lagged trend rule is positive; otherwise hold the cash proxy. | Does the five-stage timing pipeline outperform a transparent state filter? |
| C6 | Concentrated high-quality compounders | Select a small, capped portfolio using point-in-time durable-quality and financial-strength criteria, with slow scheduled review and no technical exit absent a thesis or eligibility failure. | Does low-turnover concentration preserve positive skew better? |
| C7 | Core plus tactical SignalForge | Hold a fixed, preregistered passive-core weight and allocate only the bounded sleeve to fully specified SignalForge signals; unused sleeve capital earns the cash return. Rebalance flows must be explicit. | Does SignalForge add incremental value rather than inherit core returns? |
| C8 | Cash/regime-filtered SignalForge | Apply one preregistered, observable, lagged market-regime rule to the same SignalForge strategy; blocked capital earns cash return and re-entry is mechanical. | Does abstention compensate for missed participation? |
| C9 | SignalForge-only swing | Finite-cash, long-only portfolio using historically reproducible SignalForge eligibility, entries, authoritative gates, sizing, exits, and concurrent-position rules. No synthetic signal substitutions. | Can the current tactical method stand alone? |

The strategies most likely to be hard benchmarks are C1 because of low cost, tax efficiency, and full participation; C3 because quality and momentum have distinct economic intuitions with modest complexity; C4 because it can reproduce much of technical leadership selection; and C5 because it tests whether a simple regime rule captures most drawdown control. C7 must first beat C1 incrementally. C9 carries the highest burden because it depends on the most moving parts and likely the greatest turnover.

### Mandatory SignalForge ablations

These are controlled experiments, not additional stories:

- same SignalForge candidates with and without completed intraday Confirmation;
- same signals with next-tradable-bar entry, a declared limit-entry policy, and SignalForge entry logic;
- same entries with current exits, fixed-horizon exits, volatility-trailing exits, and mandate-specific holding exits;
- Environment only, Location only, Path only, Confirmation only where a standalone rule is meaningful, and cumulative gated additions;
- discovery/ranking only versus equal-weight eligible candidates;
- current symbol sizing versus equal weight and simple volatility scaling under identical caps;
- always-eligible SignalForge versus its cash/regime filter;
- passive core alone versus the identical core plus SignalForge sleeve;
- quality only, timing only, allocation only, and preregistered combinations;
- current planned reward/risk filter versus the same candidates without that filter, while preserving production rules outside research.

An ablation that cannot be reconstructed from contemporaneously available data is `NOT_TESTABLE`, not approximated.

## Fair-test protocol

### 1. Preregister one common experiment

Before observing holdout results, publish a machine-readable specification for each strategy containing:

- investment mandate and horizon;
- point-in-time universe and liquidity/capacity eligibility;
- signal formula, lag, ranking, ties, and missing-data behavior;
- decision calendar, order time, assumed tradable time, and fill model;
- initial capital, contribution/withdrawal schedule, fractional-share convention, and cash yield;
- maximum gross and net exposure, leverage prohibition unless separately authorized, position and group caps, and concurrent-position rules;
- sizing, replacement, rebalancing, cooldown, exit, and re-entry rules;
- corporate-action and delisting treatment;
- transaction-cost, slippage, tax, and capacity scenarios;
- benchmark, metric definitions, statistical plan, rejection rules, and test-window lock;
- strategy and data version hashes.

The research engine must use a single finite-cash, event-driven portfolio ledger. It must reject orders that exceed settled deployable capital or declared capacity. It may not score each trade as if all capital were independently available.

### 2. Align information and opportunity sets

Use the longest common period for which every compared strategy has trustworthy required inputs. Also report longer strategy-specific histories only as context, never as direct evidence that one strategy beat another over a different window. All head-to-head results share:

- the same evaluation dates, initial capital, external cash flows, and total-return accounting;
- the same point-in-time security master and base investable universe unless the strategy explicitly has a different mandate;
- the same corporate actions, exchange calendar, prices, and cash-return series;
- identical liquidity, position-capacity, leverage, shorting, and fractional-share constraints;
- decision-time availability: a datum published after a decision is unavailable until the next permitted decision;
- a declared benchmark and identical return frequency for metric computation.

Where a strategy genuinely needs different data, disclose the narrower common window and run nested comparisons: all strategies on the shared window, plus price-only strategies over the longer price history. Do not fill missing fundamentals backward or treat missing values as neutral.

### 3. Model implementation, not frictionless intent

Transaction costs must include commissions and fees where applicable, bid/ask spread, market impact/capacity, and adverse price movement between decision and fill. Slippage must vary with price, volatility, liquidity, order size, time of day, and gaps rather than use only one favorable constant. Run base, conservative, and severe preregistered scenarios and a break-even-cost analysis.

For SignalForge, model completed-bar availability, scheduled scan latency, manual review/decision latency, missed and partial fills, limit orders that never fill, stale-data rejection, and stops filled beyond the stop price. A close-derived signal cannot fill at that same close unless a genuinely executable auction rule and data support it.

Taxes are scenario analyses, not a universal claim:

- pre-tax for strategy skill isolation;
- tax-advantaged account;
- taxable account using declared jurisdiction/year assumptions, lot accounting, holding-period treatment, distributions, realized losses, and applicable wash-sale constraints;
- sensitivity to tax-rate and realization assumptions.

Report pre-tax and after-tax results together. Tax complexity cannot rescue a weak pre-tax strategy, and a hypothetical tax regime cannot be presented as personalized advice.

### 4. Prevent survivorship and look-ahead bias

Required protections include:

- a point-in-time security master containing dead, delisted, acquired, bankrupt, renamed, and share-class histories;
- historical index/universe membership rather than today's constituents;
- split, dividend, spinoff, merger, and delisting returns handled from contemporaneous terms;
- fundamentals with original publication timestamps and revision/vintage history; filings become usable only after public release;
- lagged sector, industry, benchmark, borrow, and liquidity classifications where used;
- feature normalization, winsorization, imputation, and universe thresholds fit only on training data;
- delisting and stale-price rules that do not assume an investor can exit at the last convenient quote;
- immutable raw-data snapshots, lineage, quality flags, and audit samples around boundary timestamps.

If full historical SignalForge states do not exist, reconstruct only deterministic inputs supported by point-in-time raw data and the frozen historical rule version. Do not infer unavailable intraday or microstructure evidence from daily OHLCV. Mark affected periods non-testable and use prospective shadow validation.

### 5. Walk-forward and untouched out-of-sample validation

Use anchored and rolling walk-forward designs chosen before testing. Each fold must follow this order:

1. fit or choose parameters on training data only;
2. use a temporally later validation segment for model choice;
3. freeze the strategy;
4. evaluate once on the later fold test segment;
5. concatenate only genuine fold test returns for the walk-forward record.

Reserve a final chronological holdout that is not inspected during strategy, threshold, benchmark, or cost-model selection. Apply embargo/purge periods long enough to prevent overlapping labels, positions, or outcome horizons from crossing boundaries. A prospective shadow period must then validate signal generation, data latency, fill assumptions, and operational availability before any production proposal.

Analyze known regimes only after defining them with observable, lagged rules: bull/bear, high/low volatility, inflation/rate environments where reliable macro vintages exist, crisis/recovery, and liquidity stress. Regime labels must not be hand-drawn around outcomes. Report calendar subperiods as a check against regime-definition discretion.

### 6. Control multiplicity and researcher degrees of freedom

Maintain a complete experiment ledger including failed variants. Separate a small confirmatory family from exploratory work. For confirmatory comparisons, preregister the primary benchmark, primary metric set, direction of improvement, and multiplicity procedure. Report confidence intervals and economic effect sizes, not only p-values.

Parameter robustness means broad, contiguous stability around the chosen rule—not a single optimal coordinate. Repeat results across plausible start dates, rebalance days, universes, fill assumptions, and cost levels; remove or cap the contribution of the largest winners; and compare performance before and after each rule was conceived.

## Evaluation scorecard

No single number selects a winner. Report at least the following on gross, net pre-tax, and applicable net after-tax return streams:

| Dimension | Required measures and interpretation |
| --- | --- |
| Growth | Total return, nominal and real CAGR, terminal wealth, benchmark-relative CAGR, and cumulative active return. |
| Loss | Maximum drawdown, drawdown start/trough/recovery, time underwater distribution, downside deviation, worst rolling-period return, and capital-floor breaches. |
| Risk-adjusted outcome | Volatility, Sharpe, Sortino, and Calmar where assumptions and sample length make them meaningful; never use them alone. |
| Tail and path risk | Expected shortfall or comparable tail-loss measure, skew, gap loss, clustered-loss episodes, recovery probability, and risk of ruin under declared definitions. |
| Trading quality | Expectancy per independent decision episode, hit rate, average win/loss, payoff ratio, profit factor, MFE/MAE, planned-versus-realized reward/risk, and missed-fill rate. |
| Relative value | Excess return, active drawdown, tracking error/information ratio where meaningful, up/down capture, and factor/regime attribution. |
| Capital use | Time-weighted invested percentage, deployable cash, idle-cash opportunity cost, exposure, portfolio heat, rejected orders from insufficient capital, capacity, and return per unit of risk and liquidity. |
| Friction | Turnover, holding-period distribution, spread/slippage/impact, fees, tax realization, total cost and tax drag, and break-even friction. |
| Concentration | Name, sector, industry, theme, factor, and correlated exposure; effective number of positions and contribution of largest winners/losers. |
| Robustness | Walk-forward and holdout results, fold dispersion, regime results, alternate starts/universes, parameter neighborhoods, cost/data shocks, and prospective shadow agreement. |

Define ruin before testing in mandate terms, not only as wealth reaching zero. Candidate definitions must include breach of an approved capital floor, inability to meet a modeled liquidity need, or a drawdown from which the mandate can no longer continue without impermissible risk. WP-07 owns any recommended numeric policy limit; WP-06 reports the full breach-probability curve rather than inventing a limit.

## Bootstrap and Monte Carlo plan

Resampling is justified only when there are enough independent observations and stable enough data-generating assumptions for the claimed inference. Repeated daily snapshots of one open thesis are not independent episodes.

Use several complementary methods:

- stationary or moving-block bootstrap of portfolio returns with block-length sensitivity to preserve serial dependence;
- episode or trade-cluster bootstrap grouped by overlapping holding period, symbol, sector, and market episode where the strategy is naturally episode-based;
- regime-stratified resampling that preserves observed regime clustering and transition sensitivity without pretending rare regimes are well estimated;
- parameter and execution uncertainty draws for costs, latency, fills, gap losses, and model coefficients learned in each training fold;
- historical stress replay and deterministic shocks for crises too rare to estimate reliably.

For each justified method report distributions of terminal real wealth, CAGR, maximum drawdown, time underwater, worst loss, capital-floor breach, turnover, and utilization, including median and adverse percentiles with interval uncertainty. Do not use IID trade shuffling as the sole analysis, Gaussian return simulation for fat-tailed equity losses, or thousands of synthetic paths to imply more historical information than exists. When samples are sparse, publish scenario bounds and `INSUFFICIENT_EVIDENCE` instead of precise ruin probabilities.

## Data requirements and feasibility gates

| Data | Minimum requirement | Failure consequence |
| --- | --- | --- |
| Security master | Point-in-time identifiers, listings, delistings, share classes, exchange, sector/industry history. | Cross-sectional strategy comparison is invalid. |
| Prices and corporate actions | Survivorship-free daily total-return history; intraday completed bars and quotes for SignalForge execution; timestamps and adjustment lineage. | Test only compatible daily strategies or mark SignalForge execution non-testable. |
| Fundamentals | Original and restated values, filing/publication timestamps, fiscal-period identity, units, currency, and missingness. | Quality/compounder models are unavailable; never backfill revised values. |
| Benchmarks and cash | Point-in-time benchmark membership/returns and an investable cash/Treasury proxy with fees and yields. | Excess return and cash-filter attribution are unsupported. |
| Trading frictions | Historical or defensible spread, volume, volatility, order-size, fee, and corporate-event inputs. | Results remain friction scenarios, not implementable performance evidence. |
| SignalForge states | Versioned candidate set, stage evidence, snapshot/source/calculation times, missing/stale flags, hard authorization, plans, and subsequent actions. | No faithful historical backtest; require deterministic reconstruction or forward shadow data. |
| Portfolio ledger | Cash, holdings, orders, fills, lots, distributions, contributions/withdrawals, and rejected orders. | Capital utilization, taxes, and ruin cannot be evaluated. |
| Events and macro/regimes | Point-in-time earnings/corporate-event calendars; vintage macro data only if used. | Event gaps or macro filters must be omitted, never reconstructed with hindsight. |
| Manual workflow | Recommendation, view, decision, order, and fill timestamps plus opt-in adherence records. | Live-transfer claims remain unsupported. |

Before implementation, the data-feasibility review must confirm history length, coverage, timestamp semantics, revision policy, licensing, provider budget, and reproducible export/storage. A shorter honest test is preferable to a longer contaminated one.

## Principal overfitting risks

- selecting among many indicators, thresholds, horizons, universes, exit rules, and regime filters on the same history;
- repeatedly editing the five-stage gates after inspecting outcomes;
- treating overlapping signals, bars, or forward horizons as independent samples;
- tuning to one long equity bull market, one benchmark, or the surviving current universe;
- using revised fundamentals or today's classifications in historical ranks;
- choosing a passive core weight or tactical sleeve size from the test set;
- adding portfolio optimizers whose covariance or expected-return estimates are unstable;
- defining regimes after seeing drawdowns;
- attributing a hybrid's passive beta return to SignalForge;
- ignoring unfilled signals, rejected orders, idle cash, delistings, or signals with missing data;
- tuning the cost model to preserve apparent edge;
- using a favorable tax assumption or start date as the headline result;
- promoting on aggregate results that depend on a few winners, sectors, or crisis calls;
- confusing simulator precision, resampled path count, or a high score with calibrated probability;
- leakage through feature scaling, universe construction, label overlap, corporate events, or same-bar fills;
- version drift between reconstructed history and the rules actually available at the time.

Complexity must earn admission incrementally. Each additional feature or layer needs a preregistered ablation showing an economically meaningful out-of-sample contribution after its own friction and estimation cost.

## Falsification and rejection criteria

A proposed SignalForge strategy is rejected for production consideration—not merely retuned—if any of the following occurs in the locked protocol:

1. **Integrity failure:** survivorship, look-ahead, same-bar execution, data revision, or rule-version leakage cannot be removed or bounded credibly.
2. **No faithful specification:** signals, fills, sizing, exits, finite-capital competition, or missing-data behavior cannot be reconstructed or prospectively observed.
3. **No incremental value:** SignalForge or its hybrid sleeve fails to improve the preregistered risk- and tax-aware objective over its direct simple benchmark out of sample after costs; a hybrid must beat the identical core alone, not merely have positive return.
4. **Risk failure:** any return advantage is primarily purchased through leverage, concentration, illiquidity, correlated gap exposure, or a materially worse capital-floor breach distribution outside the approved mandate.
5. **Friction failure:** plausible conservative slippage, latency, missed fills, fees, taxes, or capacity erase the claimed advantage, or break-even assumptions are not realistically attainable.
6. **Robustness failure:** advantage depends on a narrow parameter, chosen start date, one regime, one sector, one benchmark, or a few extreme winners; adjacent specifications or walk-forward folds reverse the conclusion.
7. **Confirmation failure:** completed intraday Confirmation does not improve net out-of-sample expectancy or downside outcomes enough to compensate for delay, missed trades, data cost, and turnover relative to the no-confirmation ablation.
8. **Cash-filter failure:** a cash/regime filter reduces drawdown only by chronic underinvestment and does not improve the preregistered terminal-wealth/risk tradeoff versus the unfiltered control.
9. **Exit failure:** active target/protection rules reduce net terminal wealth or worsen tax-aware outcomes by truncating positive skew without a compensating improvement in approved loss metrics.
10. **Calibration failure:** scores or confidence tiers cannot distinguish outcomes out of sample with uncertainty narrow enough for their proposed sizing or allocation use.
11. **Operational failure:** prospective shadow signals cannot be reproduced from synchronized, fresh, available data, or realistic manual execution diverges materially from backtest assumptions.
12. **Insufficient evidence:** the number of independent episodes, regimes, or live observations is too small to support the claimed mandate. The result is `INSUFFICIENT_EVIDENCE`, which blocks promotion even if the point estimate is favorable.

Failure of one component rejects that component, not automatically the safe centralized architecture. Research may simplify SignalForge to the smallest surviving feature set, but any materially revised strategy begins a new preregistered validation cycle and does not inherit the rejected model's holdout evidence.

## Decision sequence and deliverables

1. **Data audit:** issue a feasibility matrix and exclude unsupported claims before backtesting.
2. **Specification freeze:** version all challengers, ablations, frictions, metrics, and falsification rules.
3. **Backtest-engine validation:** reconcile ledger accounting, corporate actions, cash flows, and deliberately simple test portfolios against independent calculations.
4. **Exploratory training only:** inspect mechanisms and eliminate clearly invalid variants without touching the final holdout.
5. **Walk-forward comparison:** produce common-window, finite-capital, net-of-cost results and component attribution.
6. **Stress and resampling:** quantify path, gap, correlation, cost, tax, and parameter uncertainty without overstating sparse evidence.
7. **Locked holdout:** evaluate frozen finalists once; record all failures and do not recycle the holdout.
8. **Prospective shadow:** verify data, signal, latency, fill, manual-action, and portfolio-state assumptions.
9. **Independent review:** WP-07 assesses drawdown, concentration, and ruin; integration verifies scope, leakage controls, and no automatic promotion.
10. **Recommendation:** `REJECT`, `RESEARCH LONGER`, or `ELIGIBLE FOR SEPARATELY SCOPED PRODUCTION REVIEW`. There is no automatic production path.

The final report must show every challenger, including failed SignalForge variants; common and strategy-specific windows; gross/pre-tax/after-tax views; full metric and uncertainty tables; regime and sensitivity results; capital utilization; component attribution; data limitations; experiment count; and an explicit audit against every falsification criterion.

## Stage-0 conclusion

SignalForge should not yet be called a wealth strategy. The architect's proposed portfolio layer is necessary if the product expands beyond single-symbol tactical support, but its existence would not establish an edge. The immediate quantitative task is to determine whether SignalForge contributes anything that passive exposure, quality plus momentum, relative-strength rotation, or simple trend control do not provide more cheaply and robustly.

Until that evidence exists:

- preserve the production hard guardrails and research/production boundary;
- do not select core plus tactical as the default mandate;
- do not use short-horizon outcomes to support long-horizon claims;
- do not fabricate unavailable historical SignalForge evidence;
- treat `INSUFFICIENT_EVIDENCE` and holding cash as valid research outcomes;
- require the most complex strategy to bear the strongest burden of proof.
