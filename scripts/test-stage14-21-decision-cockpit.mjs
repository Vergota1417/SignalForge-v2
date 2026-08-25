import assert from 'node:assert/strict';
import fs from 'node:fs';

const cockpit=fs.readFileSync(new URL('../public/cockpit-ui.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.match(cockpit,/CORE SETUP · REQUIRED/,'cockpit must show compact core setup group');
assert.match(cockpit,/EXECUTION · TIMING \+ CONTEXT/,'cockpit must separate execution timing/context');
assert.match(cockpit,/data-cockpit-analysis/,'cockpit needs a compact Analysis control');
assert.match(cockpit,/data-cockpit-system/,'cockpit needs a separate System control');
assert.match(cockpit,/#sfTradePlan\{display:block!important\}/,'Trade Plan must remain visible in compact/mobile mode');
assert.match(cockpit,/body\.sf-cockpit-mode\.sf-simple-mode \.dashboard-row\{display:grid!important\}/,'chart must remain visible in compact mobile mode');
assert.match(cockpit,/sfAnalysisDock/,'raw analysis must be grouped into an advanced dock');
assert.match(cockpit,/sfSystemDock/,'system diagnostics must be grouped separately');
assert.match(cockpit,/R\/R at candle/,'chart crosshair context must expose reward\/risk');
assert.match(cockpit,/How SignalForge calculates these chart levels/,'chart must provide an on-demand calculation explainer');
assert.match(cockpit,/current saved decision levels/,'chart comparison must disclose that hovered candles use current saved levels');
assert.match(cockpit,/20-period average − 0\.40 ATR/,'entry formula must be explained');
assert.match(cockpit,/0\.35 ATR buffer/,'structure stop formula must be explained');
assert.doesNotMatch(cockpit,/\/api\/market-data/,'cockpit organization/hover visuals must not spend provider requests');
assert.match(cockpit,/\/api\/signals/,'cockpit may read saved signal state only');
assert.match(cockpit,/new MutationObserver\(scheduleOrganize\)/,'DOM organization must be debounced/idempotent');
assert.ok(pwa.indexOf("/trade-plan-ui.js")>=0&&pwa.indexOf("/cockpit-ui.js")>pwa.indexOf("/trade-plan-ui.js"),'cockpit must load after Trade Plan');
assert.match(sw,/signalforge-shell-v30-22/,'service worker shell must bump');
assert.match(sw,/'\/cockpit-ui\.js'/,'cockpit must be cached for installed PWA use');
assert.match(build,/version:'2\.30\.22'/,'visible version must bump');
assert.match(build,/shell:'v30-22'/,'visible shell must match service worker');

console.log('Stage 14.21 decision cockpit regression passed.');
