import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const chart=fs.readFileSync(new URL('../public/chart-adapter.js',import.meta.url),'utf8');

assert.match(index,/cacheOnly/,'market-data endpoint should support cache-only reads');
assert.match(index,/getCachedMarket\(env,symbol,timeframe,30\*86_400_000\)/,'cache-only path should read D1 directly');
assert.ok(index.indexOf("cacheOnly')==='1'") < index.indexOf('getMarketData(env,symbol,timeframe,false)'),'cache-only branch must execute before provider-backed market data');
assert.match(index,/cacheMiss:true/,'cache misses should be explicit');
assert.match(chart,/subscribeVisibleTimeRangeChange/,'LOD should react to chart zoom range');
assert.match(chart,/setTimeout\(\(\)=>probeFinerDetail\(range\),650\)/,'LOD probes should be debounced');
assert.match(chart,/cacheOnly=1/,'zoom probes must use cache-only market data');
assert.match(chart,/Zooming used 0 provider requests/,'cache misses should tell users zooming spent no provider requests');
assert.match(chart,/Load finer detail/,'provider-backed detail should require an explicit load control');
assert.match(chart,/loadPendingDetail/,'explicit load control should own on-demand detail fetching');
assert.match(chart,/Base view/,'LOD should provide a return to the base timeframe');
assert.match(chart,/restoreBaseView/,'base-view restoration should be implemented');
assert.match(chart,/coversRange/,'cached detail must cover the visible zoom window before switching');
assert.match(chart,/LOD_RULES/,'timeframe detail levels should be explicit');

console.log('Phase 7.4 regression checks passed.');
