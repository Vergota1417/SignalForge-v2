# SignalForge

SignalForge is a Cloudflare Worker + D1 + installable PWA that continuously looks for U.S. stock opportunities, turns market data into an explainable decision state, records evidence about those decisions, and alerts the user when an actionable state changes.

SignalForge is **decision-support software**. It does not place brokerage orders. The user remains responsible for deciding whether to act and for recording real purchases and sales in the app.

This README is the project's **current architecture and change-control authority**. Read it before adding or changing a model, API call, scheduler lane, D1 table, UI module, trading rule, provider request, background timer, or production test.

---

## 1. What SignalForge is trying to do

The production path is intentionally layered:

```text
U.S. stock universe
      ↓
Discovery catalog / rolling statistics
      ↓
Tiered Radar scan
HOT / ACTIVE / EXPLORE
      ↓
Early-movement detection
      ↓
Smart Screener promotion
      ↓
Higher-timeframe analysis
      ↓
Completed 15-minute execution + participation confirmation
      ↓
Hard BUY authorization
      ↓
BUY NOW / READY SOON / PULLBACK / WAIT / AVOID / SELL-EXIT
      ↓
Trade plan + push alert
      ↓
User manually records a real purchase
      ↓
Owned-position monitoring / partial profit / protection / exit guidance
```

A separate evidence path learns without silently changing production:

```text
Radar + analysis observations
      ↓
Independent setup / decision episodes
      ↓
Forward outcomes
1 / 3 / 5 / 10 / 20 sessions
      ↓
Evaluation / calibration / error analysis
      ↓
Optimizer + challenger research
      ↓
Forward shadow validation
      ↓
Human review
      ↓
Only then may a production-rule change be proposed
```

**Research can challenge production. Research cannot automatically become production.**

---

## 2. Source-of-truth hierarchy

Different files own different kinds of truth. Do not duplicate an authoritative rule in a convenient second location.

| Source | Authority |
| --- | --- |
| `README.md` | Current architecture, ownership, guardrails, change process, and known limitations. |
| `src/hard-guardrails.js` | Non-negotiable production BUY authorization policy. |
| `src/scanner-schedule.js` | Market schedule policy and coverage math. |
| `src/scheduler.js` | Sole production scheduled-work orchestrator. |
| `public/api-request-policy.js` | Browser/PWA safe-read request windows. |
| `scripts/suite-manifest.mjs` | Classification of baseline, production-critical, and historical/disabled tests. |
| `scripts/run-test-suite.mjs` | Test orchestration and automatic JavaScript syntax discovery. |
| `public/build-info.js` | Runtime/release identity shown by the app. |
| `public/service-worker.js` | Installed PWA shell and API snapshot cache behavior. |
| `wrangler.jsonc` | Cloudflare entry point, assets directory, D1 binding, cron wakeup, environment configuration. |
| `SIGNALFORGE_BUILD_LEDGER.md` | Historical chronology only. It is not the current architecture authority. |

A safety-critical rule should have **one owner**. Other modules consume, persist, explain, or test that rule; they do not redefine it.

---

## 3. Non-negotiable production trading policy

### 3.1 BUY NOW is permission, not a score

A high score, attractive pattern, favorable research result, or UI label is not sufficient to authorize a new entry.

The production BUY path must fail closed unless the shared hard authorization passes. Current non-negotiable requirements include:

- reward/risk of at least **1.80:1**;
- a defensible target;
- intact thesis / stop structure;
- no prohibited overextension or chasing;
- required higher-timeframe gates cleared;
- completed 15-minute execution confirmation;
- completed 15-minute participation confirmation;
- confirmation freshness;
- valid current price location.

The authoritative production R/R floor is `MIN_BUY_REWARD_RISK` in `src/hard-guardrails.js`.

A softer scanner or research threshold may exist for finding something worth investigating. It must never be confused with production BUY permission.

### 3.2 Five-minute pulses cannot manufacture confirmation

A five-minute price pulse may refresh:

- current price;
- entry location;
- current R/R;
- thesis integrity;
- overextension;
- owned-position management state.

It must **not** pretend that a new completed 15-minute participation check occurred.

### 3.3 Downstream consumers fail closed

A stale or legacy `status === 'BUY NOW'` string is not enough by itself. User-facing trade planning and paper simulation require hard-authorization proof as well.

### 3.4 SignalForge does not auto-trade

SignalForge does not place brokerage orders. The user records purchases/sales manually, and the owned-position subsystem then monitors those recorded holdings.

---

## 4. Shadow and experimental policy

