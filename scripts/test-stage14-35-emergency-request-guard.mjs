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
assert.match(wrangler,/"head_sampling_rate": 0\.1/,'observability sampling must be reduced from full capture');
assert.match(build,/2\.30\.35/,'visible release must advance');
assert.match(build,/emergency-request-guard/,'release must identify the emergency usage fix');
assert.match(sw,/signalforge-shell-v30-35/,'PWA shell must advance so clients receive the emergency guard');

console.log('Stage 14.35 emergency request guard regression checks passed.');
