# Stage 0 Investment Architecture Review

## Executive verdict: MODIFY

SignalForge is a sound foundation for **single-symbol technical decision support**, but not yet for long-horizon capital growth. Keep centralized data, provenance, fail-closed evidence, non-compensating gates, hard authorization, and research/production separation. Before freezing the architecture, add independent investment-quality and horizon systems plus a portfolio/capital-allocation authority between candidate approval and execution.

The present method asks, “Is this stock technically executable now?” It does not answer: “Is this exposure worth owning for the intended horizon?”, “Is adding it better than retaining a holding or cash?”, or “What position improves the whole portfolio's probability-weighted terminal wealth?” A valid technical BUY can remain an invalid allocation.

This is MODIFY rather than REJECT because the canonical snapshot, explicit missing-data states, provider discipline, and shadow-validation path are valuable. It is not KEEP because the five-stage method ends at symbol-level Execution and current evidence, sizing, and portfolio facilities do not establish a wealth strategy.

No claim of edge, superior compounding, acceptable ruin probability, or personal suitability follows from this review. Those remain to be proved.

## Strongest reasons supporting the verdict

1. **The architecture is tactical.** Production culminates in completed 15-minute confirmation and BUY authorization. Environment, Location, Path, Confirmation, and Execution may improve timing and trade definition, but none establishes durable business quality, valuation, reinvestment economics, balance-sheet resilience, governance, or a multi-year thesis.
2. **The evidence horizon is too short.** Outcomes cover 1, 3, 5, 10, and 20 sessions. They cannot establish multi-month holding quality, business compounding, regime-spanning persistence, or tax-aware long-term wealth. Twenty-session excess return is not evidence of long-term edge.
3. **Portfolio recording is not portfolio construction.** Holdings can be stored and monitored, and sizing limits a candidate by stop distance, cash, and a single-position cap. There is no authority for aggregate heat, sector/theme/factor overlap, correlation, liquidity, tax lots, turnover, replacement, or drawdown-aware allocation.
4. **Candidate ranking is not allocation.** A candidate's marginal value depends on what it joins, duplicates, and displaces. Independent symbol state and opportunity score cannot resolve portfolio effects.
5. **Technical timing and investment quality are different claims.** Strong confirmation can coexist with a fragile business or excessive valuation; a high-quality compounder can be temporarily unattractive to add. Separate evidence and permissions prevent one dimension compensating for failure of the other.
6. **The safety foundation is worth keeping.** One snapshot, visible freshness/provenance, explicit unavailable evidence, passive UI consumption, gated authorization, and shadow research reduce operational and epistemic risk. Extend them to allocation.
7. **Survivability is not enforced at portfolio level.** A 0.5% candidate risk suggestion or the simulator's 1% trade risk and 25% position cap does not establish acceptable ruin probability. Correlated stops, gaps, stale marks, and regime clustering can make nominal risk materially understate loss.

## Strongest counterarguments

- SignalForge is decision support, not a fiduciary, adviser, or broker; a user could allocate elsewhere. That is coherent only if the product remains explicitly a tactical tool and makes no complete wealth-system claim.
- Trend, relative strength, stops, and overextension may capture some information fundamental and portfolio models add. They may work for swing/trend strategies, but proxy overlap does not prove business quality or portfolio suitability.
- Avoiding complex fundamental models and optimizers reduces false precision. The answer is a few transparent, fail-closed portfolio constraints and separable research models, not omission of portfolio authority.
- Frequent evaluation need not mean frequent trading because the manager can say HOLD. Yet fixed targets/profit protection and short evaluation horizons may truncate long-duration winners. Holding-period and turnover studies must resolve this.
- Cash exists mechanically in sizing and simulation. Residual cash is not an intentional allocation state with a hurdle, reserve policy, duration, benchmark, and re-entry rule.

## Recommended investment horizons

Use explicit mandates; one mandate's result must not authorize another.

| Mandate | Typical horizon | Technical method's role | Required nontechnical evidence | Recommendation |
| --- | --- | --- | --- | --- |
| Tactical swing | 2–10 trading days | Primary setup/risk definition; entry refinement | Liquidity, material catalysts, event-gap risk | Challenger, not default wealth engine |
| Position / multi-week | 2–12 weeks | Entry, trend health, add/trim, invalidation | Basic financial quality, events, portfolio fit | Primary tactical mandate to test |
| Multi-month | 3–18 months | Secondary timing/risk overlay; no forced churn | Business quality, valuation range, earnings durability, balance sheet, milestones | Primary growth mandate to build |
| Long-term core | 3+ years, reviewed rather than mechanically exited | Optional entry/add discipline and warnings, not ownership thesis | Durable economics, management/capital allocation, valuation, diversification, tax/account context | Default core benchmark; not presently supported |

