import fs from 'node:fs';
import assert from 'node:assert/strict';

const summary=fs.readFileSync(new URL('../public/decision-summary-ui.js',import.meta.url),'utf8');
const radar=fs.readFileSync(new URL('../src/radar.js',import.meta.url),'utf8');
const operations=fs.readFileSync(new URL('../public/operations-ui.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.match(summary,/DECISION SUMMARY/,'dormant decision summary implementation must retain the simplified decision heading');
assert.match(summary,/Why not buy\?/i,'summary must explain the blocker when reintroduced');
assert.match(summary,/What needs to happen next\?/i,'summary must explain the next required change when reintroduced');
assert.match(summary,/Next check/,'summary implementation must retain recheck timing');
assert.match(summary,/experimental/,'shadow evidence must remain visibly experimental');
assert.match(summary,/sf-simple-mode/,'advanced details must remain collapsible');
assert.match(summary,/1\.80:1/,'production reward\/risk requirement must be explained without changing it');
assert.match(radar,/PERMANENT_PROVIDER_RETIRE_MS=10\*365\*86_400_000/,'permanent provider rejects must not be retried after a short cooldown');
assert.match(radar,/radar_symbol_retired/,'provider-rejected symbols must be recorded as retired rather than active failures');
assert.match(radar,/retired\.length\?'OK'/,'a successfully retired bad symbol must not make the scanner unhealthy');
assert.match(operations,/provider-rejected symbol retired/,'operations UI must explain retired provider symbols');
assert.match(operations,/Latest actionable error/,'operations UI must distinguish actionable errors from retired-symbol maintenance');
assert.match(build,/version:'2\.30\.\d+'/,'production must expose a SignalForge 2.30.x build');

console.log('Stage 14.15 decision summary/provider retirement regression passed');
