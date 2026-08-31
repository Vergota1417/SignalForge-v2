import assert from 'node:assert/strict';
import fs from 'node:fs';

const usage=read('../src/provider-usage.js');
const gateway=read('../src/market-data-gateway.js');
const entry=read('../src/entry.js');
const policy=read('../public/api-request-policy.js');
const ui=read('../public/provider-health-ui.js');
const index=read('../public/index.html');
const sw=read('../public/service-worker.js');
const build=read('../public/build-info.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(usage,/provider_api_daily/,'provider health must persist per-provider daily request counts');
assert.match(usage,/provider_api_health/,'provider health must persist last success/failure details');
assert.match(usage,/recordProviderSuccess/,'provider health must record successful upstream calls');
assert.match(usage,/recordProviderFailure/,'provider health must record failed upstream calls');
assert.match(gateway,/reserveProviderPurpose\(env,purpose,'alpaca'\)/,'Alpaca candle requests must consume the shared provider quota');
assert.match(gateway,/candidate==='alpaca'&&!alpacaCacheHit/,'Alpaca in-memory search cache hits must not count as upstream API requests');
assert.match(gateway,/recordProviderSuccess/,'provider-neutral gateway must report successful upstream requests');
assert.match(gateway,/recordProviderFailure/,'provider-neutral gateway must report failed upstream requests');
assert.match(entry,/\/api\/provider-health/,'production entry must expose provider health');
assert.match(entry,/getProviderHealthSnapshot/,'provider health endpoint must read persisted telemetry');
assert.match(policy,/\/api\/provider-health/,'provider health polling must use the central request policy');
assert.match(ui,/API \/ Data Health/,'dashboard must visibly identify the API health panel');
assert.match(ui,/Requests today/,'dashboard must show per-provider request counts');
assert.match(ui,/Success \/ errors/,'dashboard must show per-provider success/error counts');
assert.match(ui,/Last success/,'dashboard must show the last successful upstream contact');
assert.match(index,/provider-health-ui\.js/,'app shell must load provider health UI');
assert.match(sw,/provider-health-ui\.js/,'PWA shell must cache provider health UI');
assert.match(sw,/signalforge-shell-v30-41/,'provider health release must bump PWA shell');
assert.equal(pkg.version,'2.30.41');
assert.match(build,/version:'2\.30\.41'/);
assert.match(build,/shell:'v30-41'/);

console.log('Stage 16.2 provider API health regression: PASS');
function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
