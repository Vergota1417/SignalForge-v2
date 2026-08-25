# SignalForge

SignalForge is a Cloudflare Worker + D1 + installable PWA that continuously looks for U.S. stock opportunities, turns market data into an explainable decision state, records evidence about those decisions, and alerts the user when an actionable state changes.

SignalForge is **decision-support software**. It does not connect to a brokerage to place trades. The user remains responsible for deciding whether to act and for recording real purchases/sales in the app.

This README is the **current architecture and change-control document** for the project. Read it before adding a new model, API call, scheduler, database table, UI module, or trading rule.

---

## 1. Source of truth

Different files have different jobs. Do not make one document or module silently replace another.

| Source | Owns |
| --- | --- |
| `README.md` | Current architecture, subsystem ownership, non-negotiable rules, change-control process, and known technical debt. |
| `public/build-info.js` | Runtime/release identity shown by the deployed app. |
| `public/service-worker.js` | Installed-PWA shell/cache version and API snapshot caching policy. |
| `wrangler.jsonc` | Cloudflare Worker entry point, static-assets directory, D1 binding, cron wakeup, environment variables, and required secrets. |
| `package.json` | Node package metadata and local test/check commands. |
| `SIGNALFORGE_BUILD_LEDGER.md` | Historical build/stage record. It is a chronology, not the current architecture authority. |
| Tests in `scripts/` and CI | Executable proof that required behavior has not regressed. A test file existing does **not** mean it ran; it must be part of the active check/CI path. |

Release metadata should stay aligned. A frontend release normally requires the visible build identity and PWA shell to move together. Do not hard-code the current release number into this README; use `public/build-info.js` for that.

---

## 2. What we are building

The intended production flow is:

```text
Market universe
    ↓
Discovery catalog / weekly pool
    ↓
Tiered Radar scan (HOT / ACTIVE / EXPLORE)
    ↓
Early-movement detection
    ↓
Smart Screener promotion
    ↓
Higher-timeframe deep analysis
    ↓
15-minute participation / execution confirmation
    ↓
Production decision state
    ↓
BUY NOW / READY SOON / PULLBACK / WAIT / AVOID / SELL-EXIT
    ↓
Trade plan + push alert
    ↓
User manually executes and records a real position
    ↓
Position monitoring / profit protection / exit guidance
```

A second pipeline learns from what happened without silently changing production:

```text
Radar + analysis evidence
    ↓
Forward outcomes (1 / 3 / 5 / 10 / 20 sessions)
    ↓
Evaluation and decision-error analysis
    ↓
Optimizer / challenger research
    ↓
Forward shadow validation
    ↓
Human review
    ↓
Only then may a deliberate production-rule change be proposed
```

That separation is essential. **Research may challenge production, but research does not automatically become production.**

---

## 3. Non-negotiable production policy

These are project-level safety rules, not suggestions for an individual UI component.

### New-entry authorization

`BUY NOW` is the only executable new-entry permission. A production BUY must not be created by a score, one model, a chart pattern, a research result, or a UI label alone.

The required policy is:

- reward/risk must be at least **1.80:1**;
- a defensible structure target must exist;
- the thesis/stop structure must remain intact;
- price must not be overextended/chased;
- required higher-timeframe decision gates must clear;
- live 15-minute participation/execution confirmation must pass;
- stale participation cannot authorize a fresh BUY;
- a 5-minute price pulse may update price/location/R/R, but it must never pretend to be a new completed 15-minute confirmation.

A safety-critical constant such as the 1.80 R/R floor should have **one authoritative backend owner**. UI, evidence, trade-plan, and monitoring layers should consume/report that policy rather than redefining independent copies that can drift.

### Shadow / experimental models

Pattern context, opening range, session range/room-to-run, activity rhythm, challengers, and other experimental features must remain `shadowOnly` / `affectsBuyNow:false` until enough independent evidence exists and a deliberate production review promotes them.

A shadow model may:

- calculate;
- display;
- record evidence;
- compare outcomes;
- nominate a future rule.

A shadow model may **not** silently create, block, upgrade, or downgrade `BUY NOW`.

### Execution responsibility

SignalForge does not auto-trade. Real brokerage execution remains manual. Portfolio records tell SignalForge what the user owns so the position-management system can monitor it.

---

## 4. Runtime architecture

```text
Phone / Browser
  └─ public/ PWA
       ├─ UI modules
       ├─ request coordinator
       └─ service worker / local shell cache
              ↓ /api/*
Cloudflare Worker
  └─ src/entry.js
       └─ src/index.js
            ├─ scheduler/orchestration
            ├─ analysis/discovery/research modules
            ├─ D1 persistence
            └─ Web Push
                   ↓
        Cloudflare D1      Twelve Data
          state/cache       market provider
```

