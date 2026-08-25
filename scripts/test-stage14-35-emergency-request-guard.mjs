import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../public/api-request-policy.js');
const policy=globalThis.SignalForgeApiRequestPolicy;
const coordinator=fs.readFileSync(new URL('../public/api-request-coordinator.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.equal(policy.backgroundReadMs,5*60_000,'background browser reads must remain guarded at five minutes');
assert.equal(policy.cacheOnlyMarketDataMs,30*60_000,'cache-only market data must remain held for thirty minutes');
assert.equal(policy.ttlFor('/api/market-data?symbol=XOM&timeframe=6M&cacheOnly=1'),30*60_000,'cacheOnly market-data requests must remain recognized');
assert.match(coordinator,/SignalForgeApiRequestPolicy/,'page coordinator must use the central emergency policy');
assert.match(sw,/signalforge-api-snapshots-v\d+/,'service-worker API snapshots must remain versioned');
assert.match(sw,/SignalForgeApiRequestPolicy/,'service worker must use the same emergency policy');
assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/,'backend scheduler must remain on five-minute boundaries');
assert.match(wrangler,/"head_sampling_rate": 0\.1/,'observability sampling must stay reduced from full capture');
assert.match(build,/version:'2\.30\.\d+'/,'current release must expose a SignalForge 2.30.x version');
const swShell=sw.match(/CACHE_NAME='signalforge-shell-(v30-\d+)'/)?.[1];
const visibleShell=build.match(/shell:'(v30-\d+)'/)?.[1];
assert.ok(swShell&&visibleShell,'current release must expose versioned v30 shell metadata');
assert.equal(swShell,visibleShell,'service-worker shell must match visible build shell');

console.log('Stage 14.35/current emergency request guard regression checks passed.');
