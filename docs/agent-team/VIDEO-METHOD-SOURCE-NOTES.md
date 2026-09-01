# Video Method Source Notes — Research Input

## Purpose

This file is a distilled implementation-oriented record of the trading methodology extracted from the long-form source material previously reviewed for SignalForge. It is intentionally **not** a substitute for the original source and it must not be treated as proof that any technique is profitable for U.S. equities.

The Stage-0 methodology auditor uses these notes to determine what is universal, what requires stock-market adaptation, what needs additional data, and what should remain research-only.

## Core operating sequence

The source repeatedly describes an auction-based workflow in this order:

`Context / Environment → Location → Participation / Confirmation → Execution`

SignalForge has introduced `Path` as an explicit gate between Location and Confirmation so the system must also prove there is realistic room to the intended destination.

Important rule: the stages are conditional gates, not an average score. A later stage cannot compensate mathematically for a failed required stage.

## Environment / Context

Key ideas extracted from the source:

- classify balance versus imbalance;
- identify bullish, bearish, or sideways/consolidating structure;
- use multiple timeframes rather than one isolated chart;
- the source explicitly discusses 4-hour, 1-hour, 15-minute, and 5-minute structure in its futures workflow;
- understand volatility/regime rather than assuming fixed behavior;
- no-trade conditions are part of the edge;
- examples of degraded/no-trade structure include repeated failed breakouts, overlapping structure with little expansion, repeated return to value, poor higher-timeframe alignment, no clean location, and inability to define a continuation path;
- gamma/GEX is treated as an additional context lens when legitimate data exists, never as a stand-alone trade signal;
- when gamma context and actual price/order-flow behavior disagree, the source prioritizes the tape/price behavior.

## Location

Key ideas:

- location comes before entry signal;
- prior highs/lows and established swing ranges matter;
- fixed/range volume profile is used to reason about accepted value and rejected/thin areas;
- POC / VAH / VAL are meaningful only when calculated from data that actually supports the chosen methodology;
- premium/discount is a location filter, not a predictor;
- the source uses Fibonacci references 0.50, 0.62, 0.705, 0.788, 0.886, and 1.10 in its own workflow;
- the 0.705–0.886 area is described as a preferred responsive area only when higher-timeframe context agrees;
- higher-volume areas are associated with prior agreement/acceptance; lower-volume areas can represent thinner participation, rejection, or faster movement;
- none of those references are automatic support/resistance or automatic entries.

## Path

SignalForge makes Path explicit even though the source often discusses it through structure, sessions, expected expansion, and target references.

Path should ask whether the proposed move has realistic room before encountering meaningful obstacles. Potential inputs include:

- prior highs/lows;
- value/volume nodes;
- support/resistance;
- opening/session ranges;
- ATR or volatility-normalized distance;
- range already consumed;
- destination distance;
- intermediate barriers;
- expected expansion/exhaustion behavior when statistically validated for the asset being traded.

The source includes an NQ-specific volatility/session model. It uses Asia/London/New York relationships and historical NQ statistics. That implementation **must not be copied directly into individual U.S. stocks** without separate validation.

## Confirmation / Participation

The source's central order-flow concept is `effort versus result`.

Important distinctions:

- a bullish candle only proves the close was higher; it does not prove who was aggressive inside the candle;
- true footprint/order-flow data can expose bid/ask executions, delta, imbalances, participation, and where size traded;
- aggressive buying that successfully advances price differs from aggressive buying that fails to move price;
- aggression that fails to produce expected price progress can be evidence of absorption;
- absorption is evidence, not an automatic reversal signal;
- absorption matters more at meaningful location than randomly in the middle of balance/noise;
- confirmation after absorption may include continuation failure, failure to gain acceptance, pressure shift, and legitimate delta/order-flow change;
- location without participation is not a complete trade thesis.

## Data truthfulness constraints

SignalForge must not fabricate or relabel OHLCV inference as any of the following when the required feed is absent:

- true bid/ask footprint;
- executed bid/ask delta;
- stacked order-flow imbalance;
- true absorption;
- resting liquidity / Level 2;
- MBO / L3;
- GEX / options-positioning measures without an appropriate options data source.

Unavailable evidence must be explicitly `NOT_AVAILABLE`/missing and must reduce evidence coverage or keep the affected gate locked according to the final contract.

## Futures-specific material requiring adaptation

The source is heavily influenced by futures/index trading. The following are **not automatically transferable** to single-stock SignalForge logic:

- NQ-only volatility projections;
- Asia/London/New York session rotation model;
- fixed statistical deviations derived from historical NQ data;
- futures-specific footprint/liquidity behavior;
- index/futures gamma interpretation;
- tool/platform-specific labels or constants.

For equities, an adaptation must either be independently validated on stocks or remain research-only/unavailable.

## Gamma/GEX notes

When legitimate options data exists, the source discusses:

- positive versus negative gamma environment;
- call wall;
- put wall;
- gamma flip / HVL-type transition reference;
- possible compression versus expansion context;
- real-time behavior at the level determines whether it behaves as a useful reference.

Gamma is context, not authorization. It must never override price action, location, participation, or the production execution guardrails.

## Strategy objective reminder

The source emphasizes survivability and avoiding low-quality environments rather than forcing a trade every session. SignalForge's wealth-strategy review must therefore distinguish:

- finding a technically executable opportunity;
- deciding whether that opportunity deserves portfolio capital;
- choosing position size;
- choosing holding horizon;
- deciding whether a simpler long-term strategy has better probability-weighted outcomes.

## Auditor deliverable

The Stage-0 methodology auditor must classify every material concept it retains as one of:

- `EXACT_UNIVERSAL` — can be represented directly without asset-specific assumptions;
- `STOCK_ADAPTATION_REQUIRED` — concept may transfer but requires equity-specific definition/validation;
- `DATA_REQUIRED` — method is valid only if a legitimate additional feed exists;
- `RESEARCH_ONLY` — interesting hypothesis, not production evidence;
- `REJECT_FOR_STOCKS` — should not be copied into the stock application.

The auditor must not modify runtime code.