Pattern context, session range, opening range, activity rhythm, challengers, and other experimental models remain separate from production authorization until independently validated.

A shadow feature may:

- calculate;
- display;
- record observations;
- measure outcomes;
- compare cohorts;
- nominate a future rule for review.

A shadow feature may **not** silently create, block, upgrade, or downgrade `BUY NOW`.

### Pattern-network quarantine

The old network-enabled Structure + Patterns UI is intentionally disabled after it caused request amplification. The zero-network chart bridge may remain, but the old polling/retry layer must not be re-enabled.

Any future Pattern UI must be rebuilt as a **passive consumer of already-loaded/shared data**. It must not create independent polling, retry storms, or 3M/6M/1Y cache-only fallback cascades.

Historical Stage 14.30/14.31 regressions are explicitly classified as historical/disabled and are not required production behavior.

---

## 5. Runtime architecture

```text
Phone / Browser
  └─ public/ PWA
       ├─ UI modules
       ├─ public/api-request-policy.js
       ├─ public/api-request-coordinator.js
       └─ public/service-worker.js
                  ↓ /api/*
Cloudflare Worker
  └─ src/entry.js             ← Wrangler production entry
       ├─ fetch extensions / health wrapper
       └─ src/scheduler.js     ← sole production cron owner
             ↓
       src/index.js            ← main API router
             ↓
       domain modules
       ├─ discovery / radar / screener
       ├─ analysis / execution / strategy
       ├─ evidence / outcomes / research
       ├─ portfolio / trade plan / simulation
       └─ push / operations
             ↓
       Cloudflare D1 + Twelve Data
```

`wrangler.jsonc` points production static assets at **`./public`**. There are no supported root duplicate frontend files anymore. New frontend work belongs under `public/`.

The Cloudflare cron is a five-minute **wakeup**. It is not permission for every subsystem to run every five minutes. `src/scheduler.js` decides what work is actually due.

---

## 6. Backend ownership map

### 6.1 Entry, API, scheduler

| File | Owns |
| --- | --- |
| `src/entry.js` | Wrangler-facing entry, selected API extensions, health augmentation, backend self-test authorization, delegation to the production scheduler. |
| `src/index.js` | Main `/api/*` routing and core API responses. It is not the authoritative production schedule owner. |
| `src/scheduler.js` | Sole production scheduled-work orchestration. |
| `src/scanner-schedule.js` | Schedule constants, slot predicates, coverage reporting, and scheduled Radar request envelope. |

If an older scheduled implementation remains inside another module, it is non-authoritative. Do not extend it. New scheduled work must plug into `src/scheduler.js` and use schedule policy from `src/scanner-schedule.js`.

### 6.2 Provider and persistent state

| File | Owns |
| --- | --- |
| `src/market.js` | Candle/symbol-search provider access, market cache use, data cleanup and quality handling. |
| `src/db.js` | Core D1 state/cache access and baseline schemas. |
| `src/provider-usage.js` | Provider-purpose accounting layered over the hard daily reservation. |

Browser code must never call Twelve Data directly.

Every new provider-consuming feature must identify:

1. its owner;
2. its provider purpose label;
3. its maximum request envelope;
4. what can be served from cache/D1 instead;
5. what live workload it could compete with.

### 6.3 Discovery

| File | Owns |
| --- | --- |
| `src/discovery.js` | Discovery catalog, weekly pool, rolling scan statistics. |
| `src/discovery-quarantine.js` | Permanent/bad-symbol retirement and cooldown protection. |
| `src/scanner-budget.js` | HOT / ACTIVE / EXPLORE classification, fairness and recheck intervals. |
| `src/scanner-schedule.js` | When discovery is permitted to run. |
| `src/radar.js` | Scheduled quote scans, discovery scoring, leader ranking, Radar evidence. |
| `src/early-movement.js` | Early movement / acceleration state. |
| `src/analysis-expectation.js` | Expected analysis timing/context. |
| `src/screener.js` | Promotion queue, deep analysis, 15m execution lane, bounded 5m priority pulse. |

### 6.4 Production analysis and decisions

| File | Owns |
| --- | --- |
| `src/analysis.js` | Core indicators, structure, engines, regime, base decision analysis. |
| `src/hard-guardrails.js` | Final non-negotiable BUY authorization contract. |
| `src/execution-confirmation.js` | Completed 15m rechecks and bounded price-pulse refresh. |
| `src/unified-action.js` | User-facing action normalization. |
| `src/strategy.js` | Opportunity/holding interpretation and sizing/profit logic. |
| `src/trade-plan.js` | Entry, stop, target and do-not-enter-above plan. |
| `src/position-manager.js` | HOLD / PROTECT / PARTIAL / REDUCE / EXIT behavior for owned positions. |

