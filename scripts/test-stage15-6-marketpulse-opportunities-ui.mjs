import assert from 'node:assert/strict';
import fs from 'node:fs';

// Stage 15.6 protects the user-facing distinction between discovery and trade readiness.
// The historical Stage 15.6 filename remains for test continuity; the product surface is SignalForge only.
const ui=fs.readFileSync(new URL('../public/signalforge-opportunities-ui.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.match(index,/signalforge-opportunities-ui\.js/,'app shell must load the SignalForge opportunities module');
assert.match(sw,/signalforge-opportunities-ui\.js/,'PWA shell must cache the SignalForge opportunities module');
assert.doesNotMatch(index,/marketpulse-opportunities-ui\.js/i,'app shell must not load the retired MarketPulse module');
assert.doesNotMatch(sw,/marketpulse-opportunities-ui\.js/i,'PWA shell must not cache the retired MarketPulse module');
assert.doesNotMatch(ui,/MarketPulse/,'user-facing discovery module must use SignalForge branding only');
const workerShell=sw.match(/signalforge-shell-v(\d+)-(\d+)/),buildShell=build.match(/shell:'v(\d+)-(\d+)'/);
assert.ok(workerShell,'SignalForge discovery UI must remain in a versioned PWA shell');
assert.ok(buildShell,'visible build must expose the versioned PWA shell');
assert.deepEqual(workerShell.slice(1),buildShell.slice(1),'build shell must match the service worker shell');
const shellMajor=Number(workerShell[1]),shellMinor=Number(workerShell[2]);
assert.ok(shellMajor>30||(shellMajor===30&&shellMinor>=39),'SignalForge discovery PWA shell must never regress below v30-39');
assert.match(build,/version:'2\.30\.\d+'/,'SignalForge discovery release must expose a visible 2.30.x build');
assert.match(ui,/Opportunity Score/,'mobile opportunities UI must label Opportunity Score explicitly');
assert.match(ui,/Trade Confidence/,'mobile opportunities UI must label Trade Confidence explicitly');
assert.match(ui,/high Opportunity Score is not a BUY signal/,'UI must warn that Opportunity Score does not authorize BUY');
assert.match(ui,/BUY NOW still requires the full SignalForge hard-gate path/,'UI must preserve hard-gate messaging');
assert.match(ui,/tradeConfidence===null\|\|r\.tradeConfidence===undefined/,'discovery-only candidates must render Trade Confidence as pending');
assert.match(ui,/slice\(0,6\)/,'Top Opportunities panel must stay concise on mobile');
assert.match(ui,/@media\(max-width:680px\)/,'SignalForge opportunity cards must include phone-specific layout behavior');
assert.match(ui,/scanned ·/,'coverage indicator must surface scanned-universe progress');

console.log('Stage 15.6 SignalForge opportunity UI regression checks passed.');
