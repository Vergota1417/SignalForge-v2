import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluatePatternEvidenceRows } from '../src/pattern-evaluation.js';

const rows=[];
for(let i=0;i<20;i++){
  const observedAt=Date.UTC(2026,0,2+i,17,0,0);
  rows.push(makeRow({symbol:'AAA',observedAt,pattern:'DOUBLE BOTTOM',state:'CONFIRMED',confidence:82,forwardReturn:.02+i*.0002,marketExcessReturn:.008,sectorExcessReturn:.005}));
}
rows.push(makeRow({symbol:'AAA',observedAt:Date.UTC(2026,0,2,19,0,0),pattern:'DOUBLE BOTTOM',state:'CONFIRMED',confidence:70,forwardReturn:-.5,marketExcessReturn:-.5,sectorExcessReturn:-.5}));
for(let i=0;i<6;i++)rows.push(makeRow({symbol:'BBB',observedAt:Date.UTC(2026,1,2+i,17,0,0),pattern:'RISING WEDGE',state:'TESTING',confidence:66,forwardReturn:-.01,marketExcessReturn:-.012,sectorExcessReturn:-.01}));

const result=evaluatePatternEvidenceRows(rows,{horizon:10,minSample:20});
assert.equal(result.patternDaySampleSize,26,'same-symbol same-pattern same-session duplicate must not inflate diagnostic pattern-day count');
assert.equal(result.sampleSize,2,'continuous multi-day appearances should collapse to one setup episode per symbol/pattern run');
const double=result.patternSegments.patternState.find(row=>row.key==='DOUBLE BOTTOM · CONFIRMED');
assert.equal(double.sampleSize,1,'continuous confirmed double-bottom days should form one confirmed state episode');
assert.equal(result.reviewCandidates.length,0,'one continuous episode must never satisfy a 20-episode review threshold');
assert.equal(result.guard.shadowOnly,true);
assert.equal(result.guard.affectsBuyNow,false);
assert.equal(result.guard.automaticPromotion,false);
assert.match(result.dedupePolicy,/pattern setup episode/);

const evaluation=fs.readFileSync(new URL('../src/evaluation.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/pattern-context-ui.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.match(evaluation,/evaluatePatternEvidenceRows/,'main evidence evaluation must attach pattern health');
assert.match(evaluation,/patternContext/,'pattern health must be returned with evidence evaluation');
assert.match(ui,/api\/evidence-evaluation\?horizon=10&minSample=20/,'phone Pattern Health must reuse D1 evidence evaluation');
assert.match(ui,/HEALTH_REFRESH_MS=5\*60_000/,'Pattern Health should be throttled on the phone');
assert.match(ui,/cannot affect BUY NOW/,'phone must preserve shadow-only wording');
assert.doesNotMatch(ui,/api\/market-data\?[^`]*pattern/i,'Pattern Health must not add a market-data request');
assert.match(build,/SIGNALFORGE_BUILD/);
assert.match(sw,/signalforge-shell-v30-/);
assert.ok(Number(pkg.version.split('.').at(-1))>=26,'Pattern Health must remain in this or a later release');
assert.match(pkg.scripts.check,/test-stage14-24-pattern-validation-health\.mjs/);
console.log('Stage 14.24 pattern validation health regression passed.');

function makeRow({symbol,observedAt,pattern,state,confidence,forwardReturn,marketExcessReturn,sectorExcessReturn}){
  return{symbol,observedAt,forwardReturn,mfe:.04,mae:-.015,marketExcessReturn,sectorExcessReturn,payloadJson:JSON.stringify({patternContext:{shadowOnly:true,structureState:'STRUCTURE',breakout:{state:'INSIDE'},channel:{type:'UP CHANNEL'},primaryPattern:{type:pattern,family:pattern.includes('WEDGE')?'wedges':'double',state,bias:pattern==='DOUBLE BOTTOM'?'BULLISH':'BEARISH',confidence}}})};
}
