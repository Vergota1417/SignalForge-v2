import assert from 'node:assert/strict';
import fs from 'node:fs';

const usage=read('../src/provider-usage.js');
const ui=read('../public/provider-health-ui.js');
const build=read('../public/build-info.js');
const sw=read('../public/service-worker.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(usage,/last_status='PENDING'/,'provider reservation must mark an upstream call pending immediately');
assert.match(usage,/pending=Math\.max\(0,requests-successes-errors\)/,'snapshot must reconcile unsettled provider calls');
assert.match(usage,/unattributedRequestsToday/,'snapshot must distinguish legacy/unattributed calls from per-provider calls');
assert.match(ui,/PENDING means the request was counted but has not yet settled/,'UI must explain pending state');
assert.match(ui,/Success \/ errors \/ pending/,'UI must show pending alongside settled outcomes');
assert.match(ui,/older\/unattributed/,'UI must identify requests that predate provider attribution');
assert.equal(pkg.version,'2.30.42');
assert.match(build,/version:'2\.30\.42'/);
assert.match(build,/shell:'v30-42'/);
assert.match(sw,/signalforge-shell-v30-42/);
assert.match(sw,/signalforge-api-snapshots-v6/,'provider health settle release must invalidate stale API snapshots');

console.log('Stage 16.3 provider health settle regression: PASS');
function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
