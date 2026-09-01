function safeEngine(analysis,key){
  return analysis?.engines?.[key]||{state:'NOT_AVAILABLE',ready:false,passes:0,total:0,metrics:[]};
}

function stateFromEngine(engine){
  if(!engine)return'NOT_AVAILABLE';
  if(engine.ready||engine.state==='PASS')return'PASS';
  if(engine.state==='WARN')return'WARN';
  if(engine.state==='FAIL')return'FAIL';
  return engine.state||'NOT_AVAILABLE';
}

function stage(key,label,state,reason,details={}){
  return{key,label,state,pass:state==='PASS',blocking:details.blocking!==false,reason:String(reason||''),...details};
}

export function buildFiveStageAlpha(analysis,context={}){
  const trend=safeEngine(analysis,'trend');
  const entry=safeEngine(analysis,'entry');
  const riskReward=safeEngine(analysis,'riskReward');
  const confirmation=analysis?.intradayConfirmation||null;
  const hard=analysis?.hardBuyGuardrails||null;
  const benchmark=analysis?.benchmark||null;
  const dedicatedEnvironment=context?.environment||null;

  let environmentState=stateFromEngine(trend);
  if(benchmark?.riskOff)environmentState='FAIL';
  let environmentReason=benchmark?.riskOff
    ?'Broad-market context is risk-off, so Environment blocks a new long setup.'
    :trend.ready
      ?`Trend structure is aligned${benchmark?.bull?' and the broad market is supportive':''}.`
      :'Trend or market context is not strong enough yet.';
  let environmentDetails={passes:trend.passes,total:trend.total,metrics:trend.metrics||[],benchmark,blocking:true,affectsExecution:true,source:'legacy-analysis-adapter'};
  if(dedicatedEnvironment){
    environmentState=dedicatedEnvironment.state||dedicatedEnvironment.gateState||'NOT_AVAILABLE';
    environmentReason=dedicatedEnvironment.reason||environmentReason;
    environmentDetails={
      passes:(dedicatedEnvironment.metrics||[]).filter(metric=>metric.state==='PASS'||metric.state==='BULLISH'||metric.state==='NORMAL'||metric.state==='QUIET').length,
      total:(dedicatedEnvironment.metrics||[]).length,
      metrics:dedicatedEnvironment.metrics||[],
      benchmark:dedicatedEnvironment.marketTrend||benchmark,
      classification:dedicatedEnvironment.classification||null,
      gateState:dedicatedEnvironment.gateState||null,
      evidenceCoverage:dedicatedEnvironment.evidenceCoverage||null,
      missingInputs:dedicatedEnvironment.missingInputs||[],
      nextCondition:dedicatedEnvironment.nextCondition||null,
      engineVersion:dedicatedEnvironment.version||null,
      blocking:Boolean(dedicatedEnvironment.blocking),
      affectsExecution:Boolean(dedicatedEnvironment.affectsExecution),
      shadowOnly:Boolean(dedicatedEnvironment.shadowOnly),
      source:'dedicated-environment-engine'
    };
  }

  let locationState=stateFromEngine(entry);
  if(Number(analysis?.latest?.close)>Number(analysis?.overextension)||Number(analysis?.rsi)>=76)locationState='FAIL';
  const locationReason=Number(analysis?.latest?.close)>Number(analysis?.overextension)||Number(analysis?.rsi)>=76
    ?'Price is overextended, so the setup is not at a defensible entry location.'
    :entry.ready
      ?'Price location, pullback depth, RSI, and the preferred entry zone are sufficiently aligned.'
      :'Price is not yet in a strong enough location for execution.';

  const targetResolved=Boolean(hard?.rules?.targetResolved?.pass&&analysis?.target);
  const rewardRiskPass=Boolean(hard?.rules?.rewardRisk?.pass);
  const pathState=targetResolved&&rewardRiskPass?'PASS':riskReward.state==='WARN'?'WARN':'FAIL';
  const pathReason=!targetResolved
    ?'No defensible destination is resolved, so room-to-run cannot be authorized.'
    :!rewardRiskPass
      ?`The path does not provide enough reward relative to risk (${Number.isFinite(analysis?.rr)?analysis.rr.toFixed(2):'unresolved'}:1).`
      :'A defensible destination is resolved and reward/risk clears the authoritative minimum.';

  let confirmationState='NOT_AVAILABLE';
  let confirmationReason='Execution confirmation is not available yet.';
  if(confirmation){
    confirmationState=confirmation.pass?'PASS':confirmation.state==='WARN'?'WARN':confirmation.state==='INSUFFICIENT'?'NOT_AVAILABLE':'FAIL';
    confirmationReason=confirmation.reason||confirmationReason;
  }

  const executionState=hard?.pass?'PASS':'LOCKED';
  const executionReason=hard?.pass
    ?analysis?.reason||'All authoritative BUY requirements passed.'
    :analysis?.reason||hard?.reason||'Execution remains locked by an authoritative production guardrail.';

  const stages=[
    stage('environment','Environment',environmentState,environmentReason,environmentDetails),
    stage('location','Location',locationState,locationReason,{passes:entry.passes,total:entry.total,metrics:entry.metrics||[],preferredEntryLow:analysis?.preferredEntryLow??null,preferredEntryHigh:analysis?.preferredEntryHigh??null,overextension:analysis?.overextension??null}),
    stage('path','Path',pathState,pathReason,{passes:riskReward.passes,total:riskReward.total,metrics:riskReward.metrics||[],target:analysis?.target??null,rewardRisk:analysis?.rr??null}),
    stage('confirmation','Confirmation',confirmationState,confirmationReason,{passes:confirmation?.passes??0,total:confirmation?.total??0,metrics:confirmation?.metrics||[],relativeVolume:confirmation?.relativeVolume??null,latestTime:confirmation?.latestTime??null}),
    stage('execution','Execution',executionState,executionReason,{hardBuyGuardrails:hard,status:analysis?.status||'WAIT — SETUP NOT READY',readiness:analysis?.readiness??null})
  ];

  const bottleneck=stages.find(item=>item.blocking!==false&&item.state!=='PASS')||null;
  return{
    version:dedicatedEnvironment?'five-stage-alpha-2':'five-stage-alpha-1',
    adapter:dedicatedEnvironment?'dedicated-environment-plus-existing-analysis':'existing-analysis-to-five-stage',
    interim:true,
    affectsProductionGuardrails:false,
    releaseEligible:false,
    order:stages.map(item=>item.key),
    stages,
    bottleneck:bottleneck?{key:bottleneck.key,label:bottleneck.label,state:bottleneck.state,reason:bottleneck.reason}:null,
    action:analysis?.status||'WAIT — SETUP NOT READY',
    reason:analysis?.reason||'',
    readiness:analysis?.readiness??null
  };
}
