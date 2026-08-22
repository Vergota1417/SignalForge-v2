function pct(v){return Number.isFinite(Number(v))?Number(v):0;}

export function calculatePositionSizing({accountEquity,availableCash,maxRiskPct=.005,maxPositionPct=.20,entryPrice,stopPrice}){
  const equity=Number(accountEquity),cash=Number(availableCash),entry=Number(entryPrice),stop=Number(stopPrice);
  if(!(equity>0)||!(cash>0)||!(entry>0)||!(stop>0)||stop>=entry)return null;
  const riskPct=Math.min(.02,Math.max(.001,Number(maxRiskPct)||.005));
  const positionPct=Math.min(.50,Math.max(.05,Number(maxPositionPct)||.20));
  const perShareRisk=entry-stop,dollarRiskBudget=equity*riskPct;
  const sharesByRisk=Math.floor(dollarRiskBudget/perShareRisk);
  const sharesByCash=Math.floor(cash/entry);
  const sharesByExposure=Math.floor((equity*positionPct)/entry);
  const shares=Math.max(0,Math.min(sharesByRisk,sharesByCash,sharesByExposure));
  const positionValue=shares*entry,plannedRisk=shares*perShareRisk;
  return{shares,positionValue,plannedRisk,dollarRiskBudget,perShareRisk,riskPct,maxPositionPct:positionPct,limitedBy:shares===sharesByRisk?'risk budget':shares===sharesByCash?'available cash':'position exposure',cashRemaining:Math.max(0,cash-positionValue)};
}

export function evaluateStrategy(analysis,holding=null,accountContext=null){
  if(!analysis?.latest?.close)return null;
  const price=Number(analysis.latest.close),rr=Number(analysis.rr)||0,trendReady=Boolean(analysis.engines?.trend?.ready),probabilityReady=Boolean(analysis.engines?.probability?.ready),riskRewardReady=Boolean(analysis.engines?.riskReward?.ready),entryReady=Boolean(analysis.engines?.entry?.ready);
  const overextended=price>Number(analysis.overextension||Infinity)||Number(analysis.rsi||0)>=76,nearEntry=price>=Number(analysis.preferredEntryLow||0)*.99&&price<=Number(analysis.preferredEntryHigh||Infinity)*1.03,thesisBroken=price<=Number(analysis.thesisBreak||0),owned=Boolean(holding&&Number(holding.shares)>0&&Number(holding.entryPrice)>0);

  if(owned){
    const entryPrice=Number(holding.entryPrice),shares=Number(holding.shares),gainPct=entryPrice>0?price/entryPrice-1:0,marketValue=price*shares,costBasis=entryPrice*shares;
    let state='HOLD',reason='The investment thesis remains intact. Continue monitoring the larger trend and structure-based risk level.';
    if(thesisBroken||analysis.status==='SELL / EXIT'){state='SELL / EXIT';reason='Price has broken the structure-based thesis level. The original reason for owning this position is no longer intact.';}
    else if((!trendReady&&gainPct<=0)||(analysis.benchmark?.riskOff&&!probabilityReady&&gainPct<.03)){state='SELL / EXIT';reason='Trend and market evidence deteriorated while the position has little or no profit cushion.';}
    else if(gainPct>=.10&&(overextended||!entryReady||Number(analysis.rsi||0)>=72)){state='PROTECT PROFIT';reason='The position is profitable but price is extended or momentum is cooling. Protect gains while the thesis remains valid.';}
    else if(gainPct>=.18&&!probabilityReady){state='PROTECT PROFIT';reason='A meaningful gain is open while continuation evidence has weakened. Protect the profit rather than assuming the trend will continue.';}
    return{mode:'HOLDING',state,reason,price,entryPrice,shares,gainPct,gainAmount:marketValue-costBasis,marketValue,costBasis,thesisBreak:Number(analysis.thesisBreak)||null,target:Number(analysis.target)||null,opportunityScore:opportunityScore(analysis),timingEvidence:timingEvidence(analysis)};
  }

  let state='WATCH',reason='The stock is worth monitoring, but the larger setup is not strong enough to commit capital yet.';
  if(thesisBroken||analysis.status==='SELL / EXIT'||analysis.status==='AVOID'||!trendReady){state='AVOID';reason='The larger trend or thesis quality is not strong enough for a new investment.';}
  else if(overextended){state='WATCH';reason='The larger setup may be attractive, but price is extended. Do not chase the move.';}
  else if(analysis.dailyGatesReady&&rr>=1.5&&nearEntry){state='BUY WINDOW';reason='The larger setup, probability, structure-based reward/risk, and current entry area are favorable.';}
  else if(trendReady&&probabilityReady&&riskRewardReady&&rr>=1.35){state='BUY CANDIDATE';reason='Higher-timeframe evidence and structure-based upside are favorable, but the current entry is not attractive enough yet.';}
  else if(trendReady&&(probabilityReady||riskRewardReady)){state='WATCH';reason='The trend is constructive, but probability, entry quality, or structure-based reward/risk still needs improvement.';}

  const sizing=(state==='BUY WINDOW'||state==='BUY CANDIDATE')&&accountContext?calculatePositionSizing({...accountContext,entryPrice:price,stopPrice:Number(analysis.thesisBreak)}):null;
  return{mode:'CANDIDATE',state,reason,price,opportunityScore:opportunityScore(analysis),expectedUpside:price>0&&analysis.target?Math.max(0,Number(analysis.target)-price)/price:0,thesisRisk:price>0?Math.max(0,price-Number(analysis.thesisBreak||price))/price:0,rr,target:Number(analysis.target)||null,thesisBreak:Number(analysis.thesisBreak)||null,structure:analysis.structure||null,timingEvidence:timingEvidence(analysis),sizing};
}

export function rankOpportunities(signals,holdings=[],accountContext=null){
  const owned=new Map((holdings||[]).map(h=>[h.symbol,h]));
  return(signals||[]).filter(row=>row?.analysis).map(row=>({symbol:row.symbol,updatedAt:Number(row.updatedAt)||0,strategy:evaluateStrategy(row.analysis,owned.get(row.symbol)||null,accountContext),analysis:row.analysis})).filter(row=>row.strategy).sort((a,b)=>{const order={'BUY WINDOW':5,'BUY CANDIDATE':4,'HOLD':3,'PROTECT PROFIT':2,'WATCH':1,'SELL / EXIT':0,'AVOID':0};const d=(order[b.strategy.state]||0)-(order[a.strategy.state]||0);return d||pct(b.strategy.opportunityScore)-pct(a.strategy.opportunityScore);});
}

function opportunityScore(a){const trend=a.engines?.trend?.ready?24:0,probability=a.engines?.probability?.ready?24:0,riskReward=a.engines?.riskReward?.ready?22:0,entry=a.engines?.entry?.ready?14:0,rs=Math.max(-.10,Math.min(.10,Number(a.relativeStrength20)||0))*60,rr=Math.min(Math.max(Number(a.rr)||0,0),3)*4,regime=a.benchmark?.riskOff?-10:a.benchmark?.bull?6:0;return Math.max(0,Math.min(100,Math.round(trend+probability+riskReward+entry+rs+rr+regime)));}
function timingEvidence(a){const c=a.intradayConfirmation;if(!c)return{state:'NOT CHECKED',pass:null,reason:'Intraday timing has not been checked. It does not determine the higher-timeframe investment thesis.'};return{state:c.state||'UNKNOWN',pass:Boolean(c.pass),reason:c.reason||'',avwap:c.avwap||null,relativeVolume:c.relativeVolume||null,volatility:c.volatility||null};}
