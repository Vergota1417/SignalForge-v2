# SignalForge Stage-0 Architecture Review

## Decision status

**Final strategic verdict: MODIFY.**

SignalForge should keep its centralized-data, same-snapshot, provenance, explicit-missing-data, provider-budget, hard-authorization, and research/production boundaries. It should also keep `Environment → Location → Path → Confirmation → Execution` as an ordered, non-compensating symbol-level method. Path is a useful explicit gate.

SignalForge must be modified because that method is not a complete capital-growth system and its current prose is not deterministic enough for runtime implementation. It can answer, once validated, whether a stock setup is technically executable. It cannot yet establish investment quality, the best holding mandate, portfolio fit, safe size, acceptable risk of ruin, or superiority to simpler strategies. No current evidence proves that the method has positive expected value or improves after-cost, after-tax terminal wealth.

This is not a rejection of the tactical architecture. It is a rejection of treating tactical authorization as wealth or allocation authorization, and of coding underspecified U.S.-equity adaptations as though the futures-derived method were already validated.

## Authority-based resolution of the research

The six reports agree on the safety foundation and on `MODIFY`. Where they differ, this review resolves the disagreement as follows:

- The investment architect's `core + selective tactical` model is retained only as a challenger. The quantitative challenger and risk officer correctly establish that no default mandate has earned selection.
- A separate Investment Quality layer is **required for any multi-month, long-term, compounder, or wealth-quality claim**, but not as a hidden prerequisite for a strictly tactical swing setup. Until point-in-time fundamental data and a validated contract exist, this layer is `NOT_AVAILABLE`, and SignalForge must not claim to evaluate business quality or valuation.
- A separate Capital Allocation/Portfolio layer is **required before any symbol-level permission is presented as portfolio permission, personal size, or a complete wealth decision**. If it is deferred, the tactical rebuild may proceed only with an explicit `Portfolio fit not evaluated` boundary and no allocation claim.
- Research bands proposed by the risk officer are a preregistered test grid, not production thresholds. The product owner must eventually approve loss and risk boundaries after evidence exists.
- Exact volume profile and native order-flow claims are not rescued by plausible OHLCV proxies. Repository governance and data evidence require `NOT_AVAILABLE` or a distinctly labeled research estimate.

## Final recommended product architecture

```text
Product mandate and user/account constraints
  objective · holding horizon · liquidity · tax/account context · risk boundary
                              ↓
Central evidence plane
  provider gateway → raw cache → canonical symbol/benchmark/company/portfolio snapshots
  provenance · as-of time · freshness · adjustments · missing-input map
                              ↓
Investment Quality & Valuation layer (mandate-dependent)
  required for multi-month/core ownership; NOT_AVAILABLE until sourced and validated
                              ↓
Opportunity & Horizon contract
  direction · thesis · destination · invalidation · decision/entry/holding horizon
                              ↓
Symbol-level technical method
  Environment → Location → Path → Confirmation → Execution
  Execution consumes, never duplicates, authoritative hard BUY authorization
                              ↓
Portfolio & Capital Allocation authority
  independent veto · maximum incremental size · cash · concentration · heat
  correlation/factor stress · liquidity · drawdown · opportunity cost
                              ↓
Executable maximum size / order decision
  minimum allowed by symbol, mandate, portfolio, liquidity, and production authorities
                              ↓
Holding, tax-lot, exit, and rebalancing manager
                              ↓
One calculated master state → passive Dashboard renderers
                              ↓
Versioned audit, attribution, shadow research, challengers, drift, and rollback
```

The evidence plane must preserve the existing central-acquisition rule. Dashboard blocks never call providers, assemble their own stock view, calculate allocation, or create a second truth. Market, company, and portfolio snapshots may update on different justified cadences, but every consumer must receive explicit identifiers, effective cutoffs, freshness, provenance, and missing-input states. Mixed snapshots or ambiguous as-of times fail closed.

