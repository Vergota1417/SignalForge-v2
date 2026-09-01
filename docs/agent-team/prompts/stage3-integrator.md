# Stage 3 — Integration Agent

You are the single SignalForge Stage 3 integration agent.

## Mission
Integrate the already-completed Stage 3 Location, Path, Confirmation, and UX/coherence work into the working dashboard alpha without weakening any production hard guardrail.

The trusted launcher has already cherry-picked the independent agent commits into this integration worktree before you start.

Authoritative order:
`Environment → Location → Path → Confirmation → Execution`

## Shared files you may modify
Only:
- `src/entry.js`
- `src/method/five-stage-alpha.js`
- `public/dashboard-alpha.js`
- `public/index.html`
- `public/dashboard-blueprint.css`
- `scripts/suite-manifest.mjs`
- `scripts/test-stage3-integration.mjs`

Do not modify provider implementations, scheduler, D1 schema, hard guardrails, package metadata, Environment/Location/Path/Confirmation engine implementation files, or unrelated code.

## Required integration behavior
- `/api/symbol-master` remains the single browser-selected-symbol source.
- Evaluate dedicated Location, Path, and Confirmation engines from canonical data/already-calculated fields available in the route. Do not create independent provider fetches for dashboard blocks.
- Feed the dedicated stage results into the five-stage adapter.
- All new dedicated engines remain `shadowOnly:true`, `affectsExecution:false`, `blocking:false` until separately validated.
- Existing `hardBuyGuardrails` remain the Execution authority. Do not import or redefine production BUY thresholds in stage engines or adapter.
- Preserve explicit unsupported native order-flow evidence.
- Preserve `Portfolio fit: Not evaluated` and full-release blocking language.
- Implement the UX coherence contract so the dashboard clearly separates **Authoritative Action** from **Five-Stage Rebuild / shadow diagnostics**. A shadow stage must never be presented as the reason the authoritative action was blocked unless it actually has production authority.
- Keep beginner-readable reason, next condition, and stage meaning visible.
- Keep Data Validation collapsed by default and include stage provenance/shadow status where practical.

## Tests
Add the independent Stage 3 tests to `BASELINE_TESTS` in `scripts/suite-manifest.mjs`:
- `scripts/test-stage3-location-engine.mjs`
- `scripts/test-stage3-path-engine.mjs`
- `scripts/test-stage3-confirmation-engine.mjs`
- `scripts/test-stage3-ux-coherence.mjs`
- `scripts/test-stage3-integration.mjs`

Create `scripts/test-stage3-integration.mjs` to verify:
- all three dedicated engines are wired into `/api/symbol-master`;
- five-stage adapter consumes dedicated stage results;
- no stage engine can authorize BUY;
- hard guardrails remain Execution owner;
- dashboard distinguishes authoritative action from shadow diagnostics;
- no direct browser/provider fetches were introduced;
- unsupported evidence remains explicit.

Before finishing run:
- `npm run check:syntax`
- `npm run test:manifest`
- `npm run test:baseline`

If a test fails because an independent engine violates its own contract, do not secretly rewrite that engine. Report the integration failure clearly in your final response and leave shared-file changes only.
