# SignalForge Capital Growth / Wealth Strategy Contract

## Purpose

SignalForge is not being built only to identify short-term trades. It must also be challenged from the perspective of long-horizon capital growth for a user who is not trying to become a day trader.

This workstream asks a different question from the trading engines:

> Is the overall SignalForge approach the best available way to grow capital over time while controlling the probability of ruin, or are we optimizing the wrong horizon, risk model, or capital-allocation process?

The goal is not to promise extraordinary returns. The goal is to maximize the quality of capital-growth decisions subject to survivability, evidence, and realistic constraints.

---

## 1. Core principles

1. Survival precedes compounding.
2. Expected return without drawdown/risk-of-ruin analysis is incomplete.
3. Higher theoretical return is not automatically a better strategy.
4. The system must distinguish discovery quality, trade confidence, and portfolio/capital-allocation quality.
5. No single-position or leverage scheme may be treated as acceptable merely because it can theoretically create extreme wealth.
6. Long-horizon wealth growth may require a mix of investing, selective swing/position trades, contributions, and ownership/business income rather than frequent day trading.
7. The agent may recommend NO POSITION / HOLD CASH / WAIT when expected value is poor.
8. The agent may challenge SignalForge itself if evidence shows the current architecture is optimized for activity rather than compounding.

---

## 2. The extreme-goal reality check

A nominal move from $100 to $100,000,000 is a 1,000,000x increase. Without adding capital, this would require extraordinary sustained compounding rates for decades. The wealth-strategy agent must therefore never use that target as permission for reckless concentration, leverage, options gambling, or risk-of-ruin behavior.

The practical objective is:

`maximize long-run probability-weighted terminal wealth while keeping risk of ruin acceptably low`

not:

`maximize the largest possible outcome in a lucky path`.

---

## 3. Strategic horizon

This workstream is explicitly not a day-trading mandate.

It should evaluate multiple holding horizons, including:

- multi-day swing opportunities;
- multi-week position trades;
- multi-month trend/quality opportunities;
- longer-term compounders when supported by fundamentals/market context;
- cash/no-position states when opportunity quality is low.

Intraday execution logic may improve entry quality, but it should not force the overall strategy into intraday turnover.

---

## 4. Required questions

The Capital Growth / Wealth Strategy agent must answer:

1. What return horizon is SignalForge actually optimized for today?
2. Does the Environment → Location → Path → Confirmation → Execution method improve entry quality without forcing excessive turnover?
3. Which parts of the system improve long-term compounding and which only improve short-term timing?
4. Are we missing portfolio-level logic such as concentration, diversification, opportunity cost, capital reserve, drawdown control, and re-entry policy?
5. How should capital be allocated among competing opportunities?
6. When should SignalForge prefer holding a strong position rather than repeatedly trading in and out?
7. What evidence is required before increasing position size?
8. What maximum drawdown/risk-of-ruin limits should exist before any aggressive-growth mode is considered?
9. How does the strategy compare with simple benchmarks and lower-complexity alternatives?
10. Does the strategy still add value after realistic costs, slippage, taxes, missed fills, and opportunity cost?

---

## 5. Metrics that matter

Do not optimize only for win rate or raw return.

The agent should evaluate, where data supports it:

- CAGR / annualized return;
- total return;
- maximum drawdown;
- time under water;
- volatility of returns;
- downside deviation;
- Sharpe / Sortino / Calmar where appropriate;
- expectancy per decision;
- hit rate;
- average win / average loss;
- profit factor;
- turnover;
- tax/cost drag assumptions;
- capital utilization;
- risk of ruin;
- concentration exposure;
- benchmark-relative excess return;
- persistence across regimes;
- sensitivity to parameter changes;
- Monte Carlo outcome distribution when enough evidence exists.

No single metric can authorize a strategy.

---

## 6. Portfolio / capital-allocation layer

SignalForge needs a layer above individual-stock decisions.

A stock may be a valid BUY candidate while still being a poor portfolio decision because:

- too much capital is already concentrated in the same sector/theme;
- another opportunity has better expected return per unit of risk;
- available cash reserve is too low;
- portfolio drawdown is elevated;
- the position is highly correlated with existing holdings;
- the expected holding period conflicts with liquidity needs;
- the setup is good but position size should be small.

The future portfolio layer should therefore separate:

`Stock Decision Quality`

from

`Portfolio Allocation Permission`.

---

## 7. Position sizing

The agent must research and test sizing methods rather than hard-code an aggressive formula.

Candidate approaches may include:

- fixed fractional risk;
- volatility-adjusted sizing;
- capped fractional Kelly only when probability/edge estimates are sufficiently calibrated;
- drawdown-aware de-risking;
- confidence/evidence-based caps;
- concentration limits.

Full Kelly or uncapped leverage must not be used as a default growth strategy.

---

## 8. Strategy families to compare

The agent should compare SignalForge against plausible alternatives, not assume SignalForge is best because we built it.

Examples:

- broad-market passive benchmark;
- quality/momentum investing;
- trend-following / relative-strength rotation;
- concentrated high-conviction position strategy;
- swing strategy using SignalForge timing;
- hybrid core + tactical allocation;
- cash-filtered regime strategy.

The purpose is to determine where SignalForge provides unique value: discovery, timing, risk control, position management, or a combination.

---

## 9. Research / production separation

This workstream is initially research-only.

It may:

- propose portfolio rules;
- run backtests and simulations;
- compare strategies;
- produce challenger models;
- identify missing data;
- recommend architectural changes.

It may not:

- weaken production BUY guardrails;
- automatically increase leverage;
- silently change position sizing;
- promote a strategy to production without evidence and integration approval;
- claim that an extreme wealth target is probable or guaranteed.

---

## 10. Definition of done

The wealth-strategy review is complete when it produces:

1. a written assessment of whether SignalForge is optimized for the right horizon;
2. a recommended wealth-building operating model (for example swing/position/hybrid rather than day trading);
3. portfolio-level requirements missing from the current architecture;
4. benchmark/challenger strategies to compare;
5. risk-of-ruin and drawdown limits for future research;
6. a capital-allocation research plan;
7. a list of claims that still require evidence;
8. a recommendation to KEEP, MODIFY, or REJECT the current strategic approach.

The agent is expected to challenge the project, not merely endorse it.
