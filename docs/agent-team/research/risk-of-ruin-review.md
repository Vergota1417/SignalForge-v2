# Stage 0 Capital Risk / Risk-of-Ruin Review

## Executive decision: MODIFY, NOT APPROVED FOR PRODUCTION ALLOCATION

The Chief Investment Architect is right that SignalForge is not yet a wealth system and that a portfolio authority must sit between symbol approval and capital commitment. The proposed `core + selective tactical` model is a sensible challenger. It is **not yet safe enough to become a default, and none of its sizing, concentration, cash, drawdown, or leverage ideas is approved for production**.

The central failure mode is deceptively attractive average performance produced by a small number of winning paths while a meaningful fraction of paths suffer unrecoverable loss. A strategy can show positive expectancy, high CAGR, or a favorable median and still be unacceptable because losses cluster, correlations approach one in stress, stops gap, liquidity disappears, estimates drift, or early losses prevent later compounding. SignalForge currently has no portfolio-level authority that constrains those hazards.

The Stage 0 posture should therefore be:

- remain unlevered, long-only equities/cash for research assumptions unless a comparison explicitly stress-tests leverage;
- treat every symbol-level `BUY` as no more than candidate eligibility, never allocation permission;
- use conservative, transparent sizing and exposure bands as **research hypotheses**, not production rules;
- define ruin as breaching a capital or liquidity floor, not merely reaching zero;
- reject any strategy whose attractive terminal wealth depends on leverage, concentration, favorable trade ordering, or survival bias;
- require portfolio-path simulation, regime stress, liquidity/capacity tests, and forward shadow evidence before proposing production controls.

The extreme terminal-wealth aspiration supplies no risk budget. A 1,000,000x headline is not evidence that aggressive leverage is rational; it is evidence that contributions, time horizon, business/ownership income, and realistic expectations must be separated from investment-strategy claims.

## Where the architecture can fail catastrophically

### Planned loss is not maximum loss

Sizing from entry-to-stop distance assumes an executable stop. Overnight news, earnings, halts, limit moves, market dislocations, stale data, manual delay, and opening gaps can produce a loss several times the planned amount. Several holdings can gap together. Any risk engine that equates nominal stop risk with bounded loss will systematically understate tail risk.

Research must distinguish:

- planned stop loss;
- ordinary realized loss including spread and slippage;
- event-gap loss;
- correlated portfolio stress loss;
- position loss under an untradeable or stale-data state.

### Diversified tickers can be one bet

Name count is not diversification. Holdings from different sectors may share market beta, growth/duration, size, momentum, volatility, USD, commodity, rate, or liquidity exposure. Historical correlations are unstable and usually rise in selloffs. Sector caps alone cannot control theme or factor crowding.

Portfolio risk must use both classification limits and empirical/factor stress. Missing sector, industry, factor, or correlation data must reduce permitted research size or produce `NOT_AVAILABLE`; it must not be treated as zero overlap.

### Positive average return can conceal ruinous path dependence

Arithmetic average trade return does not describe compounded wealth. A 50% loss requires a 100% gain to recover. Early drawdowns reduce the capital base, may force liquidation for spending needs, and can trigger behavioral abandonment before a long-run edge appears. Contribution and withdrawal timing further changes outcomes.

Backtests must report geometric returns and the full path distribution, including adverse start dates and decision sequences. Randomly shuffling independent trades is inadequate because signals, volatility, gaps, and losses cluster by regime.

### Selection and execution evidence can fail together

The same regime change can invalidate selection, correlations, liquidity, volatility estimates, and execution assumptions simultaneously. A technically valid entry does not imply portfolio safety. The five-stage technical pipeline also cannot detect a portfolio that is already overexposed or a model whose edge has decayed.

### Small accounts face discontinuous constraints

With little capital, whole-share or broker fractional-share rules can make risk-based sizing impossible. Minimum commissions where applicable, spread, taxes, cash settlement, unavailable tax lots, and one-share granularity can turn a nominal 0.25% risk into several percent. Diversification may be infeasible, while a 25% name cap may still leave only four correlated positions. An account too small to express a setup safely must skip it; it must not round size upward.

### Liquidity and capacity are nonlinear