Production authorization belongs on the backend. UI may explain it but must not invent it.

### 6.5 Evidence, research and learning

| File | Owns |
| --- | --- |
| `src/evidence.js` | Radar/analysis observations and model snapshots. |
| `src/decision-episodes.js` | Independent setup/decision episode construction. |
| `src/outcomes.js` | Forward returns, MFE/MAE, target/stop ordering and benchmark excess. |
| `src/evaluation.js` | Calibration, cohort quality, error analysis. |
| `src/strategy-optimizer.js` | Evidence-only setup/gate comparisons. |
| `src/challenger.js` | Champion/challenger comparison. |
| `src/shadow-validation.js` | Forward challenger validation without auto-promotion. |
| `src/optimization-report.js` | Combined research recommendations. |
| `src/research.js` | Budget-aware after-hours historical research. |
| `src/weekly.js` | Weekly 1Y research plus owned-position price/close reviews. |
| `src/weekend.js` | Weekend planning/intelligence. |
| `src/benchmark-context.js` / `src/benchmark-loader.js` | Controlled benchmark mapping/loading. |
| `src/detection-latency.js` | Stored-evidence audit of how early/late SignalForge detected a setup; no fresh provider calls. |

### 6.6 Shadow market context

| File | Owns |
| --- | --- |
| `src/session-range.js` | Room-to-run/session-range shadow evidence. |
| `src/opening-range.js` | Opening-range acceptance/rejection shadow evidence. |
| `src/activity-rhythm.js` | Time-of-day activity shadow evidence. |
| `src/pattern-context.js` | Structure/pattern context. |
| `src/pattern-evidence.js` | Pattern observations. |
| `src/pattern-evaluation.js` | Pattern outcome evaluation. |

### 6.7 Operations and notifications

| File | Owns |
| --- | --- |
| `src/operations.js` | Scheduler/operation heartbeat and operational proof. |
| `src/self-test.js` | Backend health/self-test. |
| `src/push.js` | Web Push transitions and deep links. |
| `src/simulation.js` | Forward paper simulation and account state. |
| `src/simulation-schema.js` / `src/simulation-metrics.js` | Simulation compatibility and metrics. |

---

## 7. Production scheduler policy

All times below are **U.S. Eastern Time** and are owned by `src/scanner-schedule.js`.

| Lane | Schedule | Purpose |
| --- | --- | --- |
| Opening sweeps | Mon–Fri 09:30, 09:35, 09:40 | Catch opening movement before the normal quarter-hour cycle. |
| Broad discovery | Mon–Fri 09:45–15:30 every 15m | Rotate the Radar universe and promote candidates. |
| Priority execution | Mon–Fri 09:50–15:55 every 5m except quarter-hour boundaries | Refresh top near-ready candidates without colliding with broad scans. |
| Owned-position price pulse | Same spare 5m slots | Rotate one owned position through bounded live-price management. |
| Portfolio close review | Mon–Fri 15:45 | Higher-cost end-of-session holding review. |
| After-hours research | Mon–Fri 16:15–18:45 every 30m | Use remaining budget for bounded historical confirmation/evidence work. |
| Weekly 1Y research | Saturday 11:15–12:30 every 15m, six batches × six symbols | Cover the 36-symbol weekly universe without displacing Friday live discovery. |
| Weekend expansion research | Saturday 13:00 | Additional bounded research after weekly batches. |
| Weekend summary | Sunday 11:15 | Planning/summary delivery. |

### Friday policy

Friday is a full production discovery day. Broad discovery runs through 15:30 just like Monday–Thursday. Weekly research no longer occupies Friday afternoon.

### Extended-hours discovery

Premarket/postmarket **broad discovery remains disabled**. That is intentional. Extended-hours volume and quote semantics must be independently validated before they are allowed to influence the production scanner.

### Scheduled Radar provider envelope

The scheduled Radar quote stage has a deterministic daily maximum under the current policy:

```text
3 opening sweeps
+ 24 regular broad-discovery runs
= 27 Radar runs/day

27 × 5 quote symbols
= 135 scheduled Radar quote requests / market day
```

That is under 20% of the default **700/day** provider hard ceiling. This envelope covers the Radar quote stage only. Promotions, execution checks, owned-position monitoring, market-data requests, and research remain separately quota-guarded and must still reserve provider usage.

---

## 8. Browser and Cloudflare request policy

The browser may request information, but individual UI modules do not own network cadence.

### Shared safe-read policy

