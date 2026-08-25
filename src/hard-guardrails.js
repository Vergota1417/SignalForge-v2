export const MIN_BUY_REWARD_RISK=1.80;

export function evaluateHardBuyGuardrails({
  rewardRisk,
  targetResolved,
  thesisIntact,
  overextended,
  higherTimeframeReady,
  intradayConfirmation
}={}){
  const rr=Number(rewardRisk);
  const rules={
    targetResolved:{pass:Boolean(targetResolved),label:'Defensible target resolved'},
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
    rules,
    failed,
    reason:failed.length?`BUY blocked by hard guardrail${failed.length===1?'':'s'}: ${failed.map(item=>item.label).join('; ')}.`:'All non-negotiable BUY guardrails passed.'
  };
}
