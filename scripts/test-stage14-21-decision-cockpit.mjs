import assert from 'node:assert/strict';
import fs from 'node:fs';

const cockpit=fs.readFileSync(new URL('../public/cockpit-ui.js',import.meta.url),'utf8');
const telemetry=fs.readFileSync(new URL('../public/telemetry-ui.js',import.meta.url),'utf8');
const operations=fs.readFileSync(new URL('../public/operations-ui.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.match(cockpit,/CORE SETUP · REQUIRED/,'cockpit implementation must retain compact core setup group');
assert.match(cockpit,/EXECUTION · TIMING \+ CONTEXT/,'cockpit must separate execution timing/context');
assert.match(cockpit,/data-cockpit-analysis/,'cockpit needs a compact Analysis control when reintroduced');
assert.match(cockpit,/data-cockpit-system/,'cockpit needs a separate System control when reintroduced');
assert.match(cockpit,/data-cockpit-help/,'quick checks need phone-friendly tap help');
assert.match(cockpit,/signalforge:cockpit-system/,'cockpit must signal when lazy System diagnostics are opened');
assert.match(cockpit,/#sfTradePlan\{display:block!important\}/,'Trade Plan behavior must remain available in compact/mobile mode');
assert.match(cockpit,/body\.sf-cockpit-mode\.sf-simple-mode \.dashboard-row\{display:grid!important\}/,'chart behavior must remain available in compact mobile mode');
assert.match(cockpit,/sfAnalysisDock/,'raw analysis implementation must remain grouped into an advanced dock');
assert.match(cockpit,/sfSystemDock/,'system diagnostics implementation must remain grouped separately');
assert.match(cockpit,/R\/R at candle/,'chart crosshair context must expose reward\/risk');
assert.match(cockpit,/How SignalForge calculates these chart levels/,'chart must provide an on-demand calculation explainer');
assert.match(cockpit,/current saved decision levels/,'chart comparison must disclose that hovered candles use current saved levels');
assert.match(cockpit,/20-period average − 0\.40 ATR/,'entry formula must be explained');
assert.match(cockpit,/0\.35 ATR buffer/,'structure stop formula must be explained');
assert.doesNotMatch(cockpit,/\/api\/market-data/,'cockpit organization/hover visuals must not spend provider requests');
assert.match(cockpit,/\/api\/signals/,'cockpit may read saved signal state only');
assert.match(cockpit,/new MutationObserver\(scheduleOrganize\)/,'DOM organization must be debounced/idempotent');
assert.match(telemetry,/function refreshVisible\(\)\{if\(!systemOpen\(\)\)return;/,'heavy telemetry must not poll while System is collapsed');
assert.match(operations,/function refreshVisible\(\)\{if\(systemOpen\(\)\)refresh\(\);\}/,'operations status must not poll while System is collapsed');
assert.ok(pwa.indexOf("/trade-plan-ui.js")>=0&&pwa.indexOf("/cockpit-ui.js")>pwa.indexOf("/trade-plan-ui.js"),'dormant cockpit loader ordering must remain correct for later reintroduction');
assert.match(sw,/signalforge-shell-v30-\d+/,'service worker must retain a versioned v30 shell');
assert.match(build,/version:'2\.30\.\d+'/,'visible build must remain SignalForge 2.30.x');
assert.match(build,/shell:'v30-\d+'/,'visible shell must remain versioned');

console.log('Stage 14.21 decision cockpit regression passed.');