Backtest fills at closing or quoted prices can disappear when participation grows or volatility spikes. The strategy may repeatedly target the same crowded names. Capacity must be assessed at the aggregate strategy/order level, not just per account. A result that works only with implausible fills, microcap liquidity, or negligible deployed capital does not establish a scalable wealth strategy.

## Risk taxonomy and required controls

### 1. Position sizing

Research should begin with fixed-fractional risk and volatility-adjusted fixed-fractional risk. Both must be capped by name exposure, portfolio heat, correlated stress, liquidity, and available deployable cash. The smaller limit wins.

Required comparisons:

1. equal-weight sizing;
2. fixed-fractional sizing using realized loss distributions, not ideal stops alone;
3. volatility-scaled sizing with conservative volatility floors and shock multipliers;
4. drawdown-scaled variants with predefined re-risking;
5. capped fractional Kelly as a research-only challenger.

Kelly sizing is especially dangerous here. SignalForge has no calibrated, stationary win-probability/payoff distribution, and parameter error near the Kelly optimum creates large overbetting risk. Full Kelly, score-proportional sizing, martingale sizing, averaging down because price fell, and any sizing formula that can increase risk after evidence degrades should be rejected.

For every method, estimate actual portfolio loss under 1x, 2x, 3x, and empirically observed adverse gap multiples of planned risk. Include spread, slippage, missed exits, and manual-action delay. Round down for indivisible units. If minimum tradable size breaches the risk budget, size is zero.

### 2. Single-position concentration

The Architect correctly rejects reliance on the current simulator's 25% cap, but the review needs testable candidate bands. Research should compare maximum name exposure bands of **5%, 10%, 15%, and 20% of equity**, with stricter bands for unseasoned signals, volatile/illiquid securities, binary events, and incomplete evidence. These are experimental bands, not recommended production thresholds.

No evidence currently justifies a default above 10%, and 20% should function as an upper stress challenger, not a presumptively acceptable setting. Any concentrated strategy must prove that its improvement survives removal of its largest winners and that capital-floor breach probability is acceptable across adverse regimes.

### 3. Sector, theme, and factor correlation

Research must classify each position by sector/industry plus material themes and common factors. It should compare sector exposure bands such as **20%, 30%, and 40%**, but also apply factor and stress-correlation limits so classifications cannot be gamed.

Required stress matrices include:

- correlations set to historical stressed estimates and to 0.75/0.90/1.00 within related clusters;
- broad-market beta shocks;
- simultaneous factor reversals in momentum, growth/duration, small-cap, and high-volatility exposures;
- sector-specific gaps;
- loss of diversification between equities and any supposed defensive sleeve.

Rolling correlations must use point-in-time data, multiple horizons, shrinkage or conservative overrides for sparse samples, and an explicit unknown state. Allocation must not depend on one calm-period covariance matrix.

### 4. Portfolio heat

Define nominal heat as the sum of planned losses to stops, but never present it as worst-case loss. Also calculate:

- gap-adjusted heat;
- correlation-adjusted stress loss;
- event-cluster exposure;
- liquidity-adjusted exit loss;
- total gross and net exposure.

Research bands should compare nominal open-risk limits around **2%, 4%, 6%, and 8% of equity**. Six and eight percent are adverse/aggressive challengers, not safe defaults. Stress heat must include overnight gaps and positions without valid exits. New allocation should fail closed when a reliable portfolio snapshot, current equity, stop, or exposure map is unavailable.

### 5. Gap and event risk

Earnings, regulatory decisions, litigation, financing, clinical results, corporate actions, macro releases, and geopolitical exposure can overwhelm chart-defined stops. Required research controls include:

- event calendar coverage and its known blind spots;
- event-risk flags with provenance and freshness;
- exclude/reduce/hold-through challenger policies by mandate;
- empirical overnight gap distributions by security type, liquidity, volatility, event status, and regime;
- joint-gap scenarios across correlated holdings;
- halts, no-fill exits, delayed manual action, and next-open liquidation.

If required event data is unavailable, the system cannot claim event risk is absent. Tactical positions whose safety relies on knowing the calendar should be ineligible or conservatively capped in research.

### 6. Drawdown controls and de-risking

Drawdown control should respond to portfolio equity, model evidence, and market/liquidity state—not merely recent losing-trade count. Candidate research bands should include:

| Peak-to-trough drawdown | Conservative research response | Purpose |
| --- | --- | --- |
| 0–5% | Normal research risk budget | Baseline only |
| 5–10% | Reduce new-risk budget by 25–50%; diagnose attribution | Prevent routine loss clustering from accelerating |
| 10–15% | Reduce by 50–75%; block aggressive variants and new correlated exposure | Capital preservation and model review |
| 15–20% | Minimum-risk / observation mode; independent review required | Treat as potential strategy failure |
| Above 20% | No new tactical risk until formal recovery decision | Capital-floor defense |

These bands are hypotheses for comparative simulation, not production instructions. Absolute levels must ultimately be tied to mandate, horizon, liquidity need, and user-approved capital floor.

De-risking must not create a buy-high/sell-low oscillator. Test immediate, stepped, and volatility-conditioned reductions. Re-risk only after predefined conditions such as a minimum observation period, restored data health, exposure normalization, evidence that the model remains calibrated, and equity recovery or forward-shadow success. Time alone or one winning trade is insufficient.

### 7. Capital reserves and cash

Separate at least three cash concepts:

1. **external emergency/liability reserve**, outside trading capital and never used to rescue drawdown;
2. **portfolio operating reserve** for settlements, fees, taxes, and near-term obligations;
3. **strategic cash allocation** held because expected opportunities do not clear the hurdle.

Research portfolio reserves such as **10%, 20%, and 30%**, plus fully invested and higher-cash regime challengers. Do not assume a single percentage fits all mandates. Measure cash yield, inflation, tax, missed-market upside, contribution schedule, and re-entry friction. Cash is a valid allocation but not a free risk reducer; prolonged underinvestment can be a failure against the wealth objective.

### 8. Leverage policy

Default policy recommendation: **no borrowing, margin leverage, leveraged ETFs, shorting, or options-based synthetic leverage for the initial wealth product**. Gross exposure should not exceed 100% of eligible portfolio equity in production unless a later, separately governed work package establishes instrument-specific controls and the product owner explicitly changes the risk boundary.

Leverage research, if performed, must be reported as a stress comparison rather than a path to the aspirational target. It must model financing costs, changing margin requirements, forced liquidation, borrow/option liquidity, volatility drag, path dependence, gap risk, and broker rule changes. Any variant whose superior mean or upper-tail wealth is paired with materially greater capital-floor breach probability should be rejected even if its CAGR is highest.

### 9. Volatility scaling

Volatility scaling can reduce risk variation, but it is not inherently protective. Backward-looking volatility is often lowest just before a shock, so inverse-volatility sizing can maximize exposure at the wrong time.

Required variants should use multiple horizons, an absolute volatility floor, a cap on day-to-day size increases, shock/gap add-ons, and stale-data failure behavior. Compare realized volatility, range-based measures, implied volatility only when genuinely sourced, and simple fixed-fractional sizing. Never infer unavailable implied volatility or market microstructure from candles.

### 10. Sequence-of-returns and withdrawals

Simulate multiple starting dates, contribution schedules, contribution interruptions, lump-sum versus phased funding, periodic withdrawals, emergency withdrawals, and adverse early-regime starts. Report recovery time and probability of meeting liabilities, not only terminal value. A strategy suitable during accumulation may be unacceptable near or during withdrawals even with identical average return.

The result should decompose wealth produced by investment return, contributions, cash yield, and withdrawals. Extraordinary terminal outcomes must not be attributed to strategy when they depend primarily on assumed contributions or favorable starting sequence.

### 11. Strategy capacity and liquidity

Use point-in-time price, volume, spread, volatility, and corporate-action data. Define participation-rate and days-to-liquidate constraints at both normal and stressed volume. Test partial fills, missed fills, open/close auction effects, market impact, trading halts, and liquidation across multiple accounts following the same signals.

Results must be segmented by account size and deployed capital. Publish the capital level at which expected alpha is consumed by impact or the universe becomes too narrow. Exclude apparent returns that require trading a material share of available volume or prices unavailable after the signal timestamp.

### 12. Failure under regime change

Required regimes include bull, bear, sideways, high/low volatility, inflation/rate shocks, liquidity crises, rapid rebounds, factor reversals, and sector-specific breaks. Use chronological walk-forward tests, leave-one-regime-out tests, alternative start dates, and prospective shadow periods. Do not tune the regime classifier and strategy on the same outcomes.