The Portfolio authority is a veto, not a score. Its future result should include `ALLOCATE`, `HOLD_EXISTING`, `REBALANCE`, `WAIT`, `HOLD_CASH`, or `NOT_AVAILABLE`; maximum incremental size; binding blockers; stress summaries; provenance; freshness; and missing inputs. Unknown equity, stale holdings, unresolved orders, missing required classifications, invalid risk levels, or unavailable required liquidity/event evidence cannot be treated as zero exposure. Portfolio permission cannot manufacture a BUY, and symbol authorization cannot bypass a portfolio veto.

The initial wealth-product research boundary is unlevered, long-only equities and cash. Borrowing, margin leverage, leveraged ETFs, shorting, and synthetic options leverage are ineligible for initial production. A later exception requires its own research, suitability, governance, product-owner approval, implementation package, and production review.

## Exact role of the five-stage method

The method is the **symbol-level technical timing and trade-definition subsystem**, not an investment-quality model, portfolio optimizer, or proof of edge.

1. **Environment — What kind of market is this?** Classifies whether the stock, market, sector, volatility, and structural regime provide an intelligible and suitable context. It cannot waive later gates.
2. **Location — Is price in a defensible place?** Requires a declared direction, structural thesis, defensible invalidation, and non-chasing location. It uses only validated structural/auction references.
3. **Path — Is there realistic room for the move?** Requires a declared destination, ordered material obstacles, and sufficient net room relative to risk and costs. A good Location cannot pass directly into an obstacle or exhausted range.
4. **Confirmation — Is the move supported by evidence available now?** Evaluates completed-bar price acceptance, relative activity, momentum, and other honestly named evidence. Bar behavior is not native order flow. A setup contract decides whether unavailable native order flow is required and locking or optional and coverage-reducing.
5. **Execution — Is the setup executable now under authoritative production rules?** Consumes same-snapshot upstream results, entry/ceiling/stop/targets, freshness, and the existing hard authorization. It never redefines production thresholds and cannot emit actionable permission without authoritative proof.

Every stage is bound to the same symbol, snapshot, direction, decision horizon, entry horizon, holding mandate, and as-of time. Required `FAIL`, `LOCKED`, `NOT_AVAILABLE`, `NOT_READY`, `STALE`, or `ERROR` locks downstream execution. `PARTIAL` is permitted only when absent evidence is explicitly optional. Confidence and evidence coverage explain information quality; they never compensate for a failed gate. A summary score may rank research candidates only and must remain visibly separate from permission.

## Holding mandates and horizon separation

One horizon's result must never authorize another. The app must persist and display a mandate identifier and distinct decision, entry, holding, and outcome horizons.

| Mandate | Typical holding horizon | Role of five-stage method | Required additional evidence | Stage-0 disposition |
| --- | --- | --- | --- | --- |
| Tactical swing | 2–10 trading days | Primary setup, entry, invalidation, and exit timing | Liquidity and event-gap context | Research challenger; closest to current method |
| Position trade | 2–12 weeks | Entry refinement, trend health, add/trim timing | Basic financial quality, events, portfolio fit | Preferred tactical horizon to test, not a default |
| Multi-month growth | 3–18 months | Secondary timing and risk overlay; must not force churn | Investment quality, valuation range, durability, balance sheet, milestones | Requires new Investment Quality and allocation layers |
| Long-term core | 3+ years with periodic thesis review | Optional entry/add discipline and warnings, not the ownership thesis | Durable economics, management/capital allocation, valuation, diversification, tax/account context | Benchmark/challenger; not currently supported by SignalForge |

Intraday confirmation may improve an entry but must not silently turn a long-duration thesis into an intraday mandate. A long-term holding is not sold merely because a short-term entry gate closes. Holding management must distinguish thesis impairment, tactical invalidation, valuation, rebalancing, tax lots, and ordinary volatility.

## Methodology disposition

For this review, `EXACT` means a transferable logic or integrity contract, not proven trading edge. `ADAPT` requires a deterministic U.S.-equity definition and validation before production effect.

