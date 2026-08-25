import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executionProbeEligible, selectPriorityExecutionCandidates, selectPromotionCandidates } from '../src/screener.js';
import { refreshPricePulseAnalysis } from '../src/execution-confirmation.js';

const now=Date.now();
const readyEngine={ready:true},failedEngine={ready:false};
const threeOfFour={
  symbol:'BAC',status:'SETUP — READY SOON',readiness:75,dailyGatesReady:false,dailyAnalyzedAt:now-60_000,executionCheckedAt:now-16*60_000,
  engines:{trend:readyEngine,entry:readyEngine,probability:readyEngine,riskReward:failedEngine},
  latest:{close:62.30},changePct:.01,preferredEntryLow:62,preferredEntryHigh:63,overextension:65,thesisBreak:60,target:67,rsi:58
};
assert.equal(executionProbeEligible(threeOfFour),true,'3/4 near-ready setup should receive execution/shadow data');
assert.equal(executionProbeEligible({...threeOfFour,status:'AVOID'}),false,'AVOID must not enter priority execution lane');

const confirmation={pass:true,participationPass:true,passes:4,total:5,latestPrice:62.30,latestTime:now-5*60_000,reason:'Participation confirmed.'};
const fourOfFour={...threeOfFour,dailyGatesReady:true,engines:{trend:readyEngine,entry:readyEngine,probability:readyEngine,riskReward:readyEngine},intradayConfirmation:confirmation,executionCheckedAt:now-5*60_000};
const pulsed=refreshPricePulseAnalysis(fourOfFour,62.10,now);
assert.equal(pulsed.latest.close,62.10,'five-minute pulse should refresh current price');
assert.equal(pulsed.intradayConfirmation,confirmation,'fresh five-minute pulse must preserve completed 15m confirmation object');
assert.equal(pulsed.executionCheckedAt,fourOfFour.executionCheckedAt,'price pulse must not masquerade as a new 15m execution check');
assert.equal(pulsed.pricePulse.timeframe,'1D/5min');

const stalePulse=refreshPricePulseAnalysis({...fourOfFour,executionCheckedAt:now-25*60_000},62.10,now);
assert.equal(stalePulse.intradayConfirmation?.stale,true,'old 15m confirmation must be marked stale');
assert.equal(stalePulse.intradayConfirmation?.participationPass,false,'stale participation must not remain a BUY permission');
assert.notEqual(stalePulse.status,'BUY NOW','stale 15m participation cannot produce BUY NOW from a price pulse');

const quote=(symbol,score,rv=1.4)=>({symbol,name:symbol,exchange:'NYSE',price:62,changePct:.01,relativeVolume:rv,dollarVolume:20_000_000,rollingDiscoveryScore:score,scoreVelocity:10,volume:1_000_000});
const signals=[
  {symbol:'BAC',status:threeOfFour.status,analysis:threeOfFour,updatedAt:now-60_000},
  {symbol:'AAA',status:'WAIT — SETUP NOT READY',analysis:{...threeOfFour,symbol:'AAA',status:'WAIT — SETUP NOT READY',engines:{trend:readyEngine,entry:readyEngine,probability:failedEngine,riskReward:failedEngine}},updatedAt:now-60_000}
];
const selected=selectPriorityExecutionCandidates([quote('BAC',30),quote('AAA',50)],signals,{now,limit:2});
assert.deepEqual(selected.map(x=>x.symbol),['BAC'],'priority lane should select near-ready 3/4 candidate, not weaker 2/4 setup');

const rotationSignals=[
  {symbol:'HOT',status:threeOfFour.status,analysis:{...threeOfFour,symbol:'HOT',executionCheckedAt:now-16*60_000},updatedAt:now-60_000},
  {symbol:'DUE',status:threeOfFour.status,analysis:{...threeOfFour,symbol:'DUE',executionCheckedAt:now-60*60_000},updatedAt:now-60_000}
];
const rotated=selectPromotionCandidates([quote('HOT',40),quote('DUE',30)],rotationSignals,{now,limit:1});
assert.equal(rotated[0]?.symbol,'DUE','overdue 15m confirmation should rotate ahead of a slightly stronger recently checked candidate');

const index=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
assert.match(index,/priorityExecutionSlot=minutes>=590&&minutes<=955&&minutes%5===0&&minutes%15!==0/,'priority lane must use spare five-minute slots only');
assert.match(index,/runPriorityExecutionPulse\(env,\{maxCandidates:2/,'priority lane should cap itself at two candidates');
assert.match(index,/adaptivePriorityExecution:true/,'health endpoint should expose adaptive scheduler');
const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');
assert.match(screener,/if\(executionProbeEligible\(analysis\)\)/,'full promotion must collect 15m data for eligible 3\/4 setups');
assert.match(screener,/promotionQueuePriority/,'15m execution queue must include fairness rotation');
assert.doesNotMatch(screener,/recordAnalysisEvidence\(env,analysis,\{source:'priority-price-pulse'/,'five-minute pulses must not create full analysis evidence rows');
const execution=fs.readFileSync(new URL('../src/execution-confirmation.js',import.meta.url),'utf8');
assert.match(execution,/PARTICIPATION_FRESH_MS=20\*60\*1000/,'15m participation must expire before stale data can authorize BUY');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
assert.match(wrangler,/"crons": \["\* \* \* \* \*"\]/,'one-minute Worker wakeup must remain available for adaptive scheduling');
console.log('Stage 14.19 adaptive API scheduler regression passed.');
