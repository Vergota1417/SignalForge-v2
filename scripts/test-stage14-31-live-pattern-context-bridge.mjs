import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlay=fs.readFileSync(new URL('../public/pattern-overlay-reliability.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');

assert.match(overlay,/cacheOnly=1/,'overlay recovery must read current chart cache without a provider request');
assert.match(overlay,/\/api\/signals/,'saved signal context remains the first persisted source');
assert.match(overlay,/\['6M','3M','1Y'\]/,'overlay recovery must try cached daily-analysis timeframes');
assert.match(overlay,/source:`\$\{timeframe\} chart cache`/,'status must identify chart-cache source');
assert.match(overlay,/current chart has no cached pattern context yet/,'missing context must be explicit instead of implying another scanner cycle is required');
assert.doesNotMatch(overlay,/Waiting for saved structure data for this ticker/,'old misleading wait-for-saved-data message must be removed');
assert.match(overlay,/Structure values are visible above, but the drawing context has not synchronized yet/,'visible panel data and drawing sync must be treated as the same-session problem');
assert.match(build,/2\.30\.32/,'visible release must advance');
assert.match(build,/live-pattern-context-bridge/,'release name must identify live context bridge');
assert.match(sw,/signalforge-shell-v30-32/,'PWA shell must advance so installed clients receive the fix');

console.log('Stage 14.31 live pattern context bridge regression checks passed.');
