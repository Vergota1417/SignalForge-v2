# SignalForge Master Rebuild Architecture

## Purpose

This document defines the target architecture for the SignalForge rebuild so multiple agents can work in parallel without creating multiple interpretations of the product.

The methodology is ordered and gated:

`Environment → Location → Path → Confirmation → Execution`

The system is not a weighted soup of unrelated indicators. Each stage answers a different question, exposes its own evidence, and passes a structured result to the next stage.

The Dashboard is intentionally presentation-only. It renders one coherent master state for the stock the user opened.

---

## 1. Core runtime model

```text
External providers
      ↓
Provider gateway / quota policy
      ↓
Raw persistent market cache
      ↓
MASTER SYMBOL SNAPSHOT
      ├─ identity / metadata
      ├─ analysis dataset reference
      ├─ execution dataset reference
      ├─ benchmark dataset reference
      ├─ provenance
      ├─ freshness
      └─ missing-input map
      ↓
Environment Engine
      ↓
Location Engine
      ↓
Path Engine
      ↓
Confirmation Engine
      ↓
Execution Engine
      ↓
CALCULATED MASTER STATE
      ├─ final action state
      ├─ stage states
      ├─ stage evidence
      ├─ decision levels
      ├─ validation proof
      └─ timestamps
      ↓
One browser-facing symbol payload
      ↓
Dashboard blocks
```

The browser must not need to orchestrate multiple independent analysis requests to assemble one stock view.

---

## 2. Master symbol identity

Every user-opened stock view is bound to one canonical symbol context.

The current fixed zero-data placeholder is:

`RandomSTOCKASAN FIXed example`

When stock selection is later connected, a successful selection creates one canonical symbol identity and one active snapshot ID. Every visible block must show data from that same active snapshot or explicitly show that its data is not yet ready.

A block must never silently retain the previous stock's values after the active symbol changes.

---

## 3. Dataset roles

The master-data work package owns exact intervals and freshness rules. Other agents consume these roles rather than inventing their own market-data requests.

### ANALYSIS

Purpose: higher-timeframe trend, momentum, structure, probability inputs, risk/reward structure, and other slow-changing analysis.

### EXECUTION

Purpose: completed intraday bars used for participation, opening structure, room-to-run, activity rhythm, and other execution context.

### BENCHMARK

Purpose: benchmark/regime/relative-strength context.

### CHART

Purpose: visualization only.

A user changing chart timeframe must not mutate the datasets used by production decision calculations.

---

## 4. Method engines

### 4.1 Environment

Question:

> What kind of environment is this stock attempting to trade in?

Expected result shape:

```text
environment
  state
  bias
  regime
  volatility
  marketAlignment
  sectorAlignment
  participationContext
  confidence
  evidenceCoverage
  missingInputs
  calculatedAt
  affectsExecution
```

Environment is context. It does not bypass downstream gates.

### 4.2 Location

Question:

> Is price currently located in a defensible place relative to structure and auction references?

Expected evidence may include, when available and validated:

- current structural location;
- support/resistance;
- recent pivots;
- POC / VAH / VAL;
- premium/discount context;
- range position;
- ATR-normalized distance;
- distance to invalidation;
- distance to destination.

Expected result shape:

```text
location
  state
  quality
  currentPrice
  structuralZone
  support
  resistance
  auctionReferences
  distanceMetrics
  confidence
  evidenceCoverage
  missingInputs
  calculatedAt
  affectsExecution
```

### 4.3 Path

Question:

> Is there a realistic path from current location to the intended destination?

Expected evidence may include:

- intermediate resistance/support;
- opening range;
- session-range consumption;
- ATR usage;
- volume nodes;
- recent highs/lows;
- destination distance;
- room-to-run;
- known obstacles.

Expected result shape:

```text
path
  state
  destination
  obstacles[]
  roomAvailable
  roomRequired
  sessionRangeUsage
  quality
  confidence
  evidenceCoverage
  missingInputs
  calculatedAt
  affectsExecution
```

### 4.4 Confirmation

Question:

> Is real participation/acceptance confirming the proposed move?

With current feeds, use only evidence actually available, such as:

- relative volume;
- completed-bar price expansion;
- momentum;
- participation;
- acceptance/rejection;
- opening-range behavior;
- activity rhythm.

Do not synthesize footprint, bid/ask delta, absorption, GEX, L2, or MBO when the required feed is absent.

Expected result shape:

```text
confirmation
  state
  priceAcceptance
  participation
  relativeVolume
  momentum
  availableEvidence
  unavailableEvidence
  confidence
  evidenceCoverage
  missingInputs
  calculatedAt
  freshness
  affectsExecution
```

### 4.5 Execution

Question:

> Is the setup executable now under authoritative production risk rules?

