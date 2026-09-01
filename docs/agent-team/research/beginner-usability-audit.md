# SignalForge Stage-0 Beginner Usability Audit

## Audit verdict

**Status: CONDITIONALLY READY FOR DASHBOARD DESIGN, NOT READY FOR BEGINNER ACCEPTANCE.**

The planned application can teach itself while it is being used, because the governing contracts already require an action-first summary, five plain-language stage questions, contextual explanations, technical evidence, and raw validation proof. The zero-data Dashboard also reserves the right surfaces: a prominent stock header, a dedicated **What Should I Do?** block, supporting evidence blocks, and a collapsed **Data Validation** drawer.

The current blueprint does not yet prove that flow. Its decision surface is secondary to browsing history on desktop, its mobile order places Recently Viewed before the decision, its stage language and action explanations are absent, and freshness, risk, next condition, help, and onboarding are only future concepts. This is appropriate for a layout-only stage, but the later Dashboard must satisfy the requirements below before it can be called self-teaching.

This audit treats the current markup and styles as layout evidence only. It does not assess trading correctness or infer behavior from empty placeholders. The fixed zero-data identity remains exactly `RandomSTOCKASAN FIXed example`.

## Governing teaching model

The default experience must preserve this order:

`Simple meaning → action → why → technical evidence → validation proof`

For a decision-focused screen, “simple meaning” and “action” should be presented together at the top: what SignalForge sees and what the user should do now. The UX must translate authoritative engine outputs, never recalculate them. Missing evidence remains missing; stale evidence remains stale; unsupported evidence must never be presented as bearish, zero, or inferred from an inadequate feed.

The user must also be told that SignalForge is decision-support software, does not place brokerage orders, and cannot guarantee an outcome. A valid `BUY NOW` state is permission under authoritative rules, not a prediction and not an instruction to ignore portfolio suitability.

## Evidence from the Stage-0 blueprint

### What already supports beginner use

- **What Should I Do?** is the clearest beginner-facing block title and provides a natural home for the primary action, reason, next condition, risk, and freshness.
- The stock header provides room for identity and refresh status, supporting immediate orientation.
- The main chart and specialist blocks are structurally separate from the action block, so they can remain supporting evidence instead of becoming the first interpretation task.
- **Data Validation · Prove What Was Pulled** is collapsed by default and promises snapshot, source, freshness, and input proof. This is the correct final disclosure layer.
- The blueprint explicitly states that it has no connected data, calculations, status, or provider requests. It therefore does not falsely present placeholder content as analysis.
- The mobile breakpoint creates a single column, which can support a deliberate reading sequence.

### Gaps and risks to resolve

- On desktop, Recently Viewed and What Should I Do? share a narrow left rail, while the empty chart dominates the page. The eventual decision must have stronger visual priority than navigation history or chart inspection.
- On mobile, Recently Viewed is ordered before What Should I Do?. A beginner should encounter identity, action, reason, risk, and freshness before navigation history or evidence panels.
- Text is extremely small in the blueprint (many labels are 7–9 px). Production content, controls, definitions, freshness, and warnings require readable mobile typography and adequate tap targets.
- Block numbers are implementation scaffolding, not user meaning. They should not compete visually with task labels in the production beginner view.
- **Pattern + Structure**, **Volume + Market Pressure**, **News + Catalysts**, and **Data Validation** do not yet explain their decision role. “Market pressure” is especially vulnerable to being mistaken for true order-flow evidence.
- No reserved content pattern yet proves the five required answers: what is happening, why it matters, what to do, what changes the status, and how trustworthy/fresh it is.
- No visible distinction yet separates a stock-level trade setup from a portfolio-level capital-allocation decision.

## Required first 10-second experience

Without opening anything, a first-time user must be able to identify:

1. **What am I viewing?** Stock/company identity or an explicit placeholder/unavailable state.
2. **What should I do now?** One authoritative action label with a short plain-English verb phrase.
3. **Is it ready or waiting?** Readable in words, not color alone.
4. **What is the main reason?** One sentence naming the current bottleneck without requiring jargon.
5. **What could prove this wrong or make acting unsafe?** The primary risk/invalidation, or an explicit statement that no valid risk boundary is available.
6. **How current is this?** Human-readable age and freshness state near the action.

