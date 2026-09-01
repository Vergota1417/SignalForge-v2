import assert from 'node:assert/strict';
import { evaluateEnvironment, ENVIRONMENT_ENGINE_POLICY } from '../src/method/environment/environment-engine.js';
import { buildFiveStageAlpha } from '../src/method/five-stage-alpha.js';

function dailySeries({count=140,start=100,step=.35,rangePct=.012,startTime=Date.UTC(2026,0,2)}={}){
  const day=86_400_000,rows=[];
  for(let i=0;i<count;i++){
    const close=Math.max(1,start+step*i),open=Math.max(1,close-step*.25),range=close*rangePct;
    rows.push({time:startTime+i*day,open,high:Math.max(open,close)+range,low:Math.max(.01,Math.min(open,close)-range),close,volume:1_000_000+i*2500});
  }
  return rows;
}

const stock=dailySeries({start:80,step:.42});
const benchmark=dailySeries({start:500,step:.7});
const supportive=evaluateEnvironment({symbol:'TEST',stockCandles:stock,benchmarkCandles:benchmark});
assert.equal(supportive.version,'environment-equity-v1');
assert.equal(supportive.gateState,'PASS','supportive stock + market should provisionally pass Environment');
assert.equal(supportive.state,'PARTIAL','missing optional sector context must be explicit');
assert.equal(supportive.shadowOnly,true);
assert.equal(supportive.affectsExecution,false);
assert.equal(supportive.blocking,false);
assert.deepEqual(supportive.evidenceCoverage.optionalMissing,['sectorContext']);
assert.equal(supportive.stockTrend.state,'BULLISH');
assert.notEqual(supportive.marketTrend.state,'BEARISH');
assert.ok(supportive.metrics.some(metric=>metric.key==='sectorContext'&&metric.state==='NOT_AVAILABLE'));

const riskOffBenchmark=dailySeries({start:600,step:-1.1});
const riskOff=evaluateEnvironment({symbol:'TEST',stockCandles:stock,benchmarkCandles:riskOffBenchmark});
assert.equal(riskOff.gateState,'FAIL');
assert.equal(riskOff.state,'FAIL');
assert.equal(riskOff.classification,'RISK_OFF');
assert.match(riskOff.reason,/risk-off/i);
assert.equal(riskOff.affectsExecution,false,'shadow Environment must remain non-authoritative even when it fails');

const insufficient=evaluateEnvironment({symbol:'TEST',stockCandles:stock.slice(-40),benchmarkCandles:benchmark});
assert.equal(insufficient.state,'NOT_AVAILABLE');
assert.ok(insufficient.missingInputs.includes('stockDailyHistory'));
assert.match(insufficient.reason,/at least 100 completed daily bars/i);

const explicitSector=evaluateEnvironment({
  symbol:'TEST',stockCandles:stock,benchmarkCandles:benchmark,
  sectorContext:{state:'SUPPORTIVE',reason:'Validated sector context fixture'}
});
assert.equal(explicitSector.state,'PASS','validated optional sector context should complete evidence coverage');
assert.deepEqual(explicitSector.evidenceCoverage.optionalMissing,[]);

const analysis={
  engines:{
    trend:{state:'PASS',ready:true,passes:4,total:4,metrics:[]},
    entry:{state:'PASS',ready:true,passes:4,total:4,metrics:[]},
    riskReward:{state:'PASS',ready:true,passes:4,total:4,metrics:[]}
  },
  benchmark:{bull:true,riskOff:false},
  intradayConfirmation:{pass:true,state:'PASS',passes:5,total:5,metrics:[],reason:'Fixture confirmation passed.'},
  hardBuyGuardrails:{pass:true,rules:{targetResolved:{pass:true},rewardRisk:{pass:true}}},
  latest:{close:100},overextension:110,rsi:55,target:120,rr:2.2,status:'BUY NOW',reason:'Fixture authoritative BUY passed.',readiness:95
};
const method=buildFiveStageAlpha(analysis,{environment:supportive});
const environmentStage=method.stages.find(stage=>stage.key==='environment');
assert.equal(method.version,'five-stage-alpha-2');
assert.equal(environmentStage.source,'dedicated-environment-engine');
assert.equal(environmentStage.state,'PARTIAL');
assert.equal(environmentStage.blocking,false,'shadow Environment cannot become the authoritative execution blocker');
assert.equal(method.bottleneck,null,'a non-blocking PARTIAL shadow stage must not override authoritative execution');
assert.equal(method.action,'BUY NOW');
assert.equal(method.affectsProductionGuardrails,false);

assert.equal(ENVIRONMENT_ENGINE_POLICY.affectsExecution,false);
assert.equal(ENVIRONMENT_ENGINE_POLICY.shadowOnly,true);
assert.equal(ENVIRONMENT_ENGINE_POLICY.minDailyBars,100);

console.log('Stage 2 dedicated Environment engine regression: PASS');
