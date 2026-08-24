import assert from 'node:assert/strict';
import { DEFAULT_SHADOW_CONFIG, SHADOW_ROLLOUT_AT, evaluateForwardShadow, shadowStatus } from '../src/shadow-validation.js';

function row({good=true,forwardReturn=.05,marketExcessReturn=.03,mae=-.02}={}){
  return{
    status:'BUY NOW',
    readiness:good?90:65,
    relativeVolume:good?2.0:.8,
    gatesReady:good?4:3,
    benchmarkRiskOff:good?0:1,
    payload:{benchmarkContext:{sectorRelativeStrength20:good ? .04 : -.03}},
    forwardReturn,
    marketExcessReturn,
    mae
  };
}

assert.ok(Number.isFinite(SHADOW_ROLLOUT_AT)&&SHADOW_ROLLOUT_AT>0,'Stage 14 must have a fixed forward-only rollout timestamp.');

const small=Array.from({length:12},()=>row());
const collecting=evaluateForwardShadow(small,DEFAULT_SHADOW_CONFIG,{minSample:30});
assert.equal(shadowStatus(collecting),'COLLECTING','Shadow challenger must not pass before its minimum forward sample.');

const good=Array.from({length:30},()=>row({good:true,forwardReturn:.06,marketExcessReturn:.04,mae:-.018}));
const weaker=Array.from({length:12},()=>row({good:false,forwardReturn:-.035,marketExcessReturn:-.05,mae:-.09}));
const forward=evaluateForwardShadow([...good,...weaker],DEFAULT_SHADOW_CONFIG,{minSample:30});
assert.equal(forward.challenger.sampleSize,30,'Only rows matching the registered challenger should enter its cohort.');
assert.ok(forward.promotable,'A sufficiently sampled challenger that improves expectancy, market excess, false positives, and MAE should become a promotion candidate.');
assert.equal(shadowStatus(forward),'FORWARD_PASS');
assert.match(forward.policy,/requires forward shadow validation/i,'Underlying challenger comparison must remain non-production policy.');

const failed=evaluateForwardShadow([...Array.from({length:30},()=>row({good:true,forwardReturn:-.01,marketExcessReturn:-.015,mae:-.05})),...Array.from({length:15},()=>row({good:false,forwardReturn:.03,marketExcessReturn:.02,mae:-.02}))],DEFAULT_SHADOW_CONFIG,{minSample:30});
assert.equal(shadowStatus(failed),'FORWARD_FAIL','A fully sampled challenger that does not improve the Champion must fail forward validation.');

console.log('Stage 14 forward shadow validation regression tests passed');
