import assert from 'node:assert/strict';
import fs from 'node:fs';

const controls=fs.readFileSync(new URL('../public/chart-control-reliability.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../public/chart-adapter.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const evidence=fs.readFileSync(new URL('../src/evidence.js',import.meta.url),'utf8');
const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');

for(const id of ['sfChartBase','sfChartMarkers','sfChartLatest','sfChartReset']){
  assert.match(controls,new RegExp(id),`${id} must be protected by the reliability layer`);
  assert.match(adapter,new RegExp(id),`${id} must still be owned by the live chart adapter`);
}
assert.match(controls,/document\.addEventListener\('click',[\s\S]*true\)/,'chart controls need a capture-phase observation path');
assert.match(controls,/queueMicrotask\(\(\)=>reinforce/,'chart controls need a post-handler reliability check');
assert.match(controls,/timeScale\(\)\?\.scrollToRealTime/,'Latest fallback must directly command the live chart');
assert.match(controls,/timeScale\(\)\?\.fitContent/,'Reset fallback must directly fit live chart content');
assert.match(controls,/active\.click\(\)/,'Base-view fallback must be able to reload the active timeframe');
assert.match(controls,/pointer-events:auto!important/,'toolbar/buttons must remain pointer-addressable');
assert.match(controls,/touch-action:manipulation!important/,'toolbar buttons must be hardened for mobile taps');
assert.match(controls,/z-index:32/,'buttons must remain above injected chart overlays');
assert.match(controls,/Chart controls ready/,'each command must expose visible interaction feedback');
assert.match(controls,/aria-controls/,'buttons must expose their chart target');
assert.match(controls,/aria-pressed/,'marker toggle must expose state');

const hook=pwa.indexOf("/pattern-chart-hook.js"),adapterPos=pwa.indexOf("/chart-adapter.js"),controlsPos=pwa.indexOf("/chart-control-reliability.js"),pattern=pwa.indexOf("/pattern-context-ui.js");
assert.ok(hook>=0&&adapterPos>hook,'pattern bridge must still load before chart adapter');
assert.ok(controlsPos>adapterPos,'control reliability must load after the chart exists');
assert.ok(pattern>controlsPos,'pattern controls must load after chart control hardening');
assert.match(sw,/signalforge-shell-v30-30/,'PWA shell must advance so installed apps receive the fix');
assert.match(sw,/'\/chart-control-reliability\.js'/,'reliability asset must be cached for the installed app');
assert.match(build,/version:'2\.30\.30'/);
assert.match(build,/release:'chart-control-reliability'/);
assert.match(build,/shell:'v30-30'/);

assert.match(evidence,/rewardRiskMin:1\.8/,'1.80:1 production R/R must remain unchanged');
assert.match(screener,/NEAR_READY_RECHECK_MS=15\*60\*1000/,'15-minute execution cadence must remain unchanged');
assert.match(screener,/PRIORITY_PULSE_MS=5\*60\*1000/,'5-minute priority pulse must remain unchanged');

console.log('Stage 14.29 chart control reliability regression passed');