Recommended Level-1 anatomy:

```text
WAIT — do not enter yet

Price is in a reasonable area, but the move does not yet have enough support.

Next: wait for stronger participation and acceptance above [level, when valid].
Risk: the setup weakens below [invalidation, when valid].
Updated 4 minutes ago · Fresh

[Why am I waiting?] [What would change this?]
```

Dynamic copy must be generated from authoritative explanation fields and validated levels. If a level or reason is unavailable, say so; do not fill the sentence with an invented value.

## Required first 30-second explanation flow

Opening **Why?** should expand in place, preserve the action summary, and reveal the five-stage journey as a short diagnostic path. The first failed, waiting, stale, or unavailable required stage is the visible bottleneck. Passed later stages must not imply that the bottleneck can be averaged away.

Each stage row needs:

- beginner question;
- word state such as `Favorable`, `Needs attention`, `Waiting`, `Blocked`, `Not available`, or `Stale`, mapped without changing the engine state;
- one-sentence reason;
- what would improve or worsen it;
- freshness/evidence-coverage cue;
- **Technical evidence** control.

The explanation should end with a clear route to **Data Validation**, not dump raw snapshot fields into the teaching layer.

## Action states and plain-English wording

Action labels must retain their authoritative names while adding an unambiguous instruction and limitation.

| Authoritative state | Beginner-facing interpretation | Required next-condition treatment |
| --- | --- | --- |
| `BUY NOW` | **Entry is permitted now under SignalForge's current rules.** Review the shown entry, stop, target, size, freshness, and portfolio fit before choosing to act. | State the valid entry zone, do-not-enter-above boundary, invalidation, and expiry/freshness. Never imply certainty or automatic execution. |
| `READY SOON` | **Prepare, but do not enter yet.** Most conditions are aligned; one or more required checks are still pending. | Name the exact blocking stage and observable condition still required. |
| `PULLBACK` | **Wait for a better price; do not chase.** The setup may remain valid, but current location is not acceptable for a new entry. | Show the valid area to reassess and what would invalidate the underlying setup. |
| `WAIT` | **Take no new action yet.** Required evidence is incomplete, mixed, stale, or not confirmed. | Distinguish “waiting for market behavior” from “waiting for data.” Name the next check. |
| `AVOID` | **Do not open a new position under the current conditions.** | Explain the decisive risk or failed requirement and what would require a fresh reassessment. Do not frame unsupported data as a negative signal. |
| `SELL-EXIT` | **Review the owned position for exit under the current position-management rules.** | State the breached protection/thesis condition and data freshness. Do not show this as advice for a stock the user does not own. |

System/data states such as `REFRESHING`, `PARTIAL`, `STALE`, `ERROR`, and `NOT_AVAILABLE` must be visually and verbally distinct from market judgments. For example, **“Decision unavailable — required execution data is stale”** is not `AVOID` and not `WAIT for price`.

Color may reinforce a state but must never be its only carrier. Avoid motivational or certainty language such as “safe,” “guaranteed,” “winner,” or “can’t miss.”

## Stage names versus beginner questions

Show the beginner question first and the professional stage name secondarily:

| Primary label | Secondary technical label | What the answer must teach |
| --- | --- | --- |
| **What kind of market is this?** | Environment | Whether the broader setting is favorable, difficult, or unclear, and why that context matters. |
| **Is the price in a sensible place?** | Location | Whether risk can be defined without chasing; not whether a low price is automatically good. |
| **Is there room for the move?** | Path | Whether nearby obstacles leave a realistic route to the destination. |
| **Is the move being supported?** | Confirmation | Whether available price/volume/participation evidence supports the move, and which order-flow evidence is unavailable. |
| **Can I act now, and where is the risk?** | Execution | Whether authoritative entry permission exists, with entry, stop, target, reward/risk, blockers, and freshness. |

