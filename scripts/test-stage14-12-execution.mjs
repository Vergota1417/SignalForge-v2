import assert from 'node:assert/strict';
import fs from 'node:fs';
import { refreshExecutionAnalysis } from '../src/execution-confirmation.js';
import { refreshIntervalFor, selectPromotionCandidates } from '../src/screener.js';

function engine(ready=true){return{ready,passes:ready?4:2,total:4,metrics:[]};}
function base(overrides={}){
  const a={symbol:'TEST',latest:{close:100},changePct:.01,rsi:58,rr:4,target:120,thesisBreak:95,overextension:108,preferredEntryLow:97,preferredEntryHigh:102,readiness:86,dailyGatesReady:true,status:'SETUP — READY SOON',reason:'Waiting for execution.',engines:{trend:engine(),entry:engine(),probability:engine(),riskReward:engine()}};
  return{...a,...overrides,engines:{...a.engines,...(overrides.engines||{})}};
}
function confirmation({pass=true,price=100,rvol=1.25,momentum=.01}={}){return{pass,participationPass:pass,passes:pass?5:3,total:5,state:pass?'PASS':'FAIL',latestPrice:price,latestTime:Date.now(),relativeVolume:rvol,momentum4:momentum,reason:pass?'Participation confirmed.':'Participation is not confirmed.'};}

let a=refreshExecutionAnalysis(base(),confirmation());
assert.equal(a.status,'BUY NOW','Daily-ready setup with location, R/R and participation should become BUY NOW.');
assert.ok(a.rr>=1.8);
assert.equal(a.execution.participationPass,true);

let blocked=refreshExecutionAnalysis(base(),confirmation({pass:false,rvol:.7,momentum:-.01}));
assert.equal(blocked.status,'SETUP — READY SOON','Failed participation must block BUY NOW without invalidating the higher-timeframe thesis.');
assert.ok(blocked.execution.blockers.includes('PARTICIPATION'));

let rrBlocked=refreshExecutionAnalysis(base({target:108}),confirmation());
assert.equal(rrBlocked.status,'SETUP — READY SOON','Current execution R/R below 1.80 must block BUY NOW.');
assert.ok(rrBlocked.execution.blockers.includes('CURRENT R/R'));

let extended=refreshExecutionAnalysis(base(),confirmation({price:109}));
assert.equal(extended.status,'WAIT FOR PULLBACK','Current execution price above overextension must not remain BUY NOW.');

let broken=refreshExecutionAnalysis(base(),confirmation({price:94}));
assert.equal(broken.status,'SELL / EXIT','A current price below the thesis break must invalidate the setup.');

assert.equal(refreshIntervalFor({status:'SETUP — READY SOON',analysis:base()}),15*60*1000,'Near-ready candidates must recheck every 15 minutes.');
const ordinaryWait=base({dailyGatesReady:false,status:'WAIT — SETUP NOT READY',engines:{probability:engine(false),riskReward:engine(false)}});
assert.equal(refreshIntervalFor({status:ordinaryWait.status,analysis:ordinaryWait}),4*60*60*1000,'A genuine 2/4 ordinary WAIT candidate should keep the lower-cost 4-hour deep refresh.');

const now=Date.now(),quietQuote={symbol:'TEST',name:'Test',price:100,changePct:0,volume:100_000,averageVolume:200_000,relativeVolume:.5,rollingDiscoveryScore:0,scoreVelocity:0,dollarVolume:10_000_000};
const persistent=selectPromotionCandidates([quietQuote],[{symbol:'TEST',status:'SETUP — READY SOON',updatedAt:now-16*60*1000,analysis:base()}],{now,limit:1});
assert.equal(persistent[0]?.symbol,'TEST','A READY SOON candidate must remain in the execution loop even after broad discovery activity cools.');

const chart=fs.readFileSync(new URL('../public/chart-adapter.js',import.meta.url),'utf8');
assert.match(chart,/payloadMatchesCurrentRequest/,'Chart adapter must reject responses for a different selected symbol/timeframe.');
assert.match(chart,/hardPriceMismatch/,'Chart adapter must include a hard price mismatch fail-safe.');
assert.match(chart,/renderIfCurrent\(payload\)/,'Market-data interception must pass through the selection guard.');
const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');
assert.match(screener,/broadcastSignalPush/,'Scheduled signal transitions must be connected to phone push delivery.');
assert.match(screener,/execution-confirmation-15m/,'Near-ready execution rechecks must use the 15-minute confirmation feed.');
assert.match(screener,/sf-analysis-v3-execution/,'Stage 14.12 production evidence must be versioned separately for later model comparison.');
assert.match(screener,/refreshExecutionAnalysis\(analysis,confirmation\)/,'The first full daily-ready analysis must pass through the same explicit execution gate as later rechecks.');
assert.doesNotMatch(screener,/loadBenchmarkEvidence/,'Live execution promotion must not spend extra sector/industry benchmark requests; those belong in research/evaluation paths.');

console.log('Stage 14.12 execution, alert, chart-sync, and provider-budget regression checks passed.');
