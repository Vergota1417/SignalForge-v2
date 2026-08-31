import assert from 'node:assert/strict';
import fs from 'node:fs';

const trace=read('../src/execution-trace.js');
const entry=read('../src/entry.js');
const policy=read('../public/api-request-policy.js');
const ui=read('../public/execution-trace-ui.js');
const index=read('../public/index.html');
const sw=read('../public/service-worker.js');
const build=read('../public/build-info.js');
const pkg=JSON.parse(read('../package.json'));

for(const id of ['discovery','market_data','auction_method','signalforge_validation','final_decision','portfolio_alerts','outcome_tracking'])assert.match(trace,new RegExp(`stage\\('${id}'`),`trace must expose ${id}`);
assert.match(trace,/observationalOnly:true/,'execution trace must be observational only');
assert.match(trace,/affectsBuyNow:false/,'execution trace must never authorize BUY NOW');
assert.match(trace,/market_cache/,'market-data completion must be based on persisted market cache proof');
assert.match(trace,/signal_state/,'validation/final-decision completion must use persisted signal proof');
assert.match(trace,/evidence_outcomes/,'outcome stage must use persisted outcome proof');
assert.match(entry,/\/api\/execution-trace/,'production entry must expose execution trace endpoint');
assert.match(entry,/executionTraceAffectsBuyNow:false/,'health guardrails must state trace cannot affect BUY NOW');
assert.match(policy,/\/api\/execution-trace/,'trace polling must use central five-minute request policy');
assert.match(ui,/SignalForge Execution Trace/,'dashboard must visibly show execution trace');
assert.match(ui,/COMPLETE/,'trace UI must represent completed state');
assert.match(ui,/BLOCKED/,'trace UI must represent blocked state');
assert.match(index,/execution-trace-ui\.js/,'app shell must load execution trace UI');
assert.match(sw,/execution-trace-ui\.js/,'PWA must cache execution trace UI');
assert.equal(pkg.version,'2.30.43');
assert.match(build,/version:'2\.30\.43'/);
assert.match(build,/shell:'v30-43'/);
assert.match(sw,/signalforge-shell-v30-43/);
assert.match(sw,/signalforge-api-snapshots-v7/);

console.log('Stage 16.4 decision execution trace regression: PASS');
function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}