The ordered stages should be presented as gates, not a five-part score. A simple connector can show progress, but it must support `PARTIAL`, `STALE`, `ERROR`, and `NOT_AVAILABLE` without suggesting completion.

## Risk, invalidation, and “what next”

Risk language must distinguish four concepts that beginners commonly conflate:

- **Stop:** the planned exit level for a valid trade.
- **Thesis invalidation:** the market condition that makes the original reason for the trade no longer valid.
- **Do-not-enter-above:** a chase boundary for opening a new position, not a profit target or stop.
- **Data invalidation:** stale, missing, mismatched, or insufficient evidence that prevents a current decision.

Every actionable or near-actionable state must answer:

- “What specific condition is SignalForge watching next?”
- “Will that condition be checked only after a completed bar or other defined update?”
- “What would make the setup worse or cancel it?”
- “When should I reassess?”

Use observable conditions rather than vague copy such as “wait for confirmation.” Prefer “Wait for a completed execution bar showing the required participation” with the technical measurement available one level deeper. If the producer does not supply a truthful reason, next condition, or invalidation, that is a contract blocker for the owning engine—not permission for the UI to infer one.

## Contextual glossary and help

- Define an acronym at its first visible use and provide the same canonical definition on tap, keyboard focus, and hover.
- Definitions must state what a measure means, why it appears here, and what it does not prove when misuse is likely.
- A glossary popover must not obscure the action or require navigation away from the current stock state; a full searchable glossary may exist as a secondary help surface.
- Terms such as POC, VAH, VAL, ATR, delta, absorption, relative volume, and GEX belong at Technical level unless needed to quote the precise blocker.
- Unsupported microstructure must say why it is unavailable. In particular, OHLCV-derived pressure must never be labeled true bid/ask delta, absorption, GEX, L2, or MBO.
- Help content must be static or consume already-loaded shared state; it must introduce no provider request or independent polling.

## Onboarding and replay

Provide a skippable, replayable, five-step tour:

1. SignalForge evaluates conditions; it does not predict every move or place orders.
2. The five gates and why a later-looking strength cannot cancel an earlier blocker.
3. Action states, including the difference between market waiting and unavailable/stale data.
4. Risk before reward: entry, stop, target, invalidation, do-not-chase, and portfolio fit.
5. Trust: freshness, missing evidence, and how to open Data Validation.

Use the fixed zero-data placeholder during the applicable Stage-0 contract. Do not fabricate a successful setup or use a real ticker as an implied endorsement. The tour must be dismissible at every step, preserve completion state locally where appropriate, and remain available from Help as **Replay introduction**. Contextual prompts should appear at the first relevant confusion point and should not repeatedly interrupt an experienced user.

## Mobile information hierarchy

Required production mobile order:

1. stock identity and compact freshness;
2. What Should I Do? action card;
3. reason, next condition, and risk/invalidation;
4. expandable five-stage explanation;
5. current price and decision levels;
6. chart;
7. supporting technical blocks;
8. Recently Viewed, peers, and news/catalysts;
9. Data Validation access, which should remain easy to reach even when its body is collapsed.

This requires changing the current blueprint order, where Recently Viewed precedes the decision on mobile. The primary action should fit without horizontal scrolling, and the first screen should not be consumed by navigation chrome. Interactive targets should be touch-sized; text conveying evidence or risk must not use blueprint-scale 7–9 px typography. Expanded disclosures need a clear close/collapse control, sensible focus movement, and no hover-only content.

## Avoiding information overload

- Show one final action and one primary reason at Level 1; do not lead with a matrix of indicators.
- Show the bottleneck first at Level 2, with passed stages compressed but available.
- Keep raw metrics, acronyms, snapshot IDs, providers, and bar proof at Levels 3–4.
- Do not repeat the same price, freshness, or warning in several competing cards. One owner supplies it; other blocks may reference it consistently.
- Related Companies and News + Catalysts are supporting context and must not visually compete with the action unless an approved engine explicitly makes them decision evidence.
- Preserve user disclosure choices within the session, while offering a clear reset to beginner view.
- Use whitespace, headings, and short sentences; do not solve complexity by hiding missing evidence or risk.

