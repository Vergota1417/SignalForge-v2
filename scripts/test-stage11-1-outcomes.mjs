import assert from 'node:assert/strict';
import { evaluateObservationOutcomes, firstHit, OUTCOME_HORIZONS } from '../src/outcomes.js';

const day=n=>Date.UTC(2026,7,n,0,0,0);
const candle=(n,open,high,low,close)=>({time:day(n),open,high,low,close,volume:1_000_000});
const observation={id:7,symbol:'TEST',observedAt:Date.UTC(2026,7,3,15,0,0),entryPrice:100,target:108,thesisBreak:95};
const candles=[
  candle(3,99,101,98,100),
  candle(4,100,103,99,102),
  candle(5,102,106,101,105),
  candle(6,105,109,104,108),
  candle(7,108,110,106,109),
  candle(10,109,111,107,110),
  candle(11,110,112,108,111),
  candle(12,111,113,109,112),
  candle(13,112,114,110,113),
  candle(14,113,115,111,114),
  candle(17,114,116,112,115),
  candle(18,115,117,113,116),
  candle(19,116,118,114,117),
  candle(20,117,119,115,118),
  candle(21,118,120,116,119),
  candle(24,119,121,117,120),
  candle(25,120,122,118,121),
  candle(26,121,123,119,122),
  candle(27,122,124,120,123),
  candle(28,123,125,121,124),
  candle(31,124,126,122,125)
];
const outcomes=evaluateObservationOutcomes(observation,candles,{now:Date.UTC(2026,8,1)});
assert.deepEqual(outcomes.map(x=>x.horizonSessions),OUTCOME_HORIZONS);
assert.equal(outcomes[0].outcomeSession,'2026-08-04','Same-day candle must not be treated as the one-session future outcome.');
assert.ok(Math.abs(outcomes[0].forwardReturn-.02)<1e-9);
assert.equal(outcomes.find(x=>x.horizonSessions===3).firstHit,'TARGET');
assert.equal(outcomes.find(x=>x.horizonSessions===3).targetHit,true);
assert.ok(outcomes.find(x=>x.horizonSessions===5).mfe>=.11);

const ambiguous=firstHit([candle(4,100,110,94,101)],{target:108,stop:95});
assert.equal(ambiguous.firstHit,'AMBIGUOUS_SAME_SESSION');
assert.equal(ambiguous.targetHit,true);
assert.equal(ambiguous.stopHit,true);

const stopFirst=firstHit([candle(4,100,102,94,96),candle(5,96,109,96,108)],{target:108,stop:95});
assert.equal(stopFirst.firstHit,'STOP');

console.log('Stage 11.1 outcome regression tests passed');