| Classification | Methodology items | Binding disposition |
| --- | --- | --- |
| **EXACT** | Ordered conditional gates; Location before Confirmation; destination before Confirmation; same canonical symbol/snapshot/as-of identity; fixed dataset roles; required-versus-optional evidence; provenance/freshness; explicit missing states; no clean Location/Path means no execution; location-conditioned Confirmation; authoritative hard-authorization consumption; no-trade as a first-class result; separation of stock opportunity and portfolio permission | Freeze as orchestration and truthfulness contracts. These rules may be tested immediately but do not prove edge. |
| **ADAPT** | Direction/horizon binding; U.S. exchange calendar, RTH/extended-hours and corporate-action policy; balance/imbalance; structure and multi-timeframe alignment; volatility/regime; market/sector alignment; failed-breakout/return-to-value/overlap rules; pivots and support/resistance; volume-profile concepts when supported and truthfully labeled; POC/VAH/VAL only from a valid declared profile; range premium/discount; distance to invalidation/destination; obstacle inventory; room formulas; ATR-normalized distance; completed-bar price acceptance; price expansion/momentum; relative volume/activity; existing entry/stop/target/overextension outputs through authoritative owners | Define formulas, thresholds, state transitions, intervals, samples, adjustment/session rules, and failure semantics. Start as shadow unless an existing authoritative production owner already governs the output. Promote only on preregistered equity evidence. |
| **DATA_REQUIRED** | Exact traded-at-price volume profile; executed bid/ask footprint and delta; stacked imbalance; true absorption; resting liquidity/L2; MBO/L3; GEX/options positioning; point-in-time fundamentals and valuation; news/catalyst and event coverage where used as required evidence | Remain `NOT_AVAILABLE` until a legitimate source, entitlements, lineage, cadence, storage, outage semantics, request/event budget, feed reconciliation, and validation are approved. Never infer from candles. |
| **RESEARCH_ONLY** | Source 4h/1h/15m/5m stack; Fibonacci ratios and preferred 0.705–0.886 zone; opening range; session-range consumption; activity rhythm; stock expected expansion/exhaustion; OHLCV effort-versus-result proxy; OHLCV bar-allocation volume-profile estimate; post-absorption sequence; sizing, turnover, holding and wealth-superiority claims; core-plus-tactical; cash/regime filters; fractional Kelly | Store as versioned shadow evidence with `affectsExecution:false`. Use distinct labels such as `OHLCV_PROXY` or `estimated OHLCV bar-allocation profile`. No automatic promotion. |
| **REJECT** | Direct NQ volatility projections/fixed deviations; Asia/London/New York NQ rotation copied to individual stocks; futures constants/platform labels treated as equity rules; synthetic footprint/delta/absorption/L2/MBO/GEX; full Kelly; uncapped or score-proportional sizing; martingale/averaging down because price fell; leverage or concentration justified by the extreme wealth aspiration; IID trade shuffling as sole ruin evidence | Do not implement as stock production evidence or initial wealth-product policy. A related equity hypothesis must begin as a new, independently specified research item. |

## Data feasibility and unsupported evidence

### Supported from current centralized data, subject to frozen semantics

- Higher-timeframe OHLCV structure, with explicit provider adjustment semantics and completed-bar rules.
- Completed 15-minute intraday structure after the master contract—not individual callers—guarantees forming-bar exclusion, exchange calendar, half-days, holidays, and halts.
- Wilder ATR/realized bar-volatility normalization; it is not implied volatility or a future range forecast.
- Deterministic pivot-derived support/resistance; these are model references, not known institutional levels or resting liquidity.
- OHLCV relative volume/activity with sample, time-of-day cohort, session, and fallback provenance; it does not identify aggressor side or institutional participation.
- Simple range position/premium-discount arithmetic after an objective range owner and reset rule are frozen.
- SPY context and limited curated ETF mapping, with sector explicitly missing for unmapped symbols. A broad-market fallback is not sector context.

### Unsupported or incomplete

