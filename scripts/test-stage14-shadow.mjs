import assert from 'node:assert/strict';
import { DEFAULT_SHADOW_CONFIG, SHADOW_ROLLOUT_AT, evaluateForwardShadow, shadowStatus } from '../src/shadow-validation.js';

function row({qualified=true,ret=.08,market=.04,mae=-.02}={}){
  return {
    status:'BUY NOW',
    readiness:qualified?88:70,
    relativeVolume:qualified?1.9:1.1,
    gatesReady:qualified?4:3,
    benchmarkRiskOff:qualified?0:1,
    payloadJson:JSON.stringify({benchmarkContext:{sectorRelativeStrength20:qualified?.05:-.03}}),
    forwardReturn:ret,
    marketExcessReturn:market,
    mae
  };
}

const collecting=evaluateForwardShadow(Array.from({length:12},()=>row()),DEFAULT_SHADOW_CONFIG,{minSample:30});
assert.equal(shadowStatus(collecting),'COLLECTING','Shadow must not pass or fail before its challenger sample qualifies.');
assert.equal(collecting.promotable,false);

const strong=[
  ...Array.from({length:30},()=>row({qualified:true,ret:.08,market:.04,mae:-.02})),
  ...Array.from({length:10},()=>row({qualified:false,ret:-.04,market:-.05,mae:-.07}))
];
const passing=evaluateForwardShadow(strong,DEFAULT_SHADOW_CONFIG,{minSample:30});
assert.equal(passing.checks.sample,true);
assert.equal(passing.promotable,true,'A qualified challenger that improves expectancy, excess return, false positives, and MAE should pass shadow comparison.');
assert.equal(shadowStatus(passing),'FORWARD_PASS');

const weak=[
  ...Array.from({length:30},()=>row({qualified:true,ret:-.03,market:-.04,mae:-.08})),
  ...Array.from({length:10},()=>row({qualified:false,ret:.06,market:.03,mae:-.02}))
];
const failing=evaluateForwardShadow(weak,DEFAULT_SHADOW_CONFIG,{minSample:30});
assert.equal(failing.checks.sample,true);
assert.equal(failing.promotable,false);
assert.equal(shadowStatus(failing),'FORWARD_FAIL');

assert.ok(Number.isFinite(SHADOW_ROLLOUT_AT)&&SHADOW_ROLLOUT_AT>0,'Forward shadow rollout timestamp must be fixed and valid.');
console.log('Stage 14 forward shadow validation regression tests passed');
