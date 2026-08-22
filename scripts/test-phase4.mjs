import assert from 'node:assert/strict';
import { calculatePositionSizing, evaluateStrategy, opportunityScore, rankOpportunities, scoreBreakdown } from '../src/strategy.js';

function engine(passes=4,total=4){return{ready:passes>=3,passes,total,metrics:Array.from({length:total},(_,i)=>({name:`m${i}`,pass:i<passes}))};}
function analysis(overrides={}){
  const base={
    symbol:'TEST',latest:{close:100},rsi:58,rr:2.1,target:118,thesisBreak:94,overextension:109,preferredEntryLow:97,preferredEntryHigh:102,
    relativeStrength20:.03,status:'SETUP — READY SOON',benchmark:{latest:500,bull:true,riskOff:false},wf:{sample:15,winRate:.62,avgReturn:.04},
    engines:{trend:engine(),entry:engine(),probability:engine(),riskReward:engine()},intradayConfirmation:null
  };
  return {...base,...overrides,engines:{...base.engines,...(overrides.engines||{})}};
}

const perfect=analysis();
const breakdown=scoreBreakdown(perfect);
assert.ok(breakdown.total>=0&&breakdown.total<=100,'Opportunity score must stay inside 0-100.');
assert.equal(opportunityScore(perfect),breakdown.total,'Opportunity score should equal calibrated score total.');
assert.ok(Object.values(breakdown.components).reduce((a,b)=>a+b,0)<=100.1,'Score components must not exceed the 100-point design.');

const missingEntry=evaluateStrategy(analysis({preferredEntryLow:null,preferredEntryHigh:null}),null);
assert.notEqual(missingEntry.state,'BUY WINDOW','Missing entry-zone data must fail closed.');
assert.ok(missingEntry.buyBlockers.includes('Entry zone resolved'),'Missing entry data should be visible as a BUY blocker.');

const missingBenchmark=evaluateStrategy(analysis({benchmark:null}),null);
assert.notEqual(missingBenchmark.state,'BUY WINDOW','Missing benchmark context must fail closed.');
assert.ok(missingBenchmark.buyBlockers.includes('SPY benchmark available'),'Missing benchmark should be visible as a BUY blocker.');

const lowRR=evaluateStrategy(analysis({rr:1.6}),null);
assert.notEqual(lowRR.state,'BUY WINDOW','Actual structure R/R below 1.80 must block BUY WINDOW.');
assert.ok(lowRR.buyBlockers.includes('Actual structure R/R >= 1.80'),'Low R/R should be exposed as a hard blocker.');

const fractional=calculatePositionSizing({accountEquity:300,availableCash:150,maxRiskPct:.005,maxPositionPct:.20,entryPrice:180,stopPrice:171});
assert.ok(fractional.suggestedDollarAmount>0,'Fractional sizing should permit a positive allocation when whole shares are unaffordable.');
assert.ok(fractional.estimatedShares>0&&fractional.estimatedShares<1,'Fractional sizing should support less than one share.');
assert.ok(fractional.suggestedDollarAmount<=150,'Allocation must respect cash.');
assert.ok(fractional.suggestedDollarAmount<=60,'Allocation must respect max position exposure.');
assert.ok(fractional.plannedRisk<=1.5001,'Allocation must respect risk budget.');

const rows=[
  {symbol:'OWN',updatedAt:1,analysis:analysis({symbol:'OWN'})},
  {symbol:'NEW',updatedAt:2,analysis:analysis({symbol:'NEW'})}
];
const ranked=rankOpportunities(rows,[{symbol:'OWN',entryPrice:90,shares:1}]);
assert.deepEqual(ranked.map(r=>r.symbol),['NEW'],'Owned symbols must be excluded from new-capital opportunity ranking.');

console.log('phase4 regression tests passed');
