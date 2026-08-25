import assert from 'node:assert/strict';
import fs from 'node:fs';

const analysis=fs.readFileSync(new URL('../src/analysis.js',import.meta.url),'utf8');
const guardrails=fs.readFileSync(new URL('../src/hard-guardrails.js',import.meta.url),'utf8');
const strategy=fs.readFileSync(new URL('../src/strategy.js',import.meta.url),'utf8');
const evidence=fs.readFileSync(new URL('../src/evidence.js',import.meta.url),'utf8');
const unified=fs.readFileSync(new URL('../src/unified-action.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/unified-action-ui.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.ok(analysis.includes('participationPass=rvolPass&&momentumPass'),'Participation core must require healthy RVOL and positive one-hour price response.');
assert.ok(analysis.includes('pass=participationPass&&passes>=4'),'BUY execution confirmation must require participation core plus at least four of five intraday checks.');
assert.ok(analysis.includes("dailyGatesReady&&hardBuyGuardrails.pass){status='BUY NOW'"),'BUY NOW must require the non-negotiable hard guardrails.');
assert.ok(guardrails.includes("participationConfirmed:{pass:Boolean(intradayConfirmation?.pass)"),'Hard BUY authorization must explicitly include participation confirmation.');
assert.ok(analysis.includes('BUY NOW still requires participation/execution confirmation')||guardrails.includes('15-minute participation/execution confirmed'),'Daily gates alone must not be sufficient for BUY NOW.');
assert.ok(strategy.includes("{name:'Participation / execution confirmation',pass:participationPass}"),'Strategy BUY WINDOW must include participation as a named blocker/check.');
assert.ok(evidence.includes("ANALYSIS_MODEL_VERSION='sf-analysis-v2-participation'"),'Participation logic must retain its evidence model identity.');
assert.ok(evidence.includes('participationRvolMin:1.0')&&evidence.includes('participationTotalPassesMin:4'),'Evidence must preserve the participation thresholds used by this model version.');
assert.ok(evidence.includes('features:{sma20:')&&evidence.includes('participation:participation?'),'Evidence must retain raw model features and participation details for later calibration.');
assert.ok(unified.includes('const participation={checked:Boolean(confirmation)')&&unified.includes('details={acceleration,readiness,gatesReady,gateTotal,failed,participation}'),'Unified action must expose participation details.');
assert.ok(ui.includes('sfSelectedParticipation')&&ui.includes('time-of-day RVOL ≥ 1.00x'),'The phone UI must show the participation gate and its rule.');
assert.match(build,/version:'2\.30\.\d+'/,'Production must expose a SignalForge 2.30.x release.');
assert.match(sw,/signalforge-shell-v30-\d+/,'PWA must use a versioned shell so phones receive updates.');
assert.match(pkg.version,/^2\.30\.\d+$/,'Package metadata must remain a valid SignalForge 2.30.x version.');

console.log('Stage 14.11 participation confirmation regression tests passed');
