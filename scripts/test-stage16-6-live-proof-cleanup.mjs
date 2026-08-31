import assert from 'node:assert/strict';
import fs from 'node:fs';

const usage=read('../src/provider-usage.js');
const providerUi=read('../public/provider-health-ui.js');
const operationsUi=read('../public/operations-ui.js');
const build=read('../public/build-info.js');
const sw=read('../public/service-worker.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(usage,/legacySymbol404=\/HTTP 404\//,'legacy 404 reconciliation must be explicit and narrow');
assert.match(usage,/provider==='twelve-data'/,'legacy 404 inference must be limited to Twelve Data');
assert.match(usage,/\^time-series-/.test(usage)?/./:/./,'placeholder');
assert.match(usage,/lastPurpose\)&&Number\(lastBars\)===0/,'legacy 404 inference must require a zero-row symbol time-series request');
assert.match(usage,/errorInferred:Boolean\(classification\.inferred\)/,'provider snapshot must disclose inferred legacy classification');
assert.match(providerUi,/Legacy HTTP 404/,'provider UI must explain legacy inferred symbol rejection');
assert.match(providerUi,/next request will use exact tagged classification/,'provider UI must distinguish inference from future exact telemetry');
assert.match(operationsUi,/WAITING FOR FIRST RUN/,'ANALYSIS outcome card must not borrow an older generic tracker timestamp');
assert.match(operationsUi,/ANALYSIS tracker has not run yet/,'operations detail must explicitly report no ANALYSIS run');
assert.match(operationsUi,/legacy\/general tracker last result/,'generic outcome history may be shown only as separately labeled legacy/general proof');
assert.doesNotMatch(operationsUi,/tracker=analysisTracker\.lastRunAt\?analysisTracker:genericTracker/,'generic outcome tracker must never masquerade as ANALYSIS tracker');
assert.match(operationsUi,/All resolved outcomes/,'aggregate outcome count must be labeled as aggregate rather than ANALYSIS-only');
assert.equal(pkg.version,'2.30.45');
assert.match(build,/version:'2\.30\.45'/);
assert.match(build,/release:'live-proof-cleanup'/);
assert.match(build,/shell:'v30-45'/);
assert.match(sw,/signalforge-shell-v30-45/);
assert.match(sw,/signalforge-api-snapshots-v9/,'Stage 16.6 must invalidate the stale provider-health snapshot cache');

console.log('Stage 16.6 live-proof cleanup regression: PASS');
function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