## Separate wealth decisions from trade timing

The five-stage method answers a stock-timing question: **“Is this setup executable now?”** It does not answer the portfolio question: **“Should this use my capital, at this size, versus my other choices and long-term plan?”** These must be separate permissions.

The Dashboard should label them distinctly:

- **Trade setup:** environment, location, path, confirmation, execution, entry/stop/target, and timing freshness.
- **Portfolio fit / capital allocation:** existing exposure, concentration/correlation, cash reserve, drawdown state, opportunity cost, intended holding horizon, liquidity needs, and position-size permission.

Until an authoritative portfolio layer exists, the UI must say **“Portfolio fit not evaluated”** rather than treating a valid stock-level `BUY NOW` as allocation approval. Likewise, long-horizon views should not use intraday action language as a recommendation to churn a strong holding. Explain that execution timing may improve an entry while the wealth decision may favor holding, using cash, selecting another opportunity, or taking no position.

Wealth education should foreground survival, drawdown, risk of ruin, realistic costs/taxes/slippage, and comparison with simpler benchmarks. It must not promise extreme compounding or turn an aspirational wealth target into justification for concentration, leverage, or frequent trading.

## Required producer-to-UX explanation contract

The later Dashboard cannot satisfy this audit through copy alone unless the centralized calculated master state supplies, for the final action and each stage:

- authoritative state and whether it affects execution;
- plain-language-safe reason code or structured reason;
- current blocker and next observable condition;
- improvement and worsening/invalidation conditions when known;
- relevant validated levels and their roles;
- evidence coverage, missing inputs, and unavailable evidence;
- source/calculation timestamps and freshness;
- active symbol and snapshot ID;
- permission proof for any actionable state.

The UI may map stable reason codes to reviewed teaching copy. It must not derive a new trading state, duplicate a threshold, invent a level, or guess why a stage failed. Missing fields should produce an explicit incomplete explanation and a blocker for the owning work package.

## Beginner acceptance checklist for the later Dashboard agent

All applicable items are release gates. Test with a participant who knows stock, buy, sell, price, gain, and loss, but none of the named professional terminology.

### Ten-second comprehension

- [ ] Within 10 seconds, the participant correctly identifies the stock/view or explicit placeholder/unavailable identity.
- [ ] Within 10 seconds, the participant states the current action without relying on color.
- [ ] The participant can tell whether the setup is ready, waiting on market behavior, blocked by risk, or unavailable because of data.
- [ ] The participant can repeat the main reason in ordinary language.
- [ ] The participant can locate the major risk/invalidation, or sees that no valid boundary is available.
- [ ] The participant can tell when the decision was calculated and whether its supporting data is fresh, aging, stale, partial, refreshing, or errored.

### Thirty-second explanation

- [ ] Within 30 seconds and at most one explanation action, the participant identifies the blocking stage.
- [ ] Each stage leads with its beginner question; the professional name remains visible secondarily.
- [ ] The participant can explain what the blocking stage means without defining POC, VAH, VAL, ATR, delta, absorption, relative volume, or GEX.
- [ ] The participant can state what observable condition SignalForge is waiting for and when it can be reassessed.
- [ ] The participant can state what would worsen or invalidate the setup.
- [ ] Technical evidence is reachable on demand without displacing or contradicting the simple explanation.
- [ ] Raw provenance, timeframe/bar proof, timestamps, missing inputs, evidence coverage, and snapshot ID are reachable through Data Validation.

### Action and safety truth

- [ ] Every action state has a plain-English instruction and does not imply certainty, auto-trading, or guaranteed profit.
- [ ] `BUY NOW` appears only with authoritative permission proof and shows entry, stop, target, reward/risk, chase boundary, and freshness when supplied by the authoritative state.
- [ ] `READY SOON`, `PULLBACK`, and `WAIT` name the exact next condition rather than merely repeating the label.
- [ ] `SELL-EXIT` is clearly tied to an owned position and its authoritative management state.
- [ ] `AVOID` is not used as a substitute for missing, unsupported, stale, partial, or errored data.
- [ ] Market states and system/data states are visually and verbally distinct.
- [ ] No high score or favorable stage presentation suggests that a required failed gate can be averaged away.
- [ ] The UX does not calculate states, duplicate thresholds, weaken guardrails, or fabricate explanations/levels.

