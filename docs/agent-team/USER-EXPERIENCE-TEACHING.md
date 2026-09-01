# SignalForge Beginner Experience + Teaching Contract

## Purpose

SignalForge may contain sophisticated market logic, but the product must be understandable to a first-time user who does not know professional trading terminology.

This contract is mandatory for Dashboard, onboarding, help, education, explanation, and usability work.

The goal is not to remove technical rigor. The goal is to separate **what the user needs to understand now** from **the deeper evidence an advanced user may inspect**.

SignalForge therefore uses progressive disclosure:

`Simple meaning → What should I do? → Why? → Technical evidence → Raw validation proof`

The trading engine remains authoritative. The UX/Teaching layer may translate and explain its outputs, but it may not change calculations, thresholds, evidence, provider data, or BUY authorization.

---

## 1. Beginner-first language model

Every major technical stage must have a plain-language interpretation.

| Technical stage | Beginner question | Beginner meaning |
| --- | --- | --- |
| Environment | What kind of market is this right now? | Is the overall situation favorable, difficult, or unclear? |
| Location | Is price in a good place to act? | Is the stock near an area where risk can be defined instead of chasing? |
| Path | Is there room for the move? | Are major obstacles directly in the way before the expected target? |
| Confirmation | Is the move actually being supported? | Are price, volume, participation, and acceptance behaving the way the setup needs? |
| Execution | Can I act now, and what is the risk? | Is there a valid entry, stop, target, and risk/reward under the production rules? |

The professional labels remain available, but they must not be the only explanation visible to a normal user.

---

## 2. Every important result answers five questions

For every stage or important Dashboard result, the user should be able to answer these five questions without reading source code or knowing trading jargon:

1. **What is happening?**
2. **Why does it matter?**
3. **What should I do right now?**
4. **What would need to change for the status to improve or worsen?**
5. **How fresh and trustworthy is the data behind this?**

If the UI exposes a technical value without helping answer those questions, the UX agent must flag it as incomplete.

---

## 3. Action-first presentation

The default visual hierarchy should be:

1. action/status;
2. one-sentence explanation;
3. next condition to watch;
4. risk/invalidation;
5. optional deeper evidence.

Example:

```text
WAIT FOR CONFIRMATION

Price is in a reasonable area, but participation has not confirmed the move yet.

Watch for:
• stronger volume participation
• acceptance above the nearby level

Risk changes if:
• price loses the defined structural support

[Why?] [Show technical evidence]
```

Do not lead with a wall of indicators or acronyms.

---

## 4. Progressive disclosure levels

### Level 1 — Simple

Default for a new user.

Shows:
- final action;
- plain-English reason;
- next thing to watch;
- risk/invalidation;
- data freshness.

### Level 2 — Explain

Opened with `Why?`, `How was this decided?`, or equivalent.

Shows:
- Environment → Location → Path → Confirmation → Execution;
- which stage is blocking progress;
- plain-English evidence for each stage;
- what would move a stage from WAIT to PASS or PASS to FAIL.

### Level 3 — Technical

For advanced users.

May show:
- POC / VAH / VAL;
- premium / discount references;
- ATR-normalized distances;
- relative volume;
- participation metrics;
- structural pivots;
- model/evidence details.

Every acronym must have a tap/hover definition unless it is already fully written out nearby.

### Level 4 — Validation

Block 09 / audit drawer.

Shows:
- raw source/provenance;
- dataset/timeframe/bar proof;
- source timestamp;
- calculation timestamp;
- freshness;
- missing data;
- unsupported evidence;
- snapshot ID.

This is the trust layer, not the normal beginner view.

---

## 5. Terminology rules

Technical language may not disappear because advanced users need it, but terminology must be paired with meaning.

Examples:

- `POC` → `Point of Control — the price area where the most volume was accepted in the measured range.`
- `VAH` → `Value Area High — upper boundary of the main accepted-value zone.`
- `VAL` → `Value Area Low — lower boundary of the main accepted-value zone.`
- `Premium` → `Higher part of an established range; often a less attractive place to chase a new long entry.`
- `Discount` → `Lower part of an established range; can provide better location when the broader bullish thesis agrees.`
- `Relative Volume` → `How active current trading volume is compared with what is normal for this stock/time.`
- `Absorption` → only defined/displayed as real order-flow evidence when the required feed exists; otherwise `NOT AVAILABLE`.
- `GEX / Gamma Exposure` → context from options positioning; never described as a guaranteed support/resistance signal.

Definitions must explain both **what the term means** and **what it does NOT prove** when that distinction matters.

---

## 6. Missing-data UX

Never leave a beginner to interpret an empty number or dash without context.

Bad:

`Delta: —`

Good:

`Order-flow delta: Not available`
`SignalForge does not currently have the bid/ask trade feed required to calculate this correctly.`

Bad:

`Probability: 0%`

when there are no observations.

Good:

`Probability: Not established yet`
`More validated outcomes are required before SignalForge can estimate this.`

Missing is not zero. Unsupported is not negative. Stale is not current.

---

## 7. Beginner onboarding

The app should eventually include a short optional onboarding path that teaches the product, not generic stock trading.

Recommended sequence:

1. **SignalForge does not predict every move.** It evaluates conditions and waits for alignment.
2. **The five-stage method:** Environment → Location → Path → Confirmation → Execution.
3. **The action states:** BUY NOW / READY SOON / WAIT / AVOID / SELL-EXIT and what each means.
4. **Risk before reward:** entry, stop, target, do-not-chase, and why Execution can remain locked.
5. **How to verify the app:** open Data Validation to see where the displayed information came from.

Onboarding must be skippable and replayable.

---

## 8. Contextual teaching

Teaching should occur where confusion happens.

Preferred patterns:
- `Why?` under an action;
- tap/hover glossary for acronyms;
- `What needs to happen next?` for WAIT states;
- `Why is this blocked?` for Execution;
- `How fresh is this?` linked to validation proof;
- small examples based on the currently loaded state, without fabricating data.

Avoid forcing the user to leave the decision page and read a long manual before understanding the current status.

---

## 9. The beginner comprehension test

Before release, the Usability/Teaching QA agent must evaluate the product as if the user knows basic concepts such as stock price and buying/selling but does not know auction-market or order-flow terminology.

For the primary Dashboard, a new user should be able to determine within roughly 10 seconds:

- what stock/view they are looking at;
- what SignalForge currently recommends;
- whether the setup is ready or waiting;
- the main reason for that status;
- the major risk/invalidation when one exists;
- when the displayed information was last updated.

Within roughly 30 seconds, using `Why?`/explanation controls, they should be able to understand:

- which of the five method stages is blocking progress;
- what that stage means in plain English;
- what condition SignalForge is waiting for;
- how to open technical evidence if they want it.

These are usability targets, not trading-performance claims.

---

## 10. UX agent authority and limits

The UX/Teaching agent MAY:

- rewrite labels and explanations for clarity;
- propose simpler information hierarchy;
- create contextual help/onboarding/glossary surfaces;
- remove duplicated visual information;
- request that a producing engine expose a missing explanation field through the integration agent;
- reject a Dashboard implementation that requires unexplained jargon to operate.

The UX/Teaching agent MUST NOT:

- change trading calculations;
- change BUY thresholds;
- reinterpret FAIL as PASS or PASS as FAIL;
- invent evidence that is not present;
- create provider requests;
- hide stale/missing data to make the interface look cleaner;
- rename technical concepts in a way that changes their meaning.

If understandable UX requires a data/engine contract change, the agent raises a blocker to the integration agent and the owning work package makes that change.

---

## 11. Definition of done

A feature is not user-ready only because its calculation is correct.

It is user-ready when:

1. calculation/output is correct;
2. plain-language meaning exists;
3. action/next-step meaning exists when relevant;
4. terminology is explainable in context;
5. missing/stale states are understandable;
6. deeper technical evidence remains available;
7. Data Validation can prove the information;
8. beginner comprehension tests pass;
9. the UX layer did not change trading truth.