- Current candles do not contain executed volume at price. Exact POC/VAH/VAL and volume nodes are unsupported. A coarse estimate is research-only and must expose timeframe, anchors, bins, allocation rule, value-area algorithm, tie rule, coverage, session policy, timestamp, and sensitivity.
- No connected repository source is demonstrated for company fundamentals, news/catalysts, options chains/GEX, trade-condition/aggressor data, depth, or MBO events.
- True executed delta, footprint, stacked imbalance, true absorption, L2, and MBO cannot be recovered from OHLCV. They are `NOT_AVAILABLE`, not zero, bearish, or a candle-derived substitute.
- GEX requires a legitimate options chain, OI as-of date, Greeks or reproducible model, multipliers/corporate actions, and disclosed dealer-sign assumptions. It is context only and never authorization.
- Fundamentals require point-in-time statements, filing/publication dates, revisions/restatements, units/currency, shares, corporate actions, and licensed valuation inputs. Current price history cannot be relabeled business quality.
- News/event absence cannot be inferred from quiet price or an incomplete feed.
- Provider plans, entitlements, exchange coverage, real-time/delayed status, and adjustment behavior require external verification before they are budgeted or relied upon.

The current 700-request daily ceiling remains authoritative. Existing Radar traffic can consume up to the documented 135 requests per market day before other workloads. All available bar features must reuse canonical cache entries. Benchmark data should be shared across symbols. Fundamentals, news, options, trades, and depth are separate acquisition programs requiring explicit worst-case request or event-rate, bytes, storage, retention, reconnect/backfill, entitlement, and fallback budgets. They cannot appear as a hidden Dashboard or engine fetch.

## Mandatory beginner acceptance criteria

The producer contract must supply stable state/reason codes, blocker, next observable condition, improvement/worsening or invalidation conditions, validated level roles, evidence coverage, missing/unavailable evidence, source/calculation times, freshness, symbol/snapshot identity, `affectsExecution`, and actionable permission proof. The UI may translate these fields; it may not infer a reason, state, threshold, level, allocation, or trading meaning.

Release acceptance requires:

1. Level 1 presents identity, one authoritative action, one ordinary-language reason, the next condition, primary risk/invalidation, and human-readable freshness before navigation or specialist evidence.
2. Within roughly 10 seconds, a beginner can identify the view, action, ready/waiting/data-unavailable distinction, main reason, major risk, and freshness without color or jargon.
3. Within roughly 30 seconds and at most one explanation action, the beginner can identify the blocking stage, explain its plain meaning, state what is awaited and when reassessment occurs, and reach technical evidence.
4. Beginner questions lead each stage; professional names remain secondary and available. The five stages appear as gates, never a compensating progress score.
5. `BUY NOW` includes authoritative proof and the supplied entry, stop, target, reward/risk, chase ceiling, and freshness. It is permission under current rules, not certainty, allocation approval, advice, or automatic execution.
6. `READY SOON`, `PULLBACK`, and `WAIT` name an exact next condition. `SELL-EXIT` is tied to an owned position. `AVOID` is never substituted for stale, missing, partial, errored, or unsupported data.
7. Stop, thesis invalidation, do-not-enter-above, and data invalidation are distinct. Completed-bar dependencies are explained in ordinary language.
8. Missing is not zero; unsupported is not bearish; stale is not current; no sample is not 0%. System/data states are distinct from market judgments.
9. Every acronym is expanded or accessible on tap, focus, and hover, with meaning and limitations. No acronym is required for the basic action, reason, next condition, risk, or freshness.
10. Level 3 retains technical evidence. Level 4/Data Validation exposes provider, dataset/timeframe/bar proof, source and calculation times, freshness, missing inputs, evidence coverage, unsupported evidence, and snapshot ID.
11. Every stock-dependent block renders the active symbol/snapshot or withholds mismatched content. Chart timeframe is explicitly visualization-only.
12. The mobile order is identity/freshness → What Should I Do? → reason/next/risk → five-stage explanation → levels → chart → specialist evidence → history/peers/news → validation. Production text and controls are readable, touch-sized, keyboard/assistive-technology usable, and not hover-only.
13. Onboarding is short, skippable at every step, replayable, and teaches decision support/no auto-trading, the gates, action/data states, risk, portfolio fit, missing/stale evidence, and validation. It uses exactly `RandomSTOCKASAN FIXed example` during the zero-data contract and fabricates no setup.
14. Trade setup and portfolio allocation are visibly separate. Until the portfolio authority exists, the UI states `Portfolio fit not evaluated`.
15. Help, glossary, onboarding, and all Dashboard blocks add zero provider requests. Technical truth remains accessible and no teaching copy changes engine semantics.