Execution consumes the prior stages plus authoritative production guardrails.

Expected evidence includes:

- entry zone;
- do-not-enter-above;
- thesis stop;
- target(s);
- reward/risk;
- stop quality;
- overextension;
- completed execution confirmation;
- hard BUY authorization.

Expected result shape:

```text
execution
  state
  permission
  entry
  stop
  targets
  rewardRisk
  stopQuality
  blockers[]
  hardAuthorization
  calculatedAt
  freshness
```

Execution cannot weaken or duplicate `src/hard-guardrails.js`.

---

## 5. Final action state

The method is a gated pipeline.

A high score in one stage cannot mathematically compensate for a failed required stage.

Example:

```text
Environment    PASS
Location       PASS
Path           PASS
Confirmation   WAIT
Execution      LOCKED

Final: READY SOON / WAIT
```

Do not average these into a misleading single score that implies execution permission.

A summary score may be used for ranking/discovery only if it remains explicitly separate from production trade permission.

---

## 6. Dashboard blueprint blocks

The zero-data Dashboard currently defines the following surfaces.

### Block 00 — Stock Header

Future purpose:

- selected stock identity;
- company/listing metadata when validated;
- master refresh status;
- active snapshot status.

No independent provider request.

### Block 01 — Recently Viewed

Future purpose:

- local/session navigation history;
- no market-data acquisition merely to render the list.

### Block 02 — What Should I Do?

Future purpose:

- final action state;
- Environment/Location/Path/Confirmation/Execution stage summary;
- bottleneck/blocker;
- next required change.

Consumes calculated master state only.

### Block 03 — Main Chart

Future purpose:

- user-selected visualization timeframe;
- decision levels and validated overlays derived from shared state;
- chart timeframe never changes canonical decision datasets.

### Block 04 — Current Price + Levels

Future purpose:

- current/master price;
- entry zone;
- stop;
- target(s);
- structural distances;
- freshness.

### Block 05 — Pattern + Structure

Future purpose:

- validated structure/pattern context;
- auction references;
- no independent polling or market-data fallback cascade.

### Block 06 — Volume + Market Pressure

Future purpose:

- loaded volume;
- relative volume/activity;
- OHLCV-derived pressure when that is all the data supports;
- never label OHLCV inference as true bid/ask aggression.

### Block 07 — Related Companies

Future purpose:

- peers/sector/industry relationships only when backed by a validated source;
- no random ticker substitution when peer data is missing.

### Block 08 — News + Catalysts

Future purpose:

- validated recent news/catalysts;
- explicit unavailable state when no source is connected;
- news cannot become hidden trading evidence unless an approved model explicitly owns that use.

### Block 09 — Data Validation

Future purpose:

- collapsed audit drawer proving what was actually pulled/calculated;
- active snapshot ID;
- provider/source;
- timestamps;
- freshness;
- dataset/bar proof;
- evidence coverage;
- missing/unavailable inputs;
- per-block validation state.

This block is the user's trust layer for the visual page above.

---

## 7. Refresh architecture

The user should be able to understand when the visible state was last refreshed and when it is expected to refresh again.

The master state, not each block, owns freshness.

Expected top-level refresh metadata:

```text
snapshotId
symbol
lastProviderPullAt
lastCalculatedAt
nextEligibleRefreshAt
ageMs
state = FRESH | AGING | STALE | REFRESHING | PARTIAL | ERROR
providerProvenance
```

Blocks may have slower sub-data, such as metadata or evidence outcomes, but that difference must be visible in validation proof rather than hidden.

---

## 8. Missing data policy

Missing is not zero.

Unsupported is not bearish.

Stale is not current.

No sample is not 0%.

If a required input is missing, the engine must expose that fact and either degrade confidence or fail closed according to the work package contract.

---

## 9. Provider policy

The frontend never needs another API key for a new visual block.

New blocks consume existing centralized state.

Provider changes belong only to provider/master-data work packages and must specify:

- provider purpose;
- expected request rate;
- cache policy;
- fallback policy;
- daily/minute budget impact;
- failure semantics;
- provenance semantics.

Twelve Data minute/day guards and other provider reliability protections must survive the rebuild.

---

## 10. Integration definition of done

The rebuild is not complete merely because all modules exist.

It is complete only when:

1. one selected symbol resolves to one coherent master snapshot;
2. all five method engines consume that snapshot contract;
3. Dashboard blocks consume calculated state without independent provider traffic;
4. all visible blocks agree on symbol and snapshot provenance;
5. chart timeframe is decoupled from decision timeframe;
6. Block 09 can prove the inputs and freshness for the upper page;
7. unavailable data is explicit;
8. production BUY guardrails remain authoritative and fail closed;
9. provider budgets remain protected;
10. full baseline and production reliability suites are green.
