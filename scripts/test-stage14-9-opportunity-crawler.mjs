import fs from 'node:fs';
import assert from 'node:assert/strict';

const crawler=fs.readFileSync('public/crawler-ui.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/service-worker.js','utf8');
const build=fs.readFileSync('public/build-info.js','utf8');

assert.match(crawler,/\/api\/opportunity-radar/,'crawler must reuse saved Opportunity Radar data');
assert.doesNotMatch(crawler,/api\.twelvedata\.com|TWELVE_DATA_API_KEY/,'crawler must not call Twelve Data directly');
assert.match(crawler,/group\+group/,'crawler must duplicate its group for a seamless loop');
assert.match(crawler,/sfCrawlerMove/,'crawler must include continuous animation');
assert.match(crawler,/setInterval\(refresh,60_000\)/,'crawler must refresh saved Radar data once per minute');
assert.match(crawler,/togglePause/,'crawler must expose pause and resume');
assert.match(crawler,/loadSymbol/,'crawler items must load the selected stock');
assert.match(crawler,/prefers-reduced-motion/,'crawler must respect reduced-motion preferences');
assert.match(index,/crawler-ui\.js/,'crawler UI must be loaded by the app shell');
assert.match(sw,/crawler-ui\.js/,'crawler UI must be cached by the PWA');
assert.match(sw,/signalforge-shell-v30-10/,'crawler release must bump the PWA shell');
assert.match(build,/version:'2\.30\.10'/,'crawler release must expose v2.30.10');

console.log('Stage 14.9 Opportunity Radar crawler regression checks passed.');
