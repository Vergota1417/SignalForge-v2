const BUY_RR_MIN=1.8;
const ENTRY_LOW_TOLERANCE=.99;
const ENTRY_HIGH_TOLERANCE=1.02;

export function refreshExecutionAnalysis(baseAnalysis,intradayConfirmation){
  if(!baseAnalysis||typeof baseAnalysis!=='object')return baseAnalysis;
  const confirmation=intradayConfirmation||null,currentPrice=positive(confirmation?.latestPrice)||positive(baseAnalysis?.latest?.close);
  if(!currentPrice)return{...baseAnalysis,intradayConfirmation:confirmation};
  const stop=positive(baseAnalysis.thesisBreak),target=positive(baseAnalysis.target),entryLow=positive(baseAnalysis.preferredEntryLow),entryHigh=positive(baseAnalysis.preferredEntryHigh),overextension=positive(baseAnalysis.overextension),dailyRsi=finiteOrNull(baseAnalysis.rsi);
  const risk=stop&&currentPrice>stop?currentPrice-stop:null,reward=target&&target>currentPrice?target-currentPrice:null,currentRr=risk&&reward!=null?reward/risk:0;
  const nearEntry=Boolean(entryLow&&entryHigh&&currentPrice>=entryLow*ENTRY_LOW_TOLERANCE&&currentPrice<=entryHigh*ENTRY_HIGH_TOLERANCE),thesisIntact=Boolean(stop&&currentPrice>stop),notOverextended=Boolean(overextension&&currentPrice<=overextension&&(dailyRsi==null||dailyRsi<76));
  const engines=baseAnalysis.engines||{},dailyGatesReady=Boolean(baseAnalysis.dailyGatesReady&&Object.values(engines).filter(Boolean).every(engine=>engine?.ready)),participationPass=Boolean(confirmation?.pass&&confirmation?.participationPass);
  const executionBlockers=[];
  if(!dailyGatesReady)executionBlockers.push('HIGHER-TIMEFRAME GATES');
  if(!nearEntry)executionBlockers.push('PRICE LOCATION');
  if(!(currentRr>=BUY_RR_MIN))executionBlockers.push('CURRENT R/R');
  if(!participationPass)executionBlockers.push('PARTICIPATION');
  if(!thesisIntact)executionBlockers.push('THESIS BREAK');
  if(!notOverextended)executionBlockers.push('OVEREXTENSION');

  let status=String(baseAnalysis.status||'WAIT — SETUP NOT READY'),reason=String(baseAnalysis.reason||'');
  if(!thesisIntact){status='SELL / EXIT';reason='Current 15-minute price broke the saved structure-based thesis level. The setup is invalid until structure repairs.';}
  else if(!engines?.trend?.ready){status='AVOID';reason='Trend quality is not strong enough to justify a new investment.';}
  else if(!notOverextended){status='WAIT FOR PULLBACK';reason='Higher-timeframe setup remains constructive, but the current execution price is extended. Do not chase.';}
  else if(dailyGatesReady&&nearEntry&&currentRr>=BUY_RR_MIN&&participationPass){status='BUY NOW';reason='Higher-timeframe gates, current price location, at least 1.80:1 reward/risk, and live participation/execution confirmation are aligned.';}
  else if(dailyGatesReady){status='SETUP — READY SOON';reason=executionReason(executionBlockers,confirmation,currentRr,nearEntry);}

  let readiness=Number(baseAnalysis.readiness)||0;
  if(status==='BUY NOW')readiness=Math.max(readiness,92);
  else if(dailyGatesReady)readiness=Math.max(readiness,82);
  if(status==='WAIT FOR PULLBACK')readiness=Math.min(readiness,68);
  if(status==='AVOID'||status==='SELL / EXIT')readiness=Math.min(readiness,35);
  const previousClose=impliedPreviousClose(baseAnalysis),changePct=previousClose?currentPrice/previousClose-1:baseAnalysis.changePct;
  return{
    ...baseAnalysis,
    latest:{...(baseAnalysis.latest||{}),close:currentPrice},
    changePct,
    rr:currentRr,
    intradayConfirmation:confirmation,
    dailyGatesReady,
    status,
    reason,
    readiness,
    execution:{currentPrice,currentRr,requiredRr:BUY_RR_MIN,nearEntry,thesisIntact,notOverextended,participationPass,blockers:executionBlockers,entryLowTolerance:ENTRY_LOW_TOLERANCE,entryHighTolerance:ENTRY_HIGH_TOLERANCE,checkedAt:Number(confirmation?.latestTime)||Date.now()}
  };
}

export function refreshPricePulseAnalysis(baseAnalysis,currentPrice,checkedAt=Date.now()){
  if(!baseAnalysis||typeof baseAnalysis!=='object')return baseAnalysis;
  const price=positive(currentPrice);if(!price)return baseAnalysis;
  const priorConfirmation=baseAnalysis.intradayConfirmation||null;
  const syntheticConfirmation={...(priorConfirmation||{}),latestPrice:price};
  const refreshed=refreshExecutionAnalysis(baseAnalysis,syntheticConfirmation);
  return{
    ...refreshed,
    intradayConfirmation:priorConfirmation,
    sessionRangeShadow:baseAnalysis.sessionRangeShadow||null,
    dailyAnalyzedAt:Number(baseAnalysis.dailyAnalyzedAt)||0,
    executionCheckedAt:Number(baseAnalysis.executionCheckedAt)||0,
    pricePulse:{timeframe:'1D/5min',price,checkedAt:Number(checkedAt)||Date.now()},
    execution:{...(refreshed.execution||{}),pricePulseOnly:true,pricePulseCheckedAt:Number(checkedAt)||Date.now(),confirmationCheckedAt:Number(baseAnalysis.executionCheckedAt)||0}
  };
}

function executionReason(blockers,confirmation,currentRr,nearEntry){
  if(blockers.includes('PARTICIPATION'))return confirmation?.reason||'Higher-timeframe setup is valid; BUY execution is waiting for live participation confirmation.';
  if(blockers.includes('CURRENT R/R'))return`Higher-timeframe setup is valid, but current execution reward/risk is ${Number(currentRr||0).toFixed(2)}:1. BUY NOW requires at least 1.80:1.`;
  if(blockers.includes('PRICE LOCATION')&&!nearEntry)return'Higher-timeframe setup is valid, but current price is outside the preferred execution area.';
  return'Higher-timeframe setup is valid, but the final execution conditions are not all aligned yet.';
}
function impliedPreviousClose(a){const latest=positive(a?.latest?.close),change=finiteOrNull(a?.changePct);if(!latest||change==null||change<=-1)return null;return latest/(1+change);}
function positive(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null;}
function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null;}
