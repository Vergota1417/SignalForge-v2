import assert from 'node:assert/strict';
import { parseProviderTime, validCandle, dedupeAndSortCandles, minimumHistory } from '../src/market.js';
import { weeklyBatchTime, nextDiscoveryRun } from '../src/analysis-expectation.js';

assert.equal(Number.isNaN(parseProviderTime('garbage')),true,'Malformed provider time must fail closed instead of becoming Date.now().');
assert.equal(parseProviderTime('2026-08-21 20:00:00'),Date.parse('2026-08-21T20:00:00Z'),'UTC provider timestamps must parse consistently.');
assert.equal(parseProviderTime('2026-08-21T20:00:00Z'),Date.parse('2026-08-21T20:00:00Z'),'Already-zoned timestamps must not receive a second Z.');

assert.equal(validCandle({time:1,open:100,high:105,low:95,close:102,volume:1000}),true);
assert.equal(validCandle({time:1,open:100,high:99,low:95,close:102,volume:1000}),false,'Impossible OHLC relationships must be rejected.');
assert.equal(validCandle({time:1,open:100,high:105,low:95,close:102,volume:-1}),false,'Negative volume must be rejected.');

const deduped=dedupeAndSortCandles([
  {time:3,open:100,high:105,low:95,close:102,volume:1000},
  {time:1,open:100,high:105,low:95,close:101,volume:1000},
  {time:3,open:100,high:106,low:95,close:103,volume:1100}
]);
assert.deepEqual(deduped.map(x=>x.time),[1,3],'Candles must be sorted and duplicate timestamps removed.');
assert.equal(deduped[1].close,103,'Latest duplicate payload should win.');
assert.equal(minimumHistory('1Y'),120);
assert.equal(minimumHistory('6M'),100);

const friFirst=weeklyBatchTime('2026-08-17',0);
const friSecond=weeklyBatchTime('2026-08-17',6);
assert.equal(friSecond-friFirst,15*60*1000,'Each six-symbol Friday batch should be spaced 15 minutes apart.');
const discovery=nextDiscoveryRun(Date.parse('2026-08-17T13:00:00Z'),0);
assert.ok(discovery>Date.parse('2026-08-17T13:00:00Z'),'Discovery ETA must resolve to a future scheduled scan.');

console.log('phase6 regression tests passed');