`wrangler.jsonc` is the deployment authority. The Worker entry is `src/entry.js`; `/api/*` runs Worker-first; production static assets come from **`./public`**; the D1 binding is `DB`; and Cloudflare currently wakes the Worker on a five-minute cron. Provider use is capped by `MAX_PROVIDER_REQUESTS_PER_DAY` (currently configured as 700). Push uses VAPID configuration, and Twelve Data credentials stay server-side.

### Important frontend rule

**`public/` is the production frontend.**

The repository root still contains older `index.html`, `app.js`, `styles.css`, and `config.js` copies. They are legacy/cleanup candidates and are **not** where new production frontend work belongs. Do not implement a feature in a root duplicate and assume Cloudflare will serve it.

---

## 5. Repository ownership map

### Root

| Path | Responsibility |
| --- | --- |
| `README.md` | Architecture + governance. |
| `SIGNALFORGE_BUILD_LEDGER.md` | Historical implementation record. |
| `wrangler.jsonc` | Cloudflare deployment/runtime configuration. |
| `package.json` | Dependencies and executable checks. |
| `.assetsignore` | Repository/deployment asset exclusions where applicable. |
| `src/` | Backend production logic. |
| `public/` | Production PWA/static frontend. |
| `scripts/` | Regression tests, diagnostics, and developer utilities. |
| root `index.html`, `app.js`, `styles.css`, `config.js` | Legacy duplicates; do not extend. |

### Backend: entry, API, orchestration

| File | Owns |
| --- | --- |
| `src/entry.js` | Wrangler-facing wrapper, selected API extensions, opening-cycle/portfolio-pulse orchestration. |
| `src/index.js` | Main API router and scheduled production orchestration. |
| `src/constants.js` | Shared stable constants/timeframe configuration. |

### Backend: provider, storage, and resource control

| File | Owns |
| --- | --- |
| `src/market.js` | Authoritative candle/symbol-search provider access, market-data cache use, candle validation, session cleanup. |
| `src/db.js` | Core D1 state/cache access and baseline schemas. |
| `src/provider-usage.js` | Provider-purpose accounting on top of the daily request reservation. |

**Rule:** browser code does not call Twelve Data directly. Any new provider request needs a backend owner, a named purpose, caching/reuse reasoning, and provider-budget impact review.

### Backend: discovery and scanning

| File | Owns |
| --- | --- |
| `src/discovery.js` | U.S. common-stock catalog, weekly discovery pool, exploration, rolling discovery statistics. |
| `src/discovery-quarantine.js` | Bad/permanently rejected symbol quarantine/retirement. |
| `src/scanner-budget.js` | HOT / ACTIVE / EXPLORE classification, scan caps, fairness and recheck intervals. |
| `src/scanner-schedule.js` | Broad-discovery schedule definition and coverage reporting. |
| `src/radar.js` | Scheduled quote scan, discovery scoring, leader ranking, radar evidence. |
| `src/early-movement.js` | Early acceleration/movement state. |
| `src/early-movement-evaluation.js` | Outcome-based evaluation of early-movement behavior. |
| `src/analysis-expectation.js` | Expected next-analysis timing/context shown to the system/UI. |
| `src/screener.js` | Promotion queue, deep-analysis refresh, 15m execution lane, 5m priority price pulse, fairness. |

### Backend: production analysis and decisions

| File | Owns |
| --- | --- |
| `src/analysis.js` | Core indicators, structure levels, Trend/Entry/Probability/RiskReward engines, SPY regime, base decision analysis, 15m confirmation calculation. |
| `src/execution-confirmation.js` | Re-evaluating a saved setup with live completed 15m confirmation and bounded 5m price pulses. |
| `src/unified-action.js` | User-facing normalization of saved decision + movement into one action state. |
| `src/strategy.js` | Opportunity scoring, candidate/holding strategy interpretation, sizing and profit-protection calculations. |
| `src/trade-plan.js` | Entry/stop/target/do-not-enter-above plan derived from production decision state. |
| `src/position-manager.js` | Owned-position HOLD / PROTECT / PARTIAL / EXIT management. |

Production authorization belongs on the backend. A frontend module may explain a decision; it must not invent one.

### Backend: research, evidence, learning

