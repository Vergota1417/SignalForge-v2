import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../public/api-request-policy.js');
const policy=globalThis.SignalForgeApiRequestPolicy;
const coordinator=fs.readFileSync(new URL('../public/api-request-coordinator.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.doesNotMatch(index,/<script\b/i,'zero-data Dashboard must execute no browser request modules');
assert.doesNotMatch(index,/\/api\//i,'zero-data Dashboard must contain no API route references');
assert.match(coordinator,/SignalForgeApiRequestPolicy/,'dormant browser requests must use the central request policy when modules are reintroduced');
assert.match(coordinator,/inflight/,'concurrent duplicate requests must be coalesced');
assert.match(coordinator,/memoryHits/,'browser snapshot reuse must be tracked');
assert.equal(policy.ttlFor('/api/signals'),5*60_000,'signals must preserve the five-minute emergency guard');
assert.equal(policy.ttlFor('/api/market-data?symbol=TEST&timeframe=6M&cacheOnly=1'),30*60_000,'cache-only market data must preserve 30-minute reuse');
assert.match(sw,/API_CACHE_NAME='signalforge-api-snapshots-v\d+'/,'service worker must share versioned API snapshots across controlled tabs');
assert.match(sw,/apiSnapshot\(event,request,ttl\)/,'read-only snapshot routes must be intercepted before network');
assert.match(sw,/SignalForgeApiRequestPolicy/,'service worker must consume the same request policy as future page modules');
assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/,'cron must wake every five minutes instead of every minute');
assert.doesNotMatch(wrangler,/"crons": \["\* \* \* \* \*"\]/,'one-minute cron must not return');
assert.match(build,/version:'2\.30\.\d+'/,'production must expose a current SignalForge 2.30.x build');
assert.match(sw,/signalforge-shell-v30-\d+/,'PWA must use a versioned v30 shell');

console.log('Stage 14.33/current resource-usage guard regression checks passed.');
