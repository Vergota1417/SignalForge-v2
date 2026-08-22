import assert from 'node:assert/strict';
import { historicalConfirmation, selectResearchCandidates } from '../src/research.js';
import { buildScreenerRows, selectPromotionCandidates } from '../src/screener.js';

function engine(ready=true){return{ready,metrics:[{pass:ready},{pass:ready},{pass:ready},{pass:ready}]};}
function analysis(overrides={}){return{symbol:'TEST',latest:{close:100},readiness:86,rr:2.2,relativeStrength20:.05,rsi:58,benchmark:{latest:500,bull:true,riskOff:false},wf:{sample:32,winRate:.64,avgReturn:.045},engines:{trend:engine(),entry:engine(),probability:engine(),riskReward:engine()},...overrides};}

const strong=historicalConfirmation(analysis());
assert.ok(strong.score>=60,'Strong historical evidence should produce confirming or strong research.');
assert.ok(['CONFIRMING','STRONG'].includes(strong.label));

const now=Date.now();
const positions=[{symbol:'OWN'}];
const signals=[{symbol:'OWN',status:'WAIT — SETUP NOT READY',readiness:50,updatedAt:now-10_000},{symbol:'NEW',status:'SETUP — READY SOON',readiness:82,updatedAt:now-10_000}];
const quotes=[{symbol:'OWN',price:50,volume:1000000,dollarVolume:50000000,rollingDiscoveryScore:20,relativeVolume:1.1,scoreVelocity:1},{symbol:'NEW',price:60,volume:1000000,dollarVolume:60000000,rollingDiscoveryScore:55,relativeVolume:1.8,scoreVelocity:10}];
const candidates=selectResearchCandidates({positions,signals,quotes,researchMap:new Map(),now,limit:2});
assert.equal(candidates[0].symbol,'OWN','Owned positions should receive highest after-hours research priority.');

const freshMap=new Map([['OWN',{researchedAt:now-60_000}]]);
const staleFiltered=selectResearchCandidates({positions,signals,quotes,researchMap:freshMap,now,limit:2});
assert.ok(!staleFiltered.some(x=>x.symbol==='OWN'),'Fresh research should not be repeated immediately.');

const researchMap=new Map([['NEW',{confirmationScore:82,confidenceLabel:'STRONG',sampleSize:30,winRate:.64,avgReturn:.04,rr:2.1,gatesReady:4,researchedAt:now}],['BAD',{confirmationScore:95,confidenceLabel:'STRONG',sampleSize:40,winRate:.70,avgReturn:.05,rr:2.5,gatesReady:4,researchedAt:now}]]);
const screenQuotes=[...quotes,{symbol:'BAD',price:70,volume:1000000,dollarVolume:70000000,rollingDiscoveryScore:80,relativeVolume:2,scoreVelocity:12}];
const screenSignals=[{symbol:'BAD',status:'AVOID',readiness:25,analysis:{status:'AVOID',engines:{trend:engine(false),entry:engine(false),probability:engine(false),riskReward:engine(false)}}}];
const rows=buildScreenerRows(screenQuotes,screenSignals,{researchMap});
const bad=rows.find(x=>x.symbol==='BAD');
assert.equal(bad.bucket,'AVOID');
assert.ok(bad.screenScore<=-10,'Strong historical research must not override an AVOID live state.');

const promoted=selectPromotionCandidates(screenQuotes,screenSignals,{owned:new Set(),now:now+5*60*60*1000,limit:2,researchMap});
assert.ok(!promoted.some(x=>x.symbol==='BAD'),'AVOID symbols must never be auto-promoted.');

console.log('Stage 9 research regression tests passed');