| File | Owns |
| --- | --- |
| `src/evidence.js` | Immutable-ish radar/analysis observations, raw feature snapshots and model identity. |
| `src/outcomes.js` | Forward outcomes at 1/3/5/10/20 sessions, MFE/MAE, target/stop order and benchmark excess return. |
| `src/evaluation.js` | Evidence quality, false-positive/false-negative analysis and cohort calibration. |
| `src/decision-episodes.js` | Collapsing repeated observations into independent decision/setup-thesis samples. |
| `src/strategy-optimizer.js` | Evidence-only gate/setup comparisons. |
| `src/challenger.js` | Champion-versus-challenger rule comparison. |
| `src/shadow-validation.js` | Forward challenger validation; never auto-promotes production. |
| `src/optimization-report.js` | Combined optimization report and research recommendations. |
| `src/research.js` | Bounded after-hours historical research within provider budget. |
| `src/weekly.js` | Weekly universe research plus owned-position price/close reviews. |
| `src/weekend.js` | Weekend research/planning state. |
| `src/benchmark-context.js` | Symbol → industry/sector/market benchmark mapping/context. |
| `src/benchmark-loader.js` | Controlled benchmark data loading/reuse. |

### Backend: shadow market-context models

| File | Owns |
| --- | --- |
| `src/session-range.js` | Room-to-run/session-range shadow evidence. |
| `src/opening-range.js` | Opening-range acceptance/rejection shadow evidence. |
| `src/activity-rhythm.js` | Time-of-day activity rhythm shadow evidence. |
| `src/pattern-context.js` | Structure/pattern detection context. |
| `src/pattern-evidence.js` | Pattern shadow observations. |
| `src/pattern-evaluation.js` | Pattern outcome evaluation. |
| `src/detection-latency.js` | Stored-evidence audit of discovery/promotion/READY/BUY latency; makes zero fresh provider requests. |

These modules are evidence producers unless explicitly promoted through the production decision process.

### Backend: paper testing, operations, notifications

| File | Owns |
| --- | --- |
| `src/simulation.js` | Forward paper account, positions/trades/equity snapshots and event-driven simulation. |
| `src/simulation-schema.js` | Backward-compatible simulation schema/cohort columns. |
| `src/simulation-metrics.js` | Win rate, profit factor, drawdown, cohort and benchmark metrics. |
| `src/operations.js` | Scheduler/operation heartbeat, error counts, evidence/outcome/provider operational status. |
| `src/self-test.js` | Backend health/self-test checks. |
| `src/push.js` | Web Push payloads, important state transitions and deep links. |

### Production frontend (`public/`)

The frontend is intentionally modular. A UI module should primarily **render state or initiate an explicit user action**, not own market/provider policy.

| Group | Files / responsibility |
| --- | --- |
| App shell | `index.html`, `styles.css`, `config.js`, `build-info.js`, `manifest.json`, `pwa.js`, `service-worker.js` |
| Main selected stock | `app.js`, `stock-meta.js`, `last-symbol-ui.js` |
| Network coordination | `api-request-coordinator.js` |
| Navigation | `ui-router.js` |
| Discovery | `radar-ui.js`, `crawler-ui.js`, `screener-ui.js`, `watchlist-ui.js` |
| Decision explanation | `decision-summary-ui.js`, `gate-ui.js`, `unified-action-ui.js`, `cockpit-ui.js`, `trade-plan-ui.js` |
| Chart | `chart-inspector.js`, `chart-adapter.js`, `chart-control-reliability.js`, `pattern-chart-hook.js` |
| Portfolio / alerts | `portfolio-ui.js`, `push-ui.js`, `alert-history.js`, `simulation-capital-ui.js`, `weekend-ui.js` |
| Shadow context | `session-range-ui.js`, `opening-range-ui.js`, `activity-rhythm-ui.js`, `detection-latency-ui.js` |
| System diagnostics | `telemetry-ui.js`, `operations-ui.js`, `self-test-ui.js` |

Some Structure + Patterns network-enabled UI files remain in the repository from experiments. They are intentionally **not part of the active PWA startup after the request-amplification incident**. Do not re-enable an old pattern network module simply by adding its script back to `pwa.js` or the service-worker cache. Reintroduction must be passive/shared-data first and must pass resource-regression tests.

### Tests and utilities (`scripts/`)

`scripts/` contains historical phase/stage regressions, current reliability regressions, and utilities such as VAPID key generation. Tests are part of the architecture: each safety or resource rule should have an executable regression.

**Important:** adding a new `test-stage...mjs` file is not enough. It must be invoked by the active check/CI runner. Old tests should validate behavior, not pin the repository forever to an obsolete release number.

---

## 6. Network and resource-control policy

SignalForge has multiple protection layers because uncontrolled refresh loops can burn provider quota and Cloudflare resources quickly.