Predefine model-health indicators: forecast calibration, realized gap/slippage, correlation error, drawdown, turnover, missing-data rate, and benchmark-relative decay. Specify what triggers caution, research suspension, or rollback before observing failures. A regime label must not automatically restore risk.

## Risk-of-ruin definition and estimation

Ruin is any event that prevents the mandate from continuing, including:

- equity breaching an approved capital floor;
- inability to meet a known withdrawal, tax, or liquidity obligation;
- drawdown beyond the user's continued-participation tolerance;
- forced liquidation or margin call;
- loss of enough capital that minimum viable diversification/sizing is impossible;
- operational or data failure that leaves exposure unmanaged;
- permanent abandonment after an intolerable loss.

Report several thresholds rather than one binary number: probability of 10%, 20%, 30%, 40%, and 50% drawdown; probability and duration below the capital floor; time under water; recovery probability within 1, 3, and 5 years; and conditional expected loss beyond each threshold. Thresholds are not interchangeable with approval.

Estimation must use complementary methods:

1. historical portfolio replay with finite cash and point-in-time information;
2. moving-block or stationary bootstrap that preserves serial dependence;
3. regime-conditioned simulation with persistent transitions;
4. explicit stress scenarios beyond the historical sample;
5. parameter-uncertainty simulation for hit rate, payoff, correlation, gaps, and costs;
6. sensitivity to model decay and permanent edge loss.

Use confidence intervals and upper confidence bounds on ruin probability. Zero observed ruin events is not zero risk. If the sample cannot distinguish an acceptable probability from an unacceptable one, the correct result is insufficient evidence, not approval.

## Minimum research protocol before any production proposal

### Frozen specification and clean data

Before testing, version the universe, mandate, eligibility, sizing, exposure constraints, cash rules, entries/exits, event policy, costs, tax scenarios, benchmarks, missing-data behavior, and promotion criteria. Use delisted securities and point-in-time memberships, classifications, fundamentals/events, corporate actions, and timestamps. Audit data revisions and survivorship/look-ahead leakage.

### Portfolio simulation, not a trade list

Simulate synchronized candidate decisions, holdings, cash, contributions/withdrawals, competing opportunities, rejected trades, partial fills, taxes/costs, and simultaneous exits. Repeated observations of one thesis and correlated securities are not independent trials. The simulator must enforce that one dollar cannot fund multiple positions.

### Required challenger grid

At minimum compare:

- passive core, cash/Treasury proxy, and simple balanced benchmark;
- pure SignalForge tactical;
- core plus tactical sleeves at several bounded allocations;
- equal-weight, fixed-fractional, and volatility-scaled sizing;
- name/sector/heat/cash bands described above;
- no-confirmation and timing-only ablations;
- drawdown de-risking variants;
- no leverage versus leverage stress variants, with leverage ineligible for initial promotion.

The `core + tactical` recommendation earns preference only if it improves adverse-percentile after-cost terminal wealth or materially reduces capital-floor breaches without unacceptable long-run opportunity cost. A better average alone is insufficient.

### Acceptance evidence

No allocation policy should be proposed for production unless all of the following hold:

- positive incremental value versus simple benchmarks out of sample after realistic costs, taxes, and capacity assumptions;
- acceptable capital-floor breach and drawdown distributions under base, adverse, and parameter-uncertainty cases;
- no dependence on one regime, a few securities, largest winners, lucky ordering, or implausible fills;
- stability across reasonable neighboring parameters rather than a narrow optimum;
- explicit performance by small-account bands and position granularity;
- stress survival with correlations approaching one, gaps through stops, liquidity contraction, stale inputs, and manual delay;
- prospective shadow performance with frozen rules and sufficient independent episodes;
- operational proof that portfolio/symbol snapshots are synchronized and missing or stale risk inputs fail closed;
- independent review of model, data, legal/personalization, and user-behavior assumptions;
- predefined rollback and re-risking rules.

Promotion criteria must include an approved **upper bound** on ruin probability, not only a point estimate. The acceptable bound is a product-owner risk decision after research supplies defensible policy bands; Stage 0 cannot invent it.