### Risk and next condition

- [ ] Stop, thesis invalidation, do-not-enter-above, and data invalidation are labeled as different concepts.
- [ ] Risks appear before optional technical detail and remain visible when the explanation is collapsed.
- [ ] A completed-bar or freshness dependency is described in plain language when it controls the next decision.
- [ ] When an invalidation or next condition is unavailable, the interface says so rather than inserting a generic or inferred one.

### Terminology, missing data, and trust

- [ ] Every acronym has an accessible definition on tap, focus, and hover, unless fully expanded nearby.
- [ ] Definitions explain meaning and important limitations without changing the technical concept.
- [ ] No technical acronym is required to understand the basic action, reason, next condition, risk, or freshness.
- [ ] Missing is never rendered as zero; unsupported is never rendered as negative/bearish; stale is never rendered as current; no sample is never rendered as 0%.
- [ ] Unavailable order-flow evidence names the missing feed requirement and is not approximated from OHLCV.
- [ ] “Market pressure” clearly identifies whether it is an OHLCV inference and never masquerades as bid/ask aggression.
- [ ] Every visible stock-dependent block agrees on symbol and active snapshot or explicitly withholds mismatched content.
- [ ] Chart timeframe controls are described as visual only and do not imply that they change the decision datasets.

### Onboarding and contextual teaching

- [ ] Onboarding is short, skippable at every step, replayable from Help, and specific to using SignalForge.
- [ ] Onboarding covers decision support/no auto-trading, the five gates, action states, risk, missing/stale data, and Data Validation.
- [ ] Contextual **Why?**, **What needs to happen next?**, **Why blocked?**, and freshness help appear at the relevant decision surface.
- [ ] Help and glossary content add no provider requests, independent API cadence, or polling.
- [ ] Examples use the required fixed placeholder during the zero-data stage and do not fabricate market evidence.

### Mobile and accessibility hierarchy

- [ ] On mobile, identity and What Should I Do? precede Recently Viewed, chart, peers, news, and specialist evidence blocks.
- [ ] Action, main reason, next condition, risk, and freshness are understandable in the first mobile viewport or with minimal vertical movement.
- [ ] No essential content requires horizontal scrolling or hover.
- [ ] Text, contrast, focus states, and touch targets are production-readable; blueprint-scale microtext is not used for decisions or warnings.
- [ ] State is not communicated by color alone, and disclosures work with keyboard and assistive technology semantics.
- [ ] Expanded explanations preserve context and have predictable focus and collapse behavior.

### Information load and capital horizon

- [ ] Level 1 shows one authoritative action and one primary reason rather than an indicator wall.
- [ ] Level 2 prioritizes the bottleneck; Levels 3–4 contain specialist metrics and raw proof.
- [ ] Recently Viewed, peers, and news do not visually outrank the decision.
- [ ] Duplicate information does not create conflicting freshness, price, risk, or action claims.
- [ ] Trade setup permission is visibly separate from portfolio/capital-allocation permission.
- [ ] If no authoritative portfolio layer exists, the interface states **Portfolio fit not evaluated**.
- [ ] Longer-horizon education distinguishes entry timing from holding horizon, allocation, concentration, drawdown, cash, and opportunity cost.
- [ ] No wealth language promises extreme returns or encourages leverage, concentration, or turnover as a shortcut to compounding.

## Final recommendation

Proceed with the planned architecture only if WP-75 turns these requirements into stable producer/consumer contracts before Dashboard wording and interaction hierarchy are frozen, and WP-85 implements and tests them before final adversarial QA. The highest-priority layout corrections are to elevate **What Should I Do?** above Recently Viewed and chart content, make the first viewport answer action/reason/risk/freshness, and require structured next-condition and explanation data from the centralized master state. With those conditions met, SignalForge can teach the method contextually without sacrificing technical rigor or trading truth.