WP-75 must freeze the explanation producer/consumer contract before WP-80 freezes copy or hierarchy. WP-85 and participant-based comprehension checks are required before WP-95 can be considered complete.

## Risk-of-ruin requirements

Ruin means any condition that prevents the mandate from continuing: breach of an approved capital floor; inability to meet a modeled liquidity, tax, or withdrawal obligation; intolerable drawdown or abandonment; forced liquidation; loss of minimum viable diversification/sizing; or operational/data failure that leaves exposure unmanaged. It is not limited to wealth reaching zero.

Before any allocation policy is proposed for production, research must:

- simulate a synchronized finite-cash portfolio ledger containing candidates, rejected orders, holdings, cash, lots, contributions/withdrawals, partial/missed fills, simultaneous exits, costs, taxes, and one-dollar/one-use accounting;
- distinguish planned stop loss, realized loss, gap/event loss, correlated stress loss, and stale/untradeable exit loss; a stop is never maximum-loss proof;
- compare equal weight, fixed fractional using realized loss distributions, volatility-adjusted fixed fractional with floors/shock multipliers, drawdown-scaled sizing with frozen re-risk rules, and capped fractional Kelly as research only;
- round size down and return zero size when the minimum tradable unit breaches the risk budget;
- measure name, sector, industry, theme, factor, beta, liquidity, and stress-correlation concentration; test cluster correlations at stressed estimates and 0.75/0.90/1.00;
- report nominal stop heat separately from gap-adjusted, correlation-adjusted, event-cluster, and liquidity-adjusted stress loss;
- test gaps, binary events, halts, no fills, manual delay, liquidity contraction, joint sector losses, and unavailable event data;
- model drawdown de-risking and re-risking together so de-risking cannot be credited without its recovery cost;
- separate external emergency/liability reserves, operating reserves, and strategic portfolio cash; include cash yield, inflation, tax, missed upside, and re-entry friction;
- test adverse starting sequences, contribution interruption, accumulation and withdrawal phases, emergency withdrawals, recovery time, small-account granularity, and capacity/market impact;
- evaluate bull, bear, sideways, volatility, rate/inflation, crisis, rebound, factor-reversal, liquidity-stress, and sector-break regimes using lagged definitions and leave-one-regime-out checks;
- report probabilities of 10%, 20%, 30%, 40%, and 50% drawdowns; capital-floor breach and duration; time underwater; conditional loss; and recovery probability within 1, 3, and 5 years;
- estimate uncertainty with historical replay, block/stationary bootstrap, regime-conditioned persistent simulation, deterministic stresses, parameter/execution uncertainty, and permanent-edge-decay sensitivity. Zero observed ruin is not zero risk;
- use upper confidence bounds on ruin probability. `INSUFFICIENT_EVIDENCE` blocks promotion when the sample cannot distinguish acceptable from unacceptable risk.

Preregistered research bands—not production defaults—should include name exposure at 5/10/15/20%, sector exposure at 20/30/40%, nominal heat at 2/4/6/8%, portfolio cash at 0/10/20/30% and higher-cash challengers, and drawdown responses across 0–5/5–10/10–15/15–20/>20%. No evidence currently supports a production name cap above 10%; 20% name exposure and 6–8% nominal heat are aggressive stress challengers.

