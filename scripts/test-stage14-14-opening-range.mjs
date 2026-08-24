import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessOpeningRange } from '../src/opening-range.js';

const BAR=15*60*1000;
function session(date,closes){
  const start=Date.parse(`${date}T13:30:00Z`); // 09:30 ET during EDT
  return closes.map((close,i)=>{const open=i?closes[i-1]:closes[0],hi=Math.max(open,close)+.08,lo=Math.min(open,close)-.08;return{time:start+i*BAR,open,high:hi,low:lo,close,volume:1000+i*10};});
}
function feed(current){
  const prior=session('2026-08-21',[100,100.1,100.2,100.15,100.25,100.3,100.35,100.4,100.45,100.4,100.5,100.55,100.6,100.65,100.7,100.75,100.8,100.85,100.9,100.95]);
  const live=session('2026-08-24',current);
  const incomplete={...live.at(-1),time:live.at(-1).time+BAR};
  return[...prior,...live,incomplete];
}

const accepted=assessOpeningRange(feed([100,100.1,100.2,100.3,100.55,100.62,100.58,100.66]),{currentPrice:100.66});
assert.equal(accepted.shadowOnly,true);
assert.equal(accepted.affectsBuyNow,false);
assert.equal(accepted.activeWindow,'60m');
assert.equal(accepted.direction,'UP');
assert.ok(['ACCEPTED','RETEST HELD'].includes(accepted.state),`expected upside acceptance, got ${accepted.state}`);
assert.ok(accepted.previousDay.high>accepted.previousDay.low);

const rejected=assessOpeningRange(feed([100,100.05,100.1,100.15,100.5,100.08,100.04,100.02]),{currentPrice:100.02});
assert.equal(rejected.state,'REJECTED');
assert.equal(rejected.direction,'UP');
assert.equal(rejected.affectsBuyNow,false);

const inside=assessOpeningRange(feed([100,100.05,100.1,100.15,100.12,100.08,100.1]),{currentPrice:100.1});
assert.equal(inside.state,'INSIDE RANGE');

const sessionRange=fs.readFileSync(new URL('../src/session-range.js',import.meta.url),'utf8');
assert.match(sessionRange,/openingRangeShadow/,'Room-to-run telemetry must carry opening-range shadow state.');
assert.match(sessionRange,/recordOpeningRangeShadow/,'Opening-range shadow observations must be persisted with the existing execution telemetry.');
const ui=fs.readFileSync(new URL('../public/opening-range-ui.js',import.meta.url),'utf8');
assert.match(ui,/Experimental only · does not block or create BUY NOW/,'Phone UI must clearly identify the model as shadow-only.');
const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');
assert.doesNotMatch(screener,/opening-range|openingRange/i,'Production screener must not use opening-range shadow directly while it is unvalidated.');

console.log('Stage 14.14 opening-range acceptance/rejection shadow regression checks passed.');