## Explicit challenge to the Chief Investment Architect

### Recommendations accepted in principle

- The technical five-stage method should remain a subsystem, not the complete wealth architecture.
- Portfolio allocation permission must be independent of symbol authorization.
- Cash must be intentional and measured.
- Fixed-fractional and volatility-aware methods are better starting challengers than full Kelly.
- Point-in-time portfolio simulation, stress dependence, gaps, taxes/costs, and shadow validation are mandatory.
- `core + selective tactical` is a reasonable operating model to test.

### Recommendations requiring stronger constraints or evidence

1. **Core + tactical is not yet the preferred default.** It is only a challenger until sleeve size, rebalancing, benchmark, tax drag, drawdown interaction, and adverse-regime behavior are specified and validated. A tactical sleeve can add tail risk and churn while the core disguises its weak standalone economics.
2. **A portfolio authority needs veto semantics, not merely another score.** Unknown equity, stale holdings, unresolved orders, missing concentration classifications, invalid stops, or incomplete liquidity/event data must produce `NOT_AVAILABLE` or zero incremental tactical size. Symbol quality cannot compensate.
3. **“No leverage by default” should be stronger.** Initial production should explicitly prohibit leverage and leverage-like instruments. Any later exception requires a separate instrument-specific research, governance, suitability, and implementation package.
4. **Conservative sizing must have predeclared research bands.** Deferring every number makes unsafe variants hard to falsify. The bands in this review create a test grid but are not production defaults.
5. **Drawdown-aware sizing is incomplete without re-risking rules.** Otherwise it can lock in losses, re-enter on noise, or conceal model failure. Recovery gates must be frozen and evaluated with the de-risking rule.
6. **Correlation cannot rely on historical covariance.** Taxonomy, factor, scenario, and correlation-to-one stress controls are required, especially for sparse histories and regime breaks.
7. **A stop is not risk containment proof.** Promotion evidence must be based on realized loss and gap distributions, including joint loss and manual execution failure.
8. **Mandate context is a hard dependency for personalized allocation.** Without verified liquidity needs, account constraints, horizon, and capital floor, SignalForge can rank generic research opportunities but should not represent a size as personally safe.
9. **Long-term holdings need portfolio risk too.** Exempting a core holding from tactical exits must not exempt it from thesis impairment, concentration, liquidity, or portfolio drawdown review.
10. **The risk evidence needs effective sample size.** Confidence must be discounted for overlapping holdings, repeated signals, clustered regimes, and model versions. More bars do not create more independent portfolio crises.

## Production contract implied by this review

This document changes no production rule. A later implementation package should create one authoritative portfolio-risk state derived from synchronized holdings, cash, equity, constraints, exposure classifications, liquidity, and current candidate risk. It should return an allocation permission, maximum incremental size, binding blockers, provenance, freshness, missing inputs, and stress summaries.

The ordering should be:

`symbol hard authorization` + `mandate eligibility` + `portfolio-risk permission` → `executable maximum size`

The executable size is the minimum allowed by all authorities. No downstream layer may enlarge it. Portfolio permission cannot manufacture `BUY`; symbol authorization cannot bypass a portfolio veto. The Dashboard may explain this state but must not calculate it independently.

Until such a separately scoped authority is validated and approved, SignalForge should continue to describe itself as tactical decision support. It should not claim that current stops, sizing, simulations, or signal quality make risk of ruin acceptable or establish a wealth-compounding strategy.

## Final recommendation

**MODIFY the Chief Investment Architect's proposal and keep it research-only.** Preserve the proposed separation of technical timing, investment horizon, portfolio allocation, and execution, but add hard research requirements for gap-adjusted heat, concentration/factor stress, capital floors, small-account feasibility, liquidity/capacity, regime failure, sequence risk, and explicit de-risk/re-risk behavior.

Reject:

- full Kelly or score-based sizing;
- aggressive or uncapped leverage;
- concentration justified by conviction alone;
- risk estimates that assume stops fill;
- IID trade shuffles as ruin analysis;
- results dominated by a few winners or favorable sequences;
- any high-terminal-wealth approach whose probability of capital-floor breach is not both low and estimated with defensible uncertainty.

Survival is a binding design constraint, not a metric to inspect after maximizing return.