Promotion requires positive incremental out-of-sample value after costs/taxes/capacity, acceptable adverse and upper-bound ruin distributions, broad parameter/regime stability, small-account feasibility, survival of correlation-to-one and gap/liquidity/data stresses, prospective shadow evidence, independent review, and predefined rollback/re-risk rules. No strategy is promoted because of CAGR, average return, win rate, planned reward/risk, or a favorable median alone.

## Challengers and validation plan

The null hypothesis is that SignalForge does not improve risk- and tax-aware terminal wealth over the best simple eligible alternative after comparable frictions and constraints.

Required challengers are cash/short-duration Treasury proxy; broad U.S. passive and optional global passive; simple balanced passive; equal-weight eligible universe; point-in-time quality plus momentum; relative-strength rotation; transparent trend following; capped concentrated quality; SignalForge-only swing; SignalForge without intraday confirmation; passive core plus bounded SignalForge sleeve; and cash/regime-filtered SignalForge.

Mandatory ablations hold other components constant while testing:

- five-stage entry versus next-tradable-bar, declared limit policy, and no-intraday-confirmation entry;
- cumulative gates and each meaningful standalone component;
- discovery/ranking versus equal-weight eligible candidates;
- current exits versus fixed-horizon, thesis, volatility-trailing, and periodic-rebalance exits;
- current sizing versus equal weight and volatility scaling under identical caps;
- current planned reward/risk filter versus its removal in research without changing production policy;
- passive core alone versus the identical core plus tactical sleeve;
- quality-only, timing-only, allocation-only, cash-filter, and preregistered combinations.

Before viewing holdout results, freeze a machine-readable strategy specification covering mandate/horizon, point-in-time universe, signal formulas and lags, missing-data behavior, decision/order/fill times, finite cash and flows, sizing/exposure/leverage, replacement/rebalance/cooldown/exit/re-entry, corporate actions/delistings, costs/slippage/taxes/capacity, benchmarks, metrics, multiplicity controls, rejection rules, and strategy/data version hashes.

Use survivorship-free point-in-time security masters, corporate actions, total-return histories, filing vintages, benchmark membership, classifications, cash returns, event calendars where used, realistic spread/impact/fills, immutable lineage, and versioned SignalForge states. Unavailable historical stage or microstructure evidence is `NOT_TESTABLE`; it is not reconstructed from inadequate data.

Run event-driven finite-cash portfolio tests; anchored and rolling walk-forward folds with purge/embargo; one untouched chronological holdout; parameter neighborhoods; alternate starts, universes, regimes, costs, taxes, fill latency, and missing-data shocks; removal of largest winners; block/cluster resampling; deterministic tail stresses; then a prospective frozen shadow period. Maintain the complete experiment ledger, including failures. More synthetic paths never create more historical information.

The promotion decision is only `REJECT`, `RESEARCH LONGER`, or `ELIGIBLE FOR SEPARATELY SCOPED PRODUCTION REVIEW`. There is no automatic production path. Failure of a component rejects that component; a materially revised strategy starts a new validation cycle and does not reuse the holdout.

## Contracts that must be frozen before WP-10 or runtime engine coding

