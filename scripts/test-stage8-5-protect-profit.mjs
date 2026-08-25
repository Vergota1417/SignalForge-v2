import assert from 'node:assert/strict';
import { calculateProfitProtection, evaluateStrategy, rankPortfolioActions } from '../src/strategy.js';

function engine(ready=true){return{ready,passes:ready?4:2,total:4,metrics:Array.from({length:4},(_,i)=>({name:`m${i}`,pass:ready||i<2}))};}
function analysis(overrides={}){
  const base={symbol:'TEST',latest:{close:112},rsi:66,rr:2,target:122,thesisBreak:94,overextension:118,preferredEntryLow:97,preferredEntryHigh:102,relativeStrength20:.03,dailyGatesReady:true,status:'SETUP — READY SOON',benchmark:{latest:500,bull:true,riskOff:false},wf:{sample:15,winRate:.62,avgReturn:.04},engines:{trend:engine(),entry:engine(),probability:engine(),riskReward:engine()},intradayConfirmation:null};
  return{...base,...overrides,engines:{...base.engines,...(overrides.engines||{})}};
}

const p8=calculateProfitProtection({entryPrice:100,currentPrice:108,thesisBreak:94,gainPct:.08});
assert.equal(p8.active,true,'8% gain should activate profit protection.');
assert.ok(p8.protectedPrice>100,'Active protection should sit above entry after an 8% gain.');

const p18=calculateProfitProtection({entryPrice:100,currentPrice:118,thesisBreak:96,gainPct:.18});
assert.ok(p18.protectedPrice>p8.protectedPrice,'A larger gain should tighten the protected floor.');

const held=calculateProfitProtection({entryPrice:100,currentPrice:110,thesisBreak:96,gainPct:.10,previousProtectedPrice:p18.protectedPrice});
assert.equal(held.protectedPrice,p18.protectedPrice,'Saved protected floor must never loosen when price later declines.');
assert.equal(held.tier,'PRIOR FLOOR HELD','Protection should explain when the prior floor is being held.');

const breached=calculateProfitProtection({entryPrice:100,currentPrice:p18.protectedPrice-.25,thesisBreak:94,previousProtectedPrice:p18.protectedPrice});
assert.equal(breached.breached,true,'Dropping through a previously saved floor must mark protection as breached.');

const reduce=evaluateStrategy(analysis({latest:{close:114},engines:{entry:engine(false),probability:engine(false)}}),{entryPrice:100,shares:2});
assert.equal(reduce.state,'REDUCE','Meaningful profit plus multiple continuation weaknesses should reduce, not automatically fully exit.');

const protectedPosition=evaluateStrategy(analysis({latest:{close:110},rsi:74}),{entryPrice:100,shares:2});
assert.equal(protectedPosition.state,'PROTECT PROFIT','Profitable extended holding should protect profit while thesis remains intact.');

const prior={protection:{protectedPrice:109}};
const exit=evaluateStrategy(analysis({latest:{close:108.5},thesisBreak:94}),{entryPrice:100,shares:2},null,prior);
assert.equal(exit.state,'SELL / EXIT','Breaking the saved profit floor should trigger an exit even if structural thesis has not broken yet.');

const ranked=rankPortfolioActions([{symbol:'H',strategy:{state:'HOLD'}},{symbol:'P',strategy:{state:'PROTECT PROFIT'}},{symbol:'R',strategy:{state:'REDUCE'}},{symbol:'S',strategy:{state:'SELL / EXIT'}}]);
assert.deepEqual(ranked.map(r=>r.symbol),['S','R','P','H'],'Portfolio urgency ranking should put EXIT first, then REDUCE, PROTECT, HOLD.');

console.log('Stage 8.5 protect-profit regression tests passed');