The preferred operating model to test is **core + selective tactical**:

- a diversified, low-turnover core or passive benchmark supplies market participation;
- a bounded satellite uses validated SignalForge position/swing decisions only when expected value exceeds costs, taxes, and opportunity cost;
- cash or short-duration cash equivalents are valid states for reserves, liabilities, unavailable evidence, or no qualifying candidate;
- a long-term holding is not sold merely because a short-term entry gate closes. Exit policy must distinguish thesis impairment, valuation, rebalancing, and tactical risk from normal volatility.

Cash must avoid forced deployment and indefinite timing-driven underinvestment. Give it an explicit purpose, duration, hurdle, benchmark, and re-entry rule.

## Proposed architecture layers

```text
Mandate, constraints, accounts, liabilities, and tax context
                              ↓
Central evidence plane
market + benchmark + company + portfolio + provenance/freshness
                              ↓
Investment Quality & Valuation Engine
                              ↓
Opportunity / Horizon Engine
                              ↓
Technical Timing Pipeline
Environment → Location → Path → Confirmation
                              ↓
Portfolio & Capital Allocation Authority
holdings + cash + correlation + concentration + heat + drawdown
+ liquidity + tax lots + opportunity cost
                              ↓
Execution Authority
                              ↓
Holding / Tax-Lot / Rebalancing Manager
                              ↓
Evidence, attribution, challenger, and governance plane
```

### Layer contracts

1. **Mandate and constraints:** objective, horizon, account type, tax sensitivity, liquidity reserve, contributions, permitted instruments, leverage policy, and drawdown tolerance. Without required context, rank research candidates but do not imply personalized allocation permission.
2. **Central evidence plane:** extend master-state discipline to synchronized holdings, cash, tax lots when available, benchmarks, exposure classifications, adjusted histories, and point-in-time fundamentals. Missing remains missing, never neutral or zero.
3. **Investment Quality & Valuation:** produce thesis state, evidence coverage, valuation uncertainty, disconfirming evidence, and valid horizon. Technical strength cannot override a failed quality/evidence minimum in mandates that require it.
4. **Opportunity / Horizon:** state why outperformance might occur, over what horizon, under which scenarios, with which catalysts and invalidation. Expected returns require calibrated ranges or distributions, not point promises.
5. **Technical Timing:** retain the method, but make Confirmation mandate-dependent for long-term additions. A long-term thesis must not inherit a 15-minute holding mandate.
6. **Portfolio & Capital Allocation Authority:** required **above symbol-level Execution permission and before capital is committed**. It returns `ALLOCATE`, `HOLD_EXISTING`, `REBALANCE`, `WAIT`, `HOLD_CASH`, or `NOT_AVAILABLE`, plus maximum size and blockers. It owns:
   - aggregate portfolio heat and correlated gap/stress risk;
   - name, sector, industry, theme, factor, and illiquidity concentration;
   - cash reserve and deployable-cash policy;
   - marginal benefit versus holdings and benchmarks;
   - turnover budget, replacement hurdle, cooldown, and re-entry;
   - account/tax-lot sensitivity without retaining a broken thesis for tax reasons;
   - utilization, idle-cash opportunity cost, liquidity, and capacity;
   - drawdown-aware de-risking and re-risking;
   - no leverage by default unless later product policy explicitly permits it.
7. **Execution:** preserve authoritative hard guardrails. Execution cannot enlarge size or bypass a portfolio blocker; portfolio permission cannot manufacture symbol authorization.
8. **Holding and rebalancing:** separate why to own from why to enter. Use mandate-specific thesis reviews, additions, trims, exits, contributions, and tax-lot handling. Tactical targets must not automatically liquidate core holdings.
9. **Evidence and governance:** record accepted, rejected, and cash decisions as knowable at the time. Attribute selection, timing, sizing, allocation, and cash/regime effects; isolate versions and prohibit automatic promotion.

## Concentration, correlation, turnover, tax, and capital efficiency

Optimize the distribution of **real, after-tax terminal wealth**, conditional on liquidity and acceptable loss—not maximum backtest CAGR. Report median and adverse-percentile outcomes, drawdown depth/duration, recovery probability, and probability of breaching capital floors.

Start sizing research with transparent fixed-fractional and volatility-adjusted methods constrained by exposure and liquidity caps. Fractional Kelly is only a challenger after probabilities and payoffs are calibrated out of sample with parameter uncertainty. Full Kelly, uncapped leverage, sizing from opportunity score alone, and averaging down without a new thesis are unsuitable defaults.

