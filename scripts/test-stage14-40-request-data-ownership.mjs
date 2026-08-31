import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../public/api-request-policy.js');
const policy=globalThis.SignalForgeApiRequestPolicy;
assert.ok(policy,'shared API request policy must initialize');
assert.equal(policy.backgroundReadMs,5*60_000,'background snapshot reads must remain at least five minutes');
assert.equal(policy.cacheOnlyMarketDataMs,30*60_000,'cache-only market-data reads must remain thirty minutes');
assert.equal(policy.ttlFor('/api/signals'),5*60_000);
assert.equal(policy.ttlFor('/api/opportunity-radar'),5*60_000);
assert.equal(policy.ttlFor('/api/trade-plan?symbol=TEST'),5*60_000,'trade-plan polling must not bypass the central request guard');
assert.equal(policy.ttlFor('/api/market-data?symbol=TEST&timeframe=6M&cacheOnly=1'),30*60_000);
assert.equal(policy.ttlFor('/api/market-data?symbol=TEST&timeframe=6M'),0,'direct user market-data loads must not be converted into background snapshots');
assert.equal(policy.ttlFor('/api/portfolio'),0,'private portfolio data must not be placed in the public snapshot policy');

const coordinator=read('../public/api-request-coordinator.js');
const sw=read('../public/service-worker.js');
const html=read('../public/index.html');
const pwa=read('../public/pwa.js');
const build=read('../public/build-info.js');

assert.match(coordinator,/SignalForgeApiRequestPolicy/,'page coordinator implementation must consume the shared policy');
assert.doesNotMatch(coordinator,/TTL_BY_PATH|new Map\(\[\s*\['\/api\/signals'/,'coordinator must not own a second endpoint TTL map');
assert.match(sw,/importScripts\('\/api-request-policy\.js'\)/,'service worker must load the shared policy');
assert.match(sw,/REQUEST_POLICY\?\.ttlFor/,'service worker must delegate API TTL decisions to the shared policy');
assert.doesNotMatch(sw,/API_TTL_MS=new Map/,'service worker must not own a second endpoint TTL map');
assert.doesNotMatch(html,/<script\b/i,'zero-data Dashboard must have no active page request owner yet');
assert.doesNotMatch(html,/\/api\//i,'zero-data Dashboard must reference no API routes');
assert.match(sw,/\/api-request-policy\.js/,'shared policy must remain available to the PWA/service-worker layer');

const buildShell=build.match(/shell:'v(\d+)-(\d+)'/);
const workerShell=sw.match(/CACHE_NAME='signalforge-shell-v(\d+)-(\d+)'/);
assert.ok(buildShell,'build-info must expose a versioned PWA shell');
assert.ok(workerShell,'service worker must expose a versioned PWA cache shell');
assert.deepEqual(workerShell.slice(1),buildShell.slice(1),'service worker shell must match build-info shell');
const shellMajor=Number(buildShell[1]),shellMinor=Number(buildShell[2]);
assert.ok(shellMajor>30||(shellMajor===30&&shellMinor>=38),'request ownership shell must never regress below v30-38');

assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-context-ui\.js'/,'disabled Pattern network UI must remain disabled');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-overlay-(?:stable|reliability)\.js'/,'disabled Pattern overlay network layer must remain disabled');

const recurringOwners={
  '../public/decision-summary-ui.js':['/api/signals'],
  '../public/watchlist-ui.js':['/api/signals'],
  '../public/activity-rhythm-ui.js':['/api/signals'],
  '../public/session-range-ui.js':['/api/signals'],
  '../public/opening-range-ui.js':['/api/signals'],
  '../public/cockpit-ui.js':['/api/signals'],
  '../public/unified-action-ui.js':['/api/signals','/api/opportunity-radar'],
  '../public/radar-ui.js':['/api/opportunity-radar'],
  '../public/operations-ui.js':['/api/operations-status'],
  '../public/telemetry-ui.js':['/api/health','/api/research-status','/api/screener','/api/evidence-evaluation','/api/evidence-optimization'],
  '../public/trade-plan-ui.js':['/api/trade-plan']
};
for(const [file,endpoints] of Object.entries(recurringOwners)){
  const text=read(file);
  assert.match(text,/setInterval\(/,`${file} dormant implementation must retain explicit recurring behavior until its later event/subscription redesign`);
  for(const endpoint of endpoints){
    assert.ok(text.includes(endpoint),`${file} must still document its former consumption of ${endpoint}`);
    assert.ok(policy.ttlFor(endpoint)>0,`${endpoint} must remain governed by central request policy before any block is reintroduced`);
  }
}

const latency=read('../public/detection-latency-ui.js');
assert.match(latency,/setTimeout\(watch,1500\)/,'latency UI may watch selected-symbol changes locally when reintroduced');
assert.match(latency,/if\(valid\(s\)&&s!==lastSymbol\)refresh\(\)/,'1.5-second latency watcher must not become a 1.5-second network poll');

console.log('Stage 14.40 centralized request/data ownership regression passed.');

function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
