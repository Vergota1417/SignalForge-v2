import assert from 'node:assert/strict';
import { composeDiscoveryPool, composeWeeklyShortlist } from '../src/discovery.js';
import { scoreQuote } from '../src/radar.js';

const pool=composeDiscoveryPool({
  pinned:['USER1','AAPL'],
  core:['AAPL','MSFT','NVDA'],
  promising:['NVDA','PLTR','SOFI'],
  exploration:['XYZ','ABC'],
  limit:7
});
assert.deepEqual(pool,['USER1','AAPL','MSFT','NVDA','PLTR','SOFI','XYZ'],'Discovery pool must preserve priority, deduplicate symbols, and respect the cap.');

const weekly=composeWeeklyShortlist({
  pinned:['PIN1'],
  previous:['PREV1','PIN1'],
  leaders:['LEAD1','LEAD2'],
  exploration:['EXP1'],
  core:['CORE1','CORE2'],
  limit:6
});
assert.deepEqual(weekly,['PIN1','PREV1','LEAD1','LEAD2','EXP1','CORE1'],'Weekly shortlist must promote pinned, prior candidates, leaders, and exploration in that order.');
assert.ok(weekly.length<=36,'Weekly research shortlist must remain inside the planned deep-research capacity.');

const normal=scoreQuote({price:50,changePct:3,volume:2_000_000,averageVolume:1_000_000,relativeVolume:2});
const chased=scoreQuote({price:50,changePct:14,volume:2_000_000,averageVolume:1_000_000,relativeVolume:2});
assert.ok(normal>chased,'Discovery score must penalize extreme same-day chase moves.');
assert.equal(scoreQuote({price:2,changePct:3,volume:2_000_000,averageVolume:1_000_000,relativeVolume:2}),-999,'Low-priced names must be filtered from discovery ranking.');

console.log('phase5 discovery regression tests passed');
