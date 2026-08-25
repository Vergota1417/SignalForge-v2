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
assert.match(coordinator,/memoryHits/,'short-lived browser snapshot reuse must be tracked');
assert.match(sw,/API_CACHE_NAME='signalforge-api-snapshots-v1'/,'service worker must share API snapshots across controlled tabs');
assert.match(sw,/apiSnapshot\(event,request,ttl\)/,'read-only snapshot routes must be intercepted before network');
assert.match(sw,/\['\/api\/signals',55_000\]/,'signals snapshot TTL must prevent duplicate one-minute module polls');
assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/,'cron must wake every five minutes instead of every minute');
assert.doesNotMatch(wrangler,/"crons": \["\* \* \* \* \*"\]/,'one-minute cron must not return');
assert.match(build,/2\.30\.33/,'visible version must advance');
assert.match(build,/resource-usage-reduction/,'release name must identify the usage fix');
assert.match(sw,/signalforge-shell-v30-33/,'PWA shell must advance so clients receive the fix');

console.log('Stage 14.33 resource usage regression checks passed.');
