import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPatternEpisodes, buildPatternStateEpisodes, evaluatePatternEvidenceRows } from '../src/pattern-evaluation.js';
import { BASELINE_TESTS } from './suite-manifest.mjs';

const continuity=[
  episodeRow('AAA','2026-01-05','DOUBLE BOTTOM','DETECTED',70),
  episodeRow('AAA','2026-01-06','DOUBLE BOTTOM','TESTING',76),
  episodeRow('AAA','2026-01-07','DOUBLE BOTTOM','CONFIRMED',84),
  episodeRow('AAA','2026-01-08',null,null,0),
  episodeRow('AAA','2026-01-09','DOUBLE BOTTOM','CONFIRMED',86),
  episodeRow('AAA','2026-01-20','DOUBLE BOTTOM','CONFIRMED',88)
];
const setups=buildPatternEpisodes(continuity),states=buildPatternStateEpisodes(continuity);
assert.equal(setups.length,3,'multi-day same pattern should collapse into one setup until disappearance or >7-day gap');
assert.equal(setups[0].episodeObservations,3,'first setup should retain its three observed pattern days as diagnostics');
assert.equal(states.length,5,'DETECTED/TESTING/CONFIRMED transitions should each create a state episode while resets create new confirmed episodes');

const rows=[];let day=1;
for(let i=0;i<20;i++){
  rows.push(evidenceRow({symbol:'AAA',day:day++,pattern:'DOUBLE BOTTOM',state:'CONFIRMED',confidence:82,forwardReturn:.02,marketExcessReturn:.009}));
  rows.push(evidenceRow({symbol:'AAA',day:day++,pattern:null,state:null,confidence:0,forwardReturn:.001,marketExcessReturn:0}));
}
for(let i=0;i<5;i++)rows.push(evidenceRow({symbol:'BBB',day:day++,pattern:'RISING WEDGE',state:'TESTING',confidence:67,forwardReturn:-.01,marketExcessReturn:-.012}));
const result=evaluatePatternEvidenceRows(rows,{horizon:10,minSample:20});
const double=result.patternSegments.patternState.find(row=>row.key==='DOUBLE BOTTOM · CONFIRMED');
assert.equal(double.sampleSize,20,'review cohort should count 20 separate confirmed state episodes');
assert.equal(result.reviewCandidates.length,1,'only the positive qualified state cohort should become a review candidate');
assert.equal(result.reviewCandidates[0].productionEnabled,false);
assert.equal(result.guard.automaticPromotion,false);
assert.match(result.dedupePolicy,/pattern setup episode/);
assert.ok(result.patternDaySampleSize>result.sampleSize,'diagnostic pattern-day count should remain separate from primary setup-episode count');

const evaluator=fs.readFileSync(new URL('../src/pattern-evaluation.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/pattern-context-ui.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.match(evaluator,/gap longer than 7 calendar days/);
assert.match(evaluator,/buildPatternStateEpisodes/);
assert.match(evaluator,/automaticPromotion:false/);
assert.match(ui,/setup episodes resolved/);
assert.match(ui,/pattern-days logged/);
assert.match(ui,/cannot affect BUY NOW/);
assert.doesNotMatch(ui,/api\/market-data\?[^`]*episode/i,'episode validation must not request new market data');
assert.match(build,/version:'2\.30\.\d+'/,'production must expose a current SignalForge 2.30.x build');
const shell=build.match(/shell:'(v30-\d+)'/)?.[1];assert.ok(shell,'build metadata must expose a versioned v30 shell');
assert.ok(sw.includes(`signalforge-shell-${shell}`),'service worker shell must match visible build metadata');
assert.match(pkg.version,/^2\.30\.\d+$/,'package version must remain in the SignalForge 2.30.x line');
assert.ok(BASELINE_TESTS.includes('scripts/test-stage14-25-pattern-episode-validation.mjs'),'Stage 14.25 must remain in the baseline regression manifest');
console.log('Stage 14.25 pattern episode validation regression passed.');

function episodeRow(symbol,date,pattern,state,confidence){return{symbol,sessionDate:date,observedAt:Date.parse(`${date}T17:00:00Z`),primaryPattern:pattern,primaryFamily:pattern?'double':null,primaryState:state,primaryBias:pattern==='DOUBLE BOTTOM'?'BULLISH':null,primaryConfidence:confidence,forwardReturn:.01,mfe:.03,mae:-.01,marketExcessReturn:.004,sectorExcessReturn:.003,structureState:'STRUCTURE',breakoutState:'INSIDE',channelType:'UP CHANNEL'};}
function evidenceRow({symbol,day,pattern,state,confidence,forwardReturn,marketExcessReturn}){const date=new Date(Date.UTC(2026,0,day,17));return{symbol,observedAt:date.getTime(),forwardReturn,mfe:.035,mae:-.012,marketExcessReturn,sectorExcessReturn:marketExcessReturn*.7,payloadJson:JSON.stringify({patternContext:{shadowOnly:true,structureState:'STRUCTURE',breakout:{state:'INSIDE'},channel:{type:'UP CHANNEL'},primaryPattern:pattern?{type:pattern,family:pattern.includes('WEDGE')?'wedges':'double',state,bias:pattern==='DOUBLE BOTTOM'?'BULLISH':'BEARISH',confidence}:null}})};}
