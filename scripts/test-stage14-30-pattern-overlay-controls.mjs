import assert from 'node:assert/strict';
import fs from 'node:fs';

const hook=fs.readFileSync(new URL('../public/pattern-chart-hook.js',import.meta.url),'utf8');
const reliability=fs.readFileSync(new URL('../public/pattern-overlay-reliability.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const context=fs.readFileSync(new URL('../public/pattern-context-ui.js',import.meta.url),'utf8');

assert.match(hook,/sf-chart-overlay-bridge-v2/,'overlay bridge must use hardened v2 wiring');
assert.match(hook,/isCandlestick\|\|!isKnownOverlay/,'bridge must capture the primary candle series even if library function identity changes');
assert.match(hook,/normalizeTime/,'trend overlays must normalize millisecond and second timestamps');
assert.match(hook,/getOverlayState/,'bridge must expose actual rendered overlay counts');
assert.match(hook,/Price line failed/,'bridge must report failed price overlays instead of failing silently');

for(const label of ['Support','Resistance','Breakouts','Double','Triangles','H&S','Wedges','Labels'])assert.match(reliability,new RegExp(`${label}.*ON|${label}.*OFF`),`${label} control must expose explicit ON/OFF state`);
assert.match(reliability,/Channel.*AUTO/,'channel control must expose AUTO state');
assert.match(reliability,/bridge\.clearOverlays/,'reliable controls must clear the prior overlay set before redraw');
assert.match(reliability,/bridge\.addPriceLine/,'structure controls must draw price levels through the chart bridge');
assert.match(reliability,/bridge\.addTrendLine/,'pattern controls must draw trend lines through the chart bridge');
assert.match(reliability,/overlay.*drawn/i,'UI must report how many overlays actually reached the chart');
assert.match(reliability,/Breakout test overlaps Support/,'overlapping support/breakout levels must be explained');
assert.match(reliability,/Channel AUTO skipped/,'AUTO channel suppression must be visible instead of looking broken');
assert.doesNotMatch(reliability,/\/api\/market-data/,'overlay reliability must not spend market-data provider requests');
assert.match(reliability,/\/api\/signals/,'overlay reliability must use saved analysis only');

assert.ok(pwa.indexOf("/pattern-chart-hook.js")<pwa.indexOf("/chart-adapter.js"),'chart hook must load before chart adapter');
assert.ok(pwa.indexOf("/pattern-context-ui.js")<pwa.indexOf("/pattern-overlay-reliability.js"),'reliability layer must load after original pattern controls');
assert.match(sw,/signalforge-shell-v30-31/);
assert.match(sw,/'\/pattern-overlay-reliability\.js'/);
assert.match(build,/version:'2\.30\.31'/);
assert.match(build,/release:'pattern-overlay-control-reliability'/);
assert.match(context,/cannot authorize or block BUY NOW/,'pattern context must remain shadow-only');

console.log('Stage 14.30 pattern overlay control regression passed.');