Define ruin as more than zero capital: inability to meet a cash need, permanent loss, drawdown beyond continued-participation tolerance, and operational/model failure. Include gaps and clustered correlated losses; a stop is not a guaranteed fill.

Do not invent numeric drawdown, capital-floor, concentration, or risk limits in Stage 0. WP-07 should test policy bands and recommend conservative defaults. No aggressive mode should advance unless adverse stress and resampled paths stay within approved budgets after costs, gaps, and correlation shocks.

Model taxes as scenarios: taxable versus tax-advantaged accounts, short- versus long-term treatment, realized-gain budgets, harvesting/wash-sale constraints where applicable, and jurisdiction/year uncertainty. Preserve pre-tax comparisons so tax assumptions cannot hide weak selection.

Capital efficiency is more than percent invested: measure return per unit of risk and scarce liquidity, time-weighted utilization, capacity, turnover, idle-cash opportunity cost, and whether a candidate improves the portfolio after displacing the next-best use of capital.

## Benchmark and challenger strategies required before claiming an edge

Use common point-in-time universes, windows, start dates, capital/contributions, corporate-action handling, liquidity constraints, and decision-time information.

| Family | Minimum specification | Question |
| --- | --- | --- |
| Cash / Treasury proxy | Available yield and tax treatment | Did risk-taking beat waiting? |
| Broad passive | Total-return U.S. market; optionally global | Did complexity beat low-cost ownership? |
| Balanced passive | Transparent diversified/risk-controlled mix | Did tactical control beat simple diversification? |
| Equal-weight universe | Same eligible universe and rebalance dates | Is selection adding value? |
| Quality investing | Point-in-time quality, low turnover, valuation discipline | Does business quality beat technical selection? |
| Momentum / relative strength | Simple fixed rules and cadence | Does SignalForge beat simpler technical rules? |
| Trend following | Transparent long/cash or long/defensive rule | Is timing complexity incrementally useful? |
| Concentrated quality | Explicit selection and caps | Is concentration rewarded for tail risk? |
| SignalForge tactical | Current eligible BUY/exit rules | What does the present method add? |
| SignalForge without intraday confirmation | Same selection/risk, simpler entry | Is confirmation worth delay, misses, and cost? |
| Core + SignalForge satellite | Passive/quality core, capped sleeve | Does the likely model improve terminal wealth? |
| Cash-filtered SignalForge | Explicit regime/cash rule | Does abstention beat its opportunity cost? |

Required ablations are quality-only, timing-only, allocation-only, and combinations. This locates any edge instead of crediting the entire pipeline for a simple component.

## Required evidence before production promotion

1. A versioned strategy specification fixed before testing: universe, horizon, signals, sizing, cash, exits, rebalancing, costs, tax scenarios, capacity, missing-data behavior, and benchmark.
2. Point-in-time integrity: delistings, symbol changes, splits/dividends, fundamentals as known then, publication times, membership, and no survivorship/look-ahead leakage.
3. Independent decision episodes and finite-cash portfolio simulation; repeated observations of one thesis are not independent bets.
4. Realistic spreads, liquidity/volatility-sensitive slippage, missed/partial fills, gaps through stops, applicable fees, and capacity.
5. Pre-tax, taxable-short-horizon, taxable-long-horizon, and tax-advantaged sensitivity; report turnover, holding periods, and realized gains.
6. Walk-forward and untouched out-of-sample tests across regimes, model-version isolation, leakage embargoes, and prospective shadow validation.
7. Parameter neighborhoods, alternate starts/universes/benchmarks, cost and missing-data shocks, regime splits, and removal of largest winners.
8. Portfolio drawdown/time underwater, downside risk, concentration, overlap, liquidity, utilization, correlated stress, and capital-floor breach probability.
9. CAGR/total return plus median and adverse-percentile terminal wealth. Bootstrap/Monte Carlo must model dependence, fat tails, regime clustering, and sample limits; naive IID trade shuffling is insufficient.
10. Out-of-sample calibration of probability/confidence tiers with uncertainty-justified sample thresholds.
11. Incremental value versus simple challengers after costs on risk- and tax-aware measures, including component ablations.
12. Operational shadow proof: safe stale/missing behavior, no request amplification, synchronized portfolio/symbol/execution state, and measured manual-decision assumptions.
13. Predefined promotion and rollback criteria, independent WP-06/WP-07 review, documented limitations, and no automatic promotion.

Report CAGR, total return, drawdown, time underwater, volatility/downside deviation, Sharpe/Sortino/Calmar where meaningful, expectancy, hit/payoff rates, profit factor, turnover, cost/tax drag, utilization, concentration, benchmark excess, regime persistence, and ruin probability. No single metric authorizes production.