### Provider rules

1. Provider credentials stay server-side.
2. Provider use must reserve a named purpose through the backend accounting path.
3. D1/cache reuse is preferred over a fresh provider request.
4. The daily hard provider ceiling remains a safety backstop.
5. A new feature must state how many additional provider calls it can cause per hour/day before it is merged.
6. Research/outcome jobs may use remaining budget, but they must not starve live execution monitoring.

### Browser/PWA rules

1. Reuse shared saved endpoints instead of creating feature-specific polling when possible.
2. Use the shared request coordinator/service-worker cache policy.
3. Current saved/read endpoints are guarded on roughly a five-minute snapshot window.
4. Cache-only chart recovery is designed for a longer window (currently roughly 30 minutes).
5. Do not hide `setInterval()`/recursive network loops inside visual modules.
6. A chart overlay should consume already-loaded/saved context whenever possible.
7. Opening multiple modules or tabs must not multiply provider requests linearly.

---

## 7. Scheduler ownership

Cloudflare's cron is a **wakeup**, not permission for every subsystem to run every five minutes. `src/index.js`, `src/entry.js`, and schedule/budget modules decide what work is actually due.

Current important lanes include:

- opening sweeps around 09:30 / 09:35 / 09:40 ET;
- broad discovery according to `src/scanner-schedule.js`;
- near-ready completed 15-minute execution rechecks;
- bounded 5-minute priority price pulses between heavier scans;
- bounded owned-position pulses/reviews;
- after-hours/weekly/weekend research and outcome work.

The broad-discovery schedule is intentionally represented in a dedicated module so coverage can be audited. Do not bury a new market schedule inside a UI file or an unrelated backend feature.

---

## 8. D1 data ownership

D1 is the persistent memory of the system. Core and feature modules create backward-compatible tables with `CREATE TABLE IF NOT EXISTS` and, where needed, guarded column additions.

Major state families include:

- market/symbol caches;
- current signal state + status-transition events;
- discovery catalog/statistics/pools;
- radar quotes/state;
- provider usage + usage-by-purpose;
- push subscriptions/device authorization;
- real portfolio positions + portfolio strategy history;
- weekly/after-hours research;
- evidence observations + forward outcomes;
- paper simulation state/positions/trades/equity;
- challenger/shadow validation;
- session/opening/activity/pattern shadow observations;
- operation heartbeat/status.

**New persistence rule:** one subsystem owns the schema and read/write API for a piece of state. Do not create two tables or two storage formats for the same concept because two UI features want it differently.

---

## 9. API responsibility

The Worker exposes APIs in functional groups. The exact route definitions live in `src/index.js` and the wrapper additions in `src/entry.js`.

Major groups are:

- health / operations / backend self-test;
- market data and symbol search;
- saved signals and alert history;
- Opportunity Radar and Smart Screener;
- detection-latency and evidence/evaluation/optimization reports;
- research status;
- portfolio and trade-plan state;
- paper-simulation capital/state;
- push subscription/test/configuration.

When adding an endpoint, first ask whether the data already exists in another response. Prefer extending/reusing an existing coherent API over creating a new polling endpoint for one card.

---

## 10. How to add a future feature without mixing responsibilities

Before coding, classify the feature.

| Feature type | Correct owner |
| --- | --- |
| New market/provider data | backend provider/data layer; never direct browser provider calls |
| New discovery score/tier | discovery/radar/scanner modules |
| New production BUY/SELL rule | centralized backend decision policy + production regressions |
| Unvalidated idea/model | shadow/evidence module first |
| New chart visualization | chart/UI module consuming existing state; no independent provider loop |
| New database state | subsystem schema owner + backward-compatible migration |
| New schedule | scheduler/schedule owner + provider-budget review |
| New alert | `push.js` + deep-link/auth tests |
| New portfolio behavior | strategy/position-manager layer |
| New research comparison | evidence/outcome/evaluation/challenger layer |
| Pure presentation change | `public/` module; must not change decision authority |

### Required design questions

Every meaningful implementation should answer:

1. **What problem does it solve?**
2. **Which existing subsystem owns that problem?**
3. **What is the single source of truth?**
4. **Does it affect production decisions, or is it shadow-only?**
5. **What data does it read/write?**
6. **Does it add provider or Worker requests? How many?**
7. **Can it reuse cached/saved data instead?**
8. **What happens if its data is stale or unavailable?**
9. **What regression proves it cannot break a non-negotiable rule?**
10. **Does the PWA shell/build metadata need to change?**
11. **Does this README need an architecture/ownership update?**

