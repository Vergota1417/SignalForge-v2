import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-context-ui\.js'/,'pattern context polling UI must remain disabled');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-overlay-stable\.js'/,'pattern overlay network UI must remain disabled');
assert.match(pwa,/pattern-chart-hook\.js/,'zero-network overlay bridge may remain loaded');
assert.match(pwa,/chart-control-reliability\.js/,'chart navigation controls must remain loaded');
assert.doesNotMatch(sw,/pattern-context-ui\.js/,'disabled pattern polling UI must not be precached');
assert.doesNotMatch(sw,/pattern-overlay-stable\.js/,'disabled stable pattern network UI must not be precached');
assert.match(build,/2\.30\.36/,'rollback-safe release must advance');
assert.match(sw,/signalforge-shell-v30-36/,'PWA shell must advance to evict older aggressive scripts');

console.log('Stage 14.36 pattern network layer disable regression checks passed.');
