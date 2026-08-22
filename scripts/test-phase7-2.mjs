import fs from 'node:fs';
import assert from 'node:assert/strict';

const adapter=fs.readFileSync(new URL('../public/chart-adapter.js',import.meta.url),'utf8');
assert.ok(adapter.includes('subscribeCrosshairMove'),'crosshair synchronization must remain enabled');
assert.ok(adapter.includes('sfChartReadout'),'OHLCV readout must remain present');
assert.ok(adapter.includes('sfChartLatest'),'Latest control must remain present');
assert.ok(adapter.includes('sfChartReset'),'Reset view control must remain present');
assert.ok(adapter.includes('scrollToRealTime'),'Latest control must return to real time');
assert.ok(adapter.includes('fitContent'),'Reset view must restore full visible content');
assert.ok(adapter.includes('horzTouchDrag:true'),'mobile horizontal drag must stay enabled');
assert.ok(adapter.includes('pinch:true'),'mobile pinch zoom must stay enabled');
assert.ok(adapter.includes('O ${fmtPrice(c.open)}'),'readout must include open');
assert.ok(adapter.includes('V ${fmtVolume(c.volume)}'),'readout must include volume');
console.log('Stage 7.2 chart interaction regression checks passed.');
