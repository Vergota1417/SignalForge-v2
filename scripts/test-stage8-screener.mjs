import assert from 'node:assert/strict';
import { buildScreenerRows } from '../src/screener.js';

const quotes=[
  {symbol:'AAA',name:'Actionable Co',price:50,changePct:3.1,volume:1_000_000,relativeVolume:1.8,discoveryScore:55,rollingDiscoveryScore:57,scoreVelocity:4,dollarVolume:50_000_000,updatedAt:1},
  {symbol:'BBB',name:'Avoid Co',price:60,changePct:6.5,volume:2_000_000,relativeVolume:2.6,discoveryScore:92,rollingDiscoveryScore:94,scoreVelocity:10,dollarVolume:120_000_000,updatedAt:1},
  {symbol:'CCC',name:'Discovery Co',price:30,changePct:2.4,volume:800_000,relativeVolume:1.7,discoveryScore:63,rollingDiscoveryScore:64,scoreVelocity:5,dollarVolume:24_000_000,updatedAt:1},
  {symbol:'LOW',name:'Low Liquidity',price:8,changePct:4,volume:100_000,relativeVolume:2,discoveryScore:70,rollingDiscoveryScore:70,scoreVelocity:2,dollarVolume:800_000,updatedAt:1}
];

const engines={
  trend:{ready:true},entry:{ready:true},probability:{ready:true},riskReward:{ready:true}
};
const signals=[
  {symbol:'AAA',status:'BUY NOW',updatedAt:2,analysis:{status:'BUY NOW',readiness:94,engines,criticalFailed:[],preferredEntryLow:48,preferredEntryHigh:51,overextension:56,thesisBreak:44,target:62,rr:2.1}},
  {symbol:'BBB',status:'AVOID',updatedAt:2,analysis:{status:'AVOID',readiness:30,engines:{trend:{ready:false},entry:{ready:true},probability:{ready:false},riskReward:{ready:false}},criticalFailed:['TREND','PROBABILITY','RISK / REWARD'],reason:'Trend quality failed.'}}
];

const rows=buildScreenerRows(quotes,signals);
assert.equal(rows.some(r=>r.symbol==='LOW'),false,'low-dollar-volume candidates must be filtered out');
assert.equal(rows[0].symbol,'AAA','BUY NOW with valid gates should outrank discovery-only candidates');
const avoid=rows.find(r=>r.symbol==='BBB');
assert.equal(avoid.bucket,'AVOID');
assert.ok(avoid.screenScore<=-10,'AVOID candidates must be capped below viable candidates regardless of discovery score');
const discovery=rows.find(r=>r.symbol==='CCC');
assert.equal(discovery.bucket,'DISCOVERY');
assert.equal(discovery.deepAnalysis,false);
assert.match(discovery.reason,/deserves deeper analysis|watch for confirmation|Discovery candidate/);
console.log('Stage 8 screener tests passed');