`public/api-request-policy.js` is the browser/PWA request-policy owner. The page request coordinator and service worker consume the same policy.

Current safe-read behavior includes:

- roughly **5-minute** snapshots for known background API reads;
- roughly **30-minute** snapshots for exact `cacheOnly=1` historical market-data recovery;
- direct/manual market-data actions remain available when the user actually requests fresh data.

### Rules for frontend features

A UI module may render, subscribe, or request shared state. It should not introduce its own independent provider policy.

Do not add:

- rapid recursive retries;
- feature-specific one-minute polling when a shared snapshot exists;
- multiple fallback timeframes solely to populate one visual;
- a hidden polling loop inside an overlay/component;
- direct Twelve Data calls from the browser.

A new UI feature that needs data should first answer: **Can the feature consume data the app already loaded?**

---

## 9. D1 schema and data ownership

D1 is persistent system memory. Schema safety remains important, but normal reads should not rerun DDL repeatedly.

Runtime schema/migration owners use a **once-per-D1-binding promise per warm Worker isolate**:

```text
first caller on a warm DB binding
      ↓
CREATE / compatibility initialization
      ↓
shared ready promise
      ↓
subsequent callers reuse readiness
```

Concurrent callers share initialization. If initialization fails, ownership state is cleared so a later request can retry. New cold isolates still verify/create the required schema.

The Stage 14.41 regression scans `src/*.js` and rejects runtime schema/migration SQL that does not follow the ownership pattern.

Do not solve a feature problem by casually adding DDL to a hot request path.

---

## 10. Production frontend ownership

**`public/` is the only production frontend tree.**

| Group | Main files |
| --- | --- |
| App shell | `index.html`, `styles.css`, `config.js`, `build-info.js`, `manifest.webmanifest`, `pwa.js`, `service-worker.js` |
| Request control | `api-request-policy.js`, `api-request-coordinator.js` |
| Selected stock | `app.js`, `stock-meta.js`, `last-symbol-ui.js` |
| Navigation | `ui-router.js` |
| Discovery | `radar-ui.js`, `crawler-ui.js`, `screener-ui.js`, `watchlist-ui.js` |
| Decision | `decision-summary-ui.js`, `gate-ui.js`, `unified-action-ui.js`, `cockpit-ui.js`, `trade-plan-ui.js` |
| Chart | `chart-inspector.js`, `chart-adapter.js`, `chart-control-reliability.js`, `pattern-chart-hook.js` |
| Portfolio/alerts | `portfolio-ui.js`, `push-ui.js`, `alert-history.js`, `simulation-capital-ui.js`, `weekend-ui.js` |
| Shadow context | `session-range-ui.js`, `opening-range-ui.js`, `activity-rhythm-ui.js`, `detection-latency-ui.js` |
| Diagnostics | `telemetry-ui.js`, `operations-ui.js`, `self-test-ui.js` |

Network-enabled Pattern UI files may remain in the repository for history/rebuild work but are intentionally not loaded by production startup.

---

## 11. Test and CI architecture

Tests are part of production control, not optional documentation.

### Test ownership

`scripts/suite-manifest.mjs` classifies every `scripts/test-*.mjs` file exactly once:

- **baseline** — established behavior that should continue to pass;
- **production-critical** — current safety/resource/reliability guardrails;
- **historical/disabled** — superseded behavior retained for archaeology but not required in production.

Adding a `test-*.mjs` file without classifying it causes CI to fail.

### Central runner

`scripts/run-test-suite.mjs` owns orchestration. `package.json` should not become a second giant per-stage test list.

CI has four visible gates:

1. **Test manifest ownership**
2. **Automatic JavaScript syntax discovery** across `src/`, `public/`, and `scripts/`
3. **Baseline regression suite**
4. **Production reliability guardrails**

Historical/disabled tests are opt-in and must not silently re-enable quarantined behavior.

### Merge rule

A PR that changes production behavior is not considered ready because GitHub merely says it is mergeable. The exact PR head must pass the relevant CI gates, and the merge should be locked to that tested head SHA.

---

## 12. Provider-budget policy

The default hard provider ceiling is **700 requests/day**.

`reserveProviderRequest()` is the hard safety backstop. Provider-purpose accounting gives visibility into what consumed the budget.

After-hours research uses a lower target rather than intentionally consuming the entire hard limit, preserving reserve for live/important work.

When proposing a new provider-consuming feature, document a worst-case estimate such as:

```text
runs/day × symbols/run × provider calls/symbol
```

If the feature cannot produce a bounded estimate, it is not ready for production.

---

## 13. How to add a feature without mixing responsibilities

