import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../public/chart-adapter.js',import.meta.url),'utf8');

assert.match(source,/createSeriesMarkers/,'Lightweight Charts series-marker plugin should be used when available.');
assert.match(source,/\/api\/alerts\?limit=50/,'Saved D1 signal transitions should feed public history markers.');
assert.match(source,/signalforge_push_test_token_v1/,'Private marker access must reuse authorized-phone credentials.');
assert.match(source,/\/api\/portfolio/,'Recorded purchases/current owned-position state should come from the protected portfolio API.');
assert.match(source,/\/api\/strategy/,'Current BUY WINDOW\/BUY CANDIDATE context should come from the protected strategy API.');
assert.match(source,/CURRENT \$\{state\}/,'Current portfolio state markers must be explicitly labeled as current.');
assert.match(source,/text:'BOUGHT'/,'Recorded purchase dates should render as chart markers.');
assert.match(source,/text:'BUY'/,'Saved BUY transitions should render as chart markers.');
assert.match(source,/text:'SELL'/,'Saved SELL transitions should render as chart markers.');
assert.match(source,/Markers on/,'Users should be able to toggle decision markers.');
assert.match(source,/dedupeMarkers/,'Duplicate marker labels on the same bar should be removed.');
assert.match(source,/slice\(-30\)/,'Marker density should be capped to protect chart readability.');

console.log('Phase 7.3 decision-history marker checks passed.');
