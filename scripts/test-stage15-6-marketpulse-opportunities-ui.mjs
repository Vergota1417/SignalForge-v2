import assert from 'node:assert/strict';
import fs from 'node:fs';

// Stage 15.6 protects the user-facing distinction between discovery and trade readiness.
const ui=fs.readFileSync(new URL('../public/marketpulse-opportunities-ui.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.match(index,/marketpulse-opportunities-ui\.js/,'app shell must load the MarketPulse opportunities module');
assert.match(sw,/marketpulse-opportunities-ui\.js/,'PWA shell must cache the MarketPulse opportunities module');
const buildShell=build.match(/shell:'v(\d+)-(\d+)'/),workerShell=sw.match(/CACHE_NAME='signalforge-shell-v(\d+)-(\d+)'/);
assert.ok(buildShell,'MarketPulse build must expose a versioned PWA shell');
assert.ok(workerShell,'MarketPulse service worker must expose a versioned shell cache');
assert.deepEqual(workerShell.slice(1),buildShell.slice(1),'MarketPulse build and service-worker shells must match');
const shellMajor=Number(buildShell[1]),shellMinor=Number(buildShell[2]);
assert.ok(shellMajor>30||(shellMajor===30&&shellMinor>=39),'MarketPulse UI shell must never regress below v30-39');
assert.match(build,/version:'2\.30\.\d+'/,'MarketPulse UI must expose a visible 2.30.x build');
assert.match(ui,/Opportunity Score/,'mobile opportunities UI must label Opportunity Score explicitly');
assert.match(ui,/Trade Confidence/,'mobile opportunities UI must label Trade Confidence explicitly');
assert.match(ui,/high Opportunity Score is not a BUY signal/,'UI must warn that Opportunity Score does not authorize BUY');
assert.match(ui,/BUY NOW still requires the full SignalForge hard-gate path/,'UI must preserve hard-gate messaging');
assert.match(ui,/tradeConfidence===null\|\|r\.tradeConfidence===undefined/,'discovery-only candidates must render Trade Confidence as pending');
assert.match(ui,/slice\(0,6\)/,'Top Opportunities panel must stay concise on mobile');
assert.match(ui,/@media\(max-width:680px\)/,'MarketPulse opportunity cards must include phone-specific layout behavior');
assert.match(ui,/scanned ·/,'coverage indicator must surface scanned-universe progress');

console.log('Stage 15.6 MarketPulse opportunity UI regression checks passed.');