1. **Product boundary and authority map:** tactical decision support versus mandate-aware portfolio support; which layers are in the first release; exact distinction among candidate, symbol execution, allocation, size, order, and holding permissions.
2. **Mandate/horizon identity:** supported direction/instruments; decision, entry, holding, and evaluation horizons; mandate IDs; setup-specific required gates; behavior when mandate is absent or mismatched.
3. **Canonical snapshot schema:** symbol and snapshot identity; as-of cutoff; provider and adjustment lineage; source/calculation times; `ANALYSIS`, `EXECUTION`, `BENCHMARK`, and visualization-only `CHART`; bar completion; exchange calendar/session; corporate actions; freshness; missing/stale/error semantics; cross-provider discontinuity policy.
4. **Canonical intervals and cadence:** exact intervals/lookbacks/history lengths for each supported mandate and dataset role; RTH/extended-hours; half-days/holidays/halts; refresh eligibility; no forming-bar ambiguity; benchmark synchronization.
5. **State machine and evidence criticality:** enumerated stage/final/system states; required versus optional inputs per setup; minimum coverage; `affectsExecution`; blocker priority; transition/expiry rules; distinction among `FAIL`, `LOCKED`, `NOT_AVAILABLE`, `NOT_READY`, `STALE`, `PARTIAL`, and `ERROR`.
6. **Structure/Environment definitions:** pivot algorithm, lookbacks, prominence/confirmation delay, zones, split/gap handling, timeframe conflicts, balance/imbalance, volatility/regime, overlap/expansion, failed breakout, return to value, and market/sector mapping rules.
7. **Location/profile definitions:** range owner/reset; support/resistance construction; premium/discount; exact-versus-estimated profile naming; range, granularity, bins, allocation, value-area method, POC tie and node rules; approximation stability and failure semantics.
8. **Path contract:** direction/destination owner; obstacle taxonomy, merge/order/materiality; entry reference; room available/required formulas; costs/slippage and volatility buffers; ATR definition; precedence with authoritative reward/risk.
9. **Confirmation contract:** completed-bar definition; level owner; acceptance/rejection tolerance, close/retest/hold windows; RVOL numerator/cohort/lookback/minimum sample/calendar/fallback; momentum/expansion formulas; native-order-flow requirement per setup; freshness and expiry.
10. **Execution adapter boundary:** imports and proof shape for authoritative hard guardrails; entry/ceiling/stop/target ownership; upstream fail-closed semantics; no duplicated threshold; permission expiry and mismatch handling.
11. **Calculated master and explanation schema:** one browser payload; coherent IDs; provenance/validation proof; stable reason codes; blocker, next condition, improve/worsen/invalidation, level roles, evidence coverage, unavailable inputs, and portfolio-fit boundary.
12. **Investment Quality contract:** which mandates require it; point-in-time fields; quality, valuation uncertainty, thesis/disconfirming evidence, freshness, minimum coverage, and `NOT_AVAILABLE` behavior. It may be explicitly deferred for a tactical-only release.
13. **Portfolio/Allocation contract:** whether included or deferred; synchronized holdings/cash/equity/orders/lots; concentration, heat, correlation, liquidity, event, drawdown and cash inputs; veto states; maximum-size composition; missing/stale failure behavior. Without it, no portfolio-fit or sizing claim.
14. **Data acquisition and budget contract:** named source purpose, entitlements/licensing, batch/cache/storage/retention/fallback, worst-case request or stream envelope, provider-change provenance, and explicit unsupported evidence. No new source is implied by a method field.
15. **Research protocol:** challengers, ablations, point-in-time datasets, ledger/fills/cost/tax/capacity assumptions, outcomes, effective sample rules, uncertainty/multiplicity, walk-forward/holdout/shadow, promotion/rollback, and `NOT_TESTABLE`/`INSUFFICIENT_EVIDENCE` semantics.
16. **Beginner producer/consumer contract:** the Level 1–4 fields and state mappings, glossary limitations, mobile hierarchy, onboarding, comprehension tests, portfolio-fit wording, and no-network/no-recalculation limits.

These freezes are architecture contracts, not permission to edit production guardrails, provider policy, work-package ownership, or runtime code in Stage 0.

## STOP items before coding

The following stop WP-10 and runtime method-engine coding until resolved and recorded in authoritative contracts:

