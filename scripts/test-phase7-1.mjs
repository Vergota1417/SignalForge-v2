import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [adapter,pwa,serviceWorker]=await Promise.all([
  readFile(new URL('../public/chart-adapter.js',import.meta.url),'utf8'),
  readFile(new URL('../public/pwa.js',import.meta.url),'utf8'),
  readFile(new URL('../public/service-worker.js',import.meta.url),'utf8')
]);

assert.match(pwa,/lightweight-charts@5\.2\.1/,'Lightweight Charts must remain pinned to 5.2.1');
assert.match(pwa,/Canvas fallback remains active/,'Library-load failure must explicitly preserve the Canvas fallback');
assert.match(adapter,/if\(!LW\?\.createChart\)/,'Adapter must fail closed when Lightweight Charts is unavailable');
assert.match(adapter,/sf-lightweight-active/,'Existing Canvas must only be hidden after the new chart initializes');
assert.match(adapter,/CandlestickSeries/,'Foundation must render candlesticks');
assert.match(adapter,/HistogramSeries/,'Foundation must render volume');
assert.match(adapter,/Thesis break/,'Foundation must preserve thesis-break visualization');
assert.match(adapter,/Entry low/,'Foundation must preserve preferred-entry visualization');
assert.match(adapter,/Overextension/,'Foundation must preserve overextension visualization');
assert.match(adapter,/tradingview\.com/,'Required TradingView attribution link must remain present');
assert.match(serviceWorker,/chart-adapter\.js/,'Local chart adapter must be part of the PWA shell');

console.log('Phase 7.1 chart foundation regressions passed.');
