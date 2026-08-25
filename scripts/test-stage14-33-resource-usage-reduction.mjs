import assert from 'node:assert/strict';
import fs from 'node:fs';

const coordinator=fs.readFileSync(new URL('../public/api-request-coordinator.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.match(index,/api-request-coordinator\.js/,'API coordinator must load before dashboard modules');
assert.match(coordinator,/\/api\/signals/,'signals polling must be coordinated');
assert.match(coordinator,/inflight/,'concurrent duplicate requests must be coalesced');
assert.match(coordinator,/memoryHits/,'browser snapshot reuse must be tracked');
assert.match(coordinator,/const FIVE_MINUTES=5\*60_000/,'background browser snapshots must preserve the five-minute emergency guard');
assert.match(coordinator,/\['\/api\/signals',FIVE_MINUTES\]/,'signals must use the guarded background-read interval');
assert.match(coordinator,/cacheOnly[^\n]*THIRTY_MINUTES/,'cache-only market data must preserve 30-minute reuse');
assert.match(sw,/API_CACHE_NAME='signalforge-api-snapshots-v\d+'/,'service worker must share versioned API snapshots across controlled tabs');
assert.match(sw,/apiSnapshot\(event,request,ttl\)/,'read-only snapshot routes must be intercepted before network');
assert.match(sw,/\['\/api\/signals',FIVE_MINUTES\]/,'service worker signals snapshot must match the five-minute browser guard');
assert.match(sw,/cacheOnly[^\n]*THIRTY_MINUTES/,'service worker cache-only market data must preserve 30-minute reuse');
assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/,'cron must wake every five minutes instead of every minute');
assert.doesNotMatch(wrangler,/"crons": \["\* \* \* \* \*"\]/,'one-minute cron must not return');
assert.match(build,/version:'2\.30\.\d+'/,'production must expose a current SignalForge 2.30.x build');
assert.match(sw,/signalforge-shell-v30-\d+/,'PWA must use a versioned v30 shell');

console.log('Stage 14.33/current resource-usage guard regression checks passed.');