- No first-release product boundary or supported mandate/horizon has been chosen. Without it, canonical datasets and required gates cannot be defined safely.
- Canonical intervals, lookbacks, exchange/session/completed-bar behavior, corporate-action adjustment, freshness, benchmark cutoff, and cross-provider semantics are not frozen.
- The stage/final state machine, evidence criticality, fail-closed transitions, and `affectsExecution` rules are not frozen.
- Environment, Location, Path, and Confirmation formulas and threshold owners remain prose-level. Do not code optimistic interpretations.
- The Execution adapter's authoritative proof interface and mismatch/expiry semantics are not frozen. Do not copy or alter hard guardrails.
- The exact-versus-estimated volume-profile boundary and unsupported-evidence list are not contractual fields in the master schema.
- The calculated-state explanation fields required by beginner UX are not frozen; UI copy cannot compensate by deriving trading meaning.
- Any mandate requiring investment quality is blocked until point-in-time data feasibility and its missing-data contract are approved.
- Any portfolio permission, sizing, or wealth-product implementation is blocked until the allocation veto, risk boundary, synchronized portfolio state, and research/promotion contract are separately scoped and approved.
- Any new fundamentals, news, options, trades, or depth acquisition is blocked until external source capabilities, licensing, provenance, budget, storage, failure semantics, and provider-policy ownership are verified.

These are not blockers to documentation, data-source investigation, test-fixture design, preregistration, or other explicitly research-only work that changes no runtime behavior. They are blockers to treating an unresolved choice as an executable production contract.

## Autonomous resolutions and product-owner decisions

### Resolve autonomously under repository governance

Agents should determine and document, with evidence: existing source capabilities and gaps; exact schema shapes and reason codes; exchange-calendar and completed-bar mechanics; provider adjustment differences; cache and worst-case request/event budgets; formula candidates and sensitivity grids; point-in-time data/licensing options; benchmark implementations; research sample sufficiency; historical holding periods/turnover; stage ablations; entry/exit alternatives; cash utilization; small-account feasibility; stress and ruin distributions; legal/compliance questions for review; and usability test implementation. Equivalent technical choices do not belong with the product owner.

Research should decide whether SignalForge, any stage, Investment Quality layer, core-plus-tactical mix, cash filter, or allocation rule adds incremental value. A favorable narrative is not a product decision and cannot override failed evidence.

### True product-owner decisions

Only the following require product-owner direction after agents present evidence-backed alternatives:

1. **Product boundary:** remain explicitly single-symbol tactical timing/monitoring support, or expand into mandate-aware portfolio decision support with the associated data, privacy, compliance, UX, and validation scope.
2. **Default mandate:** after fair challenger results, select the default horizon/operating model and whether multiple mandates are exposed. Core-plus-tactical has no presumption.
3. **Personalization boundary:** whether the product stores account type, tax lots, liquidity needs/reserve, contributions/withdrawals, horizon, and drawdown tolerance, subject to privacy and legal review.
4. **Instrument and leverage boundary:** approve the initial unlevered long-only equities/cash boundary, or later authorize a separately researched instrument class. The extreme wealth aspiration supplies no justification.
5. **Unacceptable-loss policy:** after WP-07 produces defensible bands and uncertainty, approve the capital floor, maximum acceptable upper-bound ruin probability, drawdown posture, and whether any higher-risk mode may exist.

The first product-boundary decision is required before WP-10 because it controls the snapshot and horizon contracts. Decisions 2–5 may be deferred if the first release is explicitly tactical, unlevered, non-personalized, makes no allocation/wealth claim, and visibly reports that portfolio fit and investment quality were not evaluated. They become blocking before the corresponding wealth or portfolio layer can enter production.

## Stage-0 release conclusion

Architecture work may proceed after the listed tactical contracts are frozen. Runtime engines must not begin from the current prose alone. The first safe production target is a centralized, same-snapshot, fail-closed tactical decision-support subsystem using only truthfully supported OHLCV-derived evidence and unchanged hard authorization. Investment Quality and Portfolio Allocation remain explicit separate authorities, unavailable or research-only until their data, risk, and validation contracts are approved.

SignalForge must continue to make no claim that `BUY NOW`, confidence, planned reward/risk, current sizing, short-horizon outcomes, or the five-stage method establishes a probability of profit, acceptable risk of ruin, portfolio suitability, or superior compounding. Complexity earns production admission only through preregistered incremental evidence.