If a proposed feature cannot answer those questions, it is not ready to be wired into production.

---

## 11. Change-control workflow

Use this sequence for production changes:

```text
Understand the problem
   ↓
Audit existing owner/data path
   ↓
Choose ONE subsystem owner
   ↓
Implement smallest coherent change
   ↓
Add/update regression
   ↓
Review provider + scheduling impact
   ↓
Run syntax/regression/reliability checks
   ↓
Review exact branch diff
   ↓
Open PR
   ↓
Require green checks on the exact latest head
   ↓
Merge
   ↓
Verify deployed build + /api/health/operations
```

Do not merge because GitHub says a PR is merely “mergeable.” Mergeability means the branches do not conflict; it does not prove the system is correct.

### Frontend release checklist

If production static files change:

- verify the module load order;
- update the PWA shell/cache version when required;
- verify new assets are cached only if they belong in the installed shell;
- ensure disabled/experimental modules are not accidentally re-enabled;
- verify the visible build identity;
- test installed-PWA update behavior, not only a desktop hard refresh.

### Backend/decision release checklist

If decision/provider/scheduler logic changes:

- preserve non-negotiable BUY authorization;
- verify 15-minute confirmation freshness behavior;
- verify provider-purpose accounting and request caps;
- verify schedules/candidate caps did not silently widen;
- verify evidence/model versioning when decision semantics change;
- verify paper/research/shadow paths do not bypass production policy;
- inspect operations/health after deployment.

---

## 12. Current audit watch list

These are known organization/reliability items discovered while reviewing the repository. They should be removed or updated here when fixed; they are **not** patterns to copy.

- **Legacy root frontend duplicates:** production is `public/`, but older root copies still exist and can cause developers to edit the wrong file.
- **Release metadata drift:** runtime build identity and `package.json` package version have not always moved together. CI should enforce the intended relationship.
- **Build Ledger drift:** the ledger's historical “CURRENT” marker has lagged the actual deployed stage. The README now owns current architecture; the ledger should remain history.
- **Discovery coverage:** `src/scanner-schedule.js` currently describes broad discovery as Mon–Thu, 09:45–15:30 ET, with no extended-hours or Friday broad-discovery coverage. This is a known detection-latency limitation, not an undocumented behavior.
- **Pattern network UI:** network-enabled Structure + Patterns UI was disabled after request amplification. Rebuild it around passive/shared context rather than restoring independent polling.
- **Regression orchestration:** historical stage tests have accumulated faster than the master check path. CI/check runners must explicitly include current reliability tests; never assume a test is active because the file exists.
- **Duplicated production constants:** critical values such as the 1.80 R/R requirement appear in multiple current-main modules. Consolidate safety-critical policy rather than adding more copies.

---

## 13. Local/deployment basics

Install dependencies and run the repository checks before deployment:

```bash
npm install
npm run check
```

Run/deploy with Wrangler as appropriate:

```bash
npx wrangler dev
npx wrangler deploy
```

Cloudflare configuration lives in `wrangler.jsonc`. Do not commit provider/private keys into browser code or GitHub. Twelve Data access is server-side. Push notifications additionally require the VAPID configuration used by `src/push.js`; `scripts/generate-vapid.mjs` exists as a developer utility.

---

## 14. Definition of a well-structured SignalForge change

A good change makes the system **more understandable after it is merged**.

It should:

- have one clear owner;
- reuse an existing data path when possible;
- avoid duplicate business logic;
- avoid duplicate polling/provider calls;
- fail closed when required decision data is stale/missing;
- keep experimental evidence separate from production authority;
- expose enough operations/evidence to diagnose what happened;
- include a regression for the behavior that matters;
- leave the repository map and architecture easier to reason about than before.

If a feature requires touching many unrelated layers, first check whether the architecture is missing a shared abstraction. Do not solve that by scattering the same rule across more files.

---

## 15. Project goal

SignalForge should become a disciplined market-monitoring and decision system that can:

- search broadly enough to find developing opportunity instead of repeatedly watching only the same tickers;
- prioritize limited compute/provider budget toward the most promising candidates;
- explain why a setup is or is not actionable;
- alert the user without requiring the app to stay open;
- protect capital with explicit entry, thesis, R/R and position-management rules;
- learn from independent forward outcomes instead of repeatedly counting the same setup;
- test new ideas safely in shadow before production;
- remain simple to operate on a phone while keeping complexity controlled in the backend.

The architecture exists to support that goal. **Efficiency means sharing data and ownership—not skipping validation. Effectiveness means improving detection and decision quality without weakening the controls that protect the system.**
