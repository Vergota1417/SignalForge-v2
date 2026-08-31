export const MIN_BUY_REWARD_RISK=1.80;
export const MIN_BUY_STOP_DISTANCE_PCT=0.0035;
export const MIN_BUY_STOP_DISTANCE_ATR=0.35;

export function evaluateHardBuyGuardrails({
  rewardRisk,
  targetResolved,
  thesisIntact,
  overextended,
  higherTimeframeReady,
  intradayConfirmation,
  stopQuality,
  riskPct,
  riskAtr
}={}){
  const rr=Number(rewardRisk),pct=Number(riskPct),atr=Number(riskAtr),hasPct=Number.isFinite(pct),hasAtr=Number.isFinite(atr);
  const stopQualityPass=typeof stopQuality==='boolean'?stopQuality:(!hasPct&&!hasAtr?true:(!hasPct||pct>=MIN_BUY_STOP_DISTANCE_PCT)&&(!hasAtr||atr>=MIN_BUY_STOP_DISTANCE_ATR));
  const rules={
    targetResolved:{pass:Boolean(targetResolved),label:'Defensible target resolved'},
    stopQuality:{pass:stopQualityPass,label:`Stop distance ≥ ${(MIN_BUY_STOP_DISTANCE_PCT*100).toFixed(2)}% and ≥ ${MIN_BUY_STOP_DISTANCE_ATR.toFixed(2)} ATR`,value:{riskPct:hasPct?pct:null,riskAtr:hasAtr?atr:null}},
    rewardRisk:{pass:Number.isFinite(rr)&&rr>=MIN_BUY_REWARD_RISK,label:`Reward / risk ≥ ${MIN_BUY_REWARD_RISK.toFixed(2)}:1`,value:Number.isFinite(rr)?rr:null},
    thesisIntact:{pass:Boolean(thesisIntact),label:'Thesis support intact'},
    notOverextended:{pass:!overextended,label:'Price is not overextended'},
    higherTimeframeReady:{pass:Boolean(higherTimeframeReady),label:'Higher-timeframe gates cleared'},
    participationConfirmed:{pass:Boolean(intradayConfirmation?.pass&&intradayConfirmation?.participationPass),label:'15-minute participation/execution confirmed'}
  };
  const failed=Object.entries(rules).filter(([,rule])=>!rule.pass).map(([key,rule])=>({key,label:rule.label,value:rule.value??null}));
  return{
    pass:failed.length===0,
    minRewardRisk:MIN_BUY_REWARD_RISK,
    minStopDistancePct:MIN_BUY_STOP_DISTANCE_PCT,
    minStopDistanceAtr:MIN_BUY_STOP_DISTANCE_ATR,
    rules,
    failed,
    reason:failed.length?`BUY blocked by hard guardrail${failed.length===1?'':'s'}: ${failed.map(item=>item.label).join('; ')}.`:'All non-negotiable BUY guardrails passed.'
  };
}
