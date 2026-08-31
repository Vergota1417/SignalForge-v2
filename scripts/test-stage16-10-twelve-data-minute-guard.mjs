import assert from 'node:assert/strict';
import fs from 'node:fs';
import { twelveDataRateConfig } from '../src/provider-usage.js';

const read=relative=>fs.readFileSync(new URL(relative,import.meta.url),'utf8');
const usage=read('../src/provider-usage.js');
const ui=read('../public/provider-health-ui.js');
const db=read('../src/db.js');
const build=read('../public/build-info.js');
const sw=read('../public/service-worker.js');
const pkg=JSON.parse(read('../package.json'));

const standard=twelveDataRateConfig({});
assert.equal(standard.maxPerMinute,7,'Basic 8 plan must retain one request/minute of headroom');
assert.ok(standard.minSpacingMs>=9_000,'global Twelve Data calls must be spaced by at least 9 seconds');
assert.ok(standard.maxLocalWaitMs<=standard.minSpacingMs,'local queue must stay bounded instead of creating an unbounded Worker backlog');
const clamped=twelveDataRateConfig({TWELVE_DATA_MAX_REQUESTS_PER_MINUTE:99});
assert.equal(clamped.maxPerMinute,7,'environment configuration must not accidentally remove Basic 8 safety headroom');
const lower=twelveDataRateConfig({TWELVE_DATA_MAX_REQUESTS_PER_MINUTE:4});
assert.equal(lower.maxPerMinute,4);
assert.ok(lower.minSpacingMs>=15_000,'lower configured limits must increase spacing accordingly');

assert.match(usage,/CREATE TABLE IF NOT EXISTS provider_rate_limit/,'D1 must own a global cross-isolate rate reservation row');
assert.match(usage,/MAX\(provider_rate_limit\.next_allowed_at,excluded\.last_reserved_at\)/,'rate reservation must serialize callers from the persisted next slot');
assert.match(usage,/providerRequestStarted=false/,'a local throttle must explicitly state that Twelve Data was never contacted');
assert.match(usage,/\[LOCAL_RATE_LIMIT\]/,'local throttling must use a distinct tagged error');
assert.match(usage,/if\(\/\\\[LOCAL_RATE_LIMIT\\\]\/i\.test\(message\)\)return\{skipped:true,localThrottle:true\}/,'local throttles must not increment provider failure counters');
assert.match(usage,/throttled_requests=throttled_requests\+1/,'locally rejected bursts must remain observable');
assert.match(usage,/delayed_requests=provider_rate_limit\.delayed_requests\+/,'briefly queued requests must remain observable');

assert.match(ui,/SignalForge minute safety/,'System provider health must display the minute guard');
assert.match(ui,/Local ceiling/,'provider health must show the local requests-per-minute ceiling');
assert.match(ui,/Minimum spacing/,'provider health must show enforced spacing');
assert.match(ui,/Delayed \/ throttled/,'provider health must show queue/throttle proof');
assert.match(ui,/Local throttles never reach Twelve Data and are not counted as provider failures/,'UI must explain local throttling truthfully');

assert.match(db,/MAX_PROVIDER_REQUESTS_PER_DAY/,'existing daily quota guard must remain active');
assert.match(db,/clampInt\(env\.MAX_PROVIDER_REQUESTS_PER_DAY,\s*50,\s*5000,\s*700\)/,'internal daily safety cap must remain 700, below the 800-credit provider plan');
assert.equal(pkg.version,'2.30.49');
assert.match(build,/version:'2\.30\.49'/);
assert.match(build,/release:'twelve-data-minute-guard'/);
assert.match(build,/shell:'v30-49'/);
assert.match(sw,/signalforge-shell-v30-49/,'PWA must invalidate the previous provider-health UI');
assert.match(sw,/signalforge-api-snapshots-v11/,'provider-health response shape change must invalidate stale API snapshots');

console.log('Stage 16.10 Twelve Data minute guard regression: PASS');