Before coding, answer these questions:

1. **What problem does this solve?**
2. **Which subsystem owns it?**
3. **What is its single source of truth?**
4. **Is it production, shadow, or UI-only?**
5. **Can it reuse existing D1/cache/app state?**
6. **Does it add browser requests?** If yes, why can the shared request policy not satisfy it?
7. **Does it add provider calls?** What is the maximum daily envelope?
8. **Does it add scheduled work?** Which `scanner-schedule.js` slot owns it?
9. **Does it add D1 schema?** Who owns initialization/migration?
10. **Can stale data create a dangerous state?** Define fail-closed behavior.
11. **Which regression proves the feature?**
12. **Which test-manifest class should that regression belong to?**
13. **How is the feature disabled/rolled back if it causes resource or decision problems?**

If those answers are unclear, the design is not ready to merge.

---

## 14. Change-control rules

### Trading-policy change

Changing BUY authorization, R/R, confirmation, stops, targets, overextension, or production gates requires:

- an explicit reason;
- evidence/research supporting the proposal;
- a hard-guardrail regression;
- review of every downstream consumer;
- no silent weakening through scoring.

### New model

Start in shadow unless it is only a refactor of already-approved behavior. Record enough independent outcomes before considering promotion.

### New API/provider request

Prefer shared data first. Add named purpose accounting and a bounded request estimate.

### New UI module

Render existing state when possible. Do not create independent polling simply because the module is independent visually.

### New scheduled job

Use `src/scanner-schedule.js` for timing policy and `src/scheduler.js` for execution ownership. Do not put a new cron schedule in an unrelated module.

### New D1 schema

Use the once-per-binding initialization pattern, preserve cold-start safety, and add regression coverage.

### Pattern/overlay change

Do not re-enable the old network Pattern layer. A rebuilt layer must be passive-data-first and request-budget tested.

---

## 15. Deployment and release discipline

A GitHub merge and a Cloudflare deployment are different events.

After a production merge:

1. confirm Cloudflare deployed the intended commit;
2. verify `/api/health` fields that are actually exposed;
3. verify the visible PWA build/shell when frontend files changed;
4. close/reload stale old tabs if a service-worker or frontend networking change was deployed;
5. inspect the **new request slope**, not only a rolling 24-hour total;
6. inspect provider-purpose usage when market-data behavior changed.

Frontend releases should keep visible build identity and the service-worker shell synchronized. Backend-only changes do not need unnecessary PWA shell churn.

---

## 16. Current operational guardrails

At a high level, production is expected to preserve all of the following:

- hard **1.80:1** BUY R/R floor;
- target/thesis/overextension/price-location hard checks;
- completed 15m participation + execution authorization;
- 15m near-ready confirmation cadence;
- bounded 5m priority price pulses;
- 5m owned-position pulse rotation;
- 700/day provider hard cap;
- centralized browser request policy;
- once-per-binding D1 schema initialization;
- Pattern network UI disabled;
- five-minute Cloudflare cron wakeup;
- full Mon–Fri regular discovery coverage through 15:30 ET;
- Saturday weekly research instead of Friday live-session competition;
- four-stage CI gate before production behavior is merged.

If a future implementation conflicts with this list, treat that as an architectural change requiring deliberate review—not as a convenient local edit.

---

## 17. Known limitations / future work

- Broad premarket/postmarket discovery is not production-enabled because extended-hours volume/quote behavior still needs validation.
- The provider budget is intentionally finite; improving coverage should prioritize better batching, reuse, ranking, or a stronger data plan rather than uncontrolled calls.
- Some historical/disabled modules remain in the repository for evidence and reconstruction. Their presence does not mean they are active.
- `src/index.js` may retain legacy scheduled code for historical compatibility, but production cron ownership is `src/entry.js → src/scheduler.js`. Do not extend the legacy path.
- Continued architecture work should favor smaller owner modules rather than adding more responsibilities to `src/index.js`.

---

## 18. Development commands

Common commands are intentionally small and owner-based:

```bash
npm run dev
npm run check
npm run test:manifest
npm run check:syntax
npm run test:baseline
npm run test:reliability
npm run test:historical   # opt-in archaeology only
npm run deploy
```

Do not restore dozens of stage-specific package aliases. Run an individual test directly with Node when debugging a specific regression.

---

## 19. The governing design principle

SignalForge should become more capable **without becoming harder to control**.

For every future change:

> Find the owner before adding code. Reuse data before adding requests. Measure the budget before adding work. Keep experiments shadowed until validated. Fail closed on BUY authorization. Prove the change in CI before merging it.
