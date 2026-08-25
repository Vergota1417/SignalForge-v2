import assert from 'node:assert/strict';
import fs from 'node:fs';

const coordinator=fs.readFileSync(new URL('../public/api-request-coordinator.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.match(coordinator,/FIVE_MINUTES=5\*60_000/,'background browser reads must have a five-minute ceiling');
assert.match(coordinator,/THIRTY_MINUTES=30\*60_000/,'cache-only market data must be held for thirty minutes');
assert.match(coordinator,/cacheOnly'\)===['"]1['"]/,'cacheOnly market-data requests must be recognized');
assert.match(sw,/signalforge-api-snapshots-v2/,'emergency service-worker cache must replace the old short cache');
assert.match(sw,/FIVE_MINUTES=5\*60_000/,'service worker must suppress repeated dashboard reads for five minutes');
assert.match(sw,/THIRTY_MINUTES=30\*60_000/,'service worker must suppress repeated cache-only market-data reads for thirty minutes');
assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/,'backend scheduler must remain on five-minute boundaries');
assert.match(wrangler,/"head_sampling_rate": 0\.1/,'observability sampling must stay reduced from full capture');
assert.match(build,/version:'2\.30\.\d+'/,'current release must expose a SignalForge 2.30.x version');
const swShell=sw.match(/CACHE_NAME='signalforge-shell-(v30-\d+)'/)?.[1];
const visibleShell=build.match(/shell:'(v30-\d+)'/)?.[1];
assert.ok(swShell&&visibleShell,'current release must expose versioned v30 shell metadata');
assert.equal(swShell,visibleShell,'service-worker shell must match visible build shell');

console.log('Stage 14.35/current emergency request guard regression checks passed.');