## Claims that cannot currently be made

- SignalForge beats passive, quality, momentum, trend, or hybrid alternatives.
- The five-stage method has positive expected value or adds value after delay and costs.
- `BUY NOW`, `BUY WINDOW`, score, or confidence is a calibrated probability of profit.
- Planned 1.80:1 reward/risk yields a realized 1.80:1 payoff distribution.
- Current sizing makes portfolio ruin risk acceptably low, or stops cap losses at plan.
- HOLD/PROTECT/REDUCE improves multi-year compounding or tax efficiency.
- SPY-relative 1–20-session outcomes establish long-horizon or portfolio alpha.
- Backtest, paper, or shadow results transfer to live manual decisions.
- Cash filtering improves wealth—or full investment is superior.
- An extreme terminal-wealth target is probable, feasible without major contributions, or justification for leverage/concentration.
- The product suits a person without mandate, liquidity, tax, loss-tolerance, and jurisdiction context.

## Explicit unknowns

- Historical/forward sample sizes, regime coverage, and independent episode count.
- Live signal frequency, holding periods, turnover, missed fills, spreads, gaps, and adherence.
- Incremental effect of 15-minute confirmation versus delay/filtering.
- Whether targets and profit protection truncate compounding's positive skew.
- Availability, provenance, revisions, licensing, cost, and history of point-in-time fundamentals/corporate actions.
- Historical universe, delistings, symbol mapping, liquidity, and capacity.
- Candidate/holding correlation and factor clustering, especially under stress.
- Idle cash amount, duration, cause, and opportunity cost.
- Out-of-sample calibration of scores/confidence.
- Tax jurisdiction, account types/lots, and intended tax-guidance scope.
- User liquidity, contributions, loss tolerance, horizon, and behavior under drawdown.
- Whether the product remains generic support or adds mandate-aware allocation subject to legal/compliance review.

## Questions resolvable by research without asking the user

- What holding periods and turnover does current behavior create?
- What incremental out-of-sample value does each stage add beyond simple trend, momentum, volatility, and relative-strength rules?
- Does intraday Confirmation improve fill-adjusted expectancy, drawdown, and adverse selection?
- How do present exits change winner duration, skew, taxes, and returns versus thesis/trailing/periodic alternatives?
- How much cash does each strategy hold, and does it improve terminal wealth versus deployment?
- Which transparent portfolio constraints reduce ruin and drawdown most efficiently?
- How sensitive are results to correlation clusters, gaps, stale data, costs, capacity, and removal of top winners?
- Does core + tactical dominate pure passive or pure SignalForge across regimes and contribution schedules?
- Which point-in-time fundamental data fits provider, licensing, budget, and freshness constraints?
- Can quality/valuation models be calibrated sufficiently for production?
- What samples and shadow durations yield useful uncertainty bounds by horizon?
- Which outputs are generic research versus regulated/personalized guidance under legal review?

WP-06, WP-07, data-feasibility work, and legal/compliance analysis should answer these; they are not reasons to ask the user to choose implementation details.

## Genuine product-level decisions requiring user input

1. **Product boundary:** remain single-symbol timing/monitoring support or become mandate-aware portfolio decision support. The latter expands data, UX, compliance, and validation scope.
2. **Default mandate:** if portfolio support is chosen, select core + tactical, position-growth, or another defined default after comparative research. This encodes product values, not merely implementation.
3. **Personalization boundary:** whether to store account type, tax lots, liquidity reserve, horizon, and drawdown tolerance for allocation guidance, subject to privacy/legal review.
4. **Instrument/risk boundary:** remain unlevered long-only equities/cash by default or ever expose leverage, options, shorting, or other instruments. An aspirational target grants no answer.
5. **Unacceptable-loss default:** after WP-07 provides evidence-backed bands, approve the default capital-floor/drawdown posture and whether any higher-risk mode should exist.

Provider choice, formulas, sample thresholds, benchmark implementation, tests, and equivalent technical choices belong to research/governance, not user escalation.

## Stage-0 recommendation

Do not freeze `Environment → Location → Path → Confirmation → Execution` as the complete capital-growth architecture. Freeze it only as the **technical timing and trade-execution subsystem**. Require WP-06/WP-07 challenges and a later scoped package for investment-quality data, portfolio state, mandates, allocation permission, and mandate-specific holding management.

Until then:

- keep wealth logic research-only;
- preserve BUY and operational guardrails;
- treat cash as valid but measured;
- do not present symbol sizing as portfolio authorization;
- do not claim long-horizon edge from short-horizon outcomes;
- describe SignalForge as tactical decision support, not a proven wealth-compounding system.
