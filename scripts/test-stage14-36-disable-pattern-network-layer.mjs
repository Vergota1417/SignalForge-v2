import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-context-ui\.js'/,'pattern context polling UI must remain disabled');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-overlay-(?:stable|reliability)\.js'/,'pattern overlay network UI must remain disabled');
assert.match(pwa,/pattern-chart-hook\.js/,'zero-network overlay bridge may remain loaded');
assert.match(pwa,/chart-control-reliability\.js/,'chart navigation controls must remain loaded');
assert.doesNotMatch(sw,/pattern-context-ui\.js/,'disabled pattern polling UI must not be precached');
assert.doesNotMatch(sw,/pattern-overlay-(?:stable|reliability)\.js/,'disabled pattern network UI must not be precached');
assert.match(build,/version:'2\.30\.\d+'/,'current release must remain a versioned SignalForge 2.30.x build');
const shell=build.match(/shell:'(v30-\d+)'/)?.[1];assert.ok(shell,'visible build must expose its PWA shell');
assert.ok(sw.includes(`signalforge-shell-${shell}`),'PWA shell must match visible build metadata so quarantined scripts are evicted');

console.log('Stage 14.36/current pattern network quarantine regression checks passed.');
