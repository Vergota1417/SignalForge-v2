import { MIN_BUY_REWARD_RISK } from './hard-guardrails.js';

export function safeNum(v,fallback=null){const n=Number(v);return Number.isFinite(n)?n:fallback;}
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const positive=v=>{const n=safeNum(v);return n!==null&&n>0?n:null;};
const round1=v=>Math.round(v*10)/10;
const round2=v=>Math.round(v*100)/100;

function metricScore(metrics,maxPoints){
  if(!Array.isArray(metrics)||!metrics.length)return 0;
  return maxPoints*(metrics.filter(m=>m?.pass).length/metrics.length);
}
function validBenchmark(a){return Boolean(a?.benchmark&&positive(a.benchmark.latest));}
function validEntryZone(a){const low=positive(a?.preferredEntryLow),high=positive(a?.preferredEntryHigh);return Boolean(low&&high&&low<high);}
function validStop(a){return positive(a?.thesisBreak);}
function validTarget(a,price){const target=positive(a?.target);return target&&target>price?target:null;}

export function scoreBreakdown(a){
  if(!a||typeof a!=='object')return{total:0,components:{}};
  const trendMetrics=(a.engines?.trend?.metrics||[]).slice(0,3);
  const probabilityMetrics=(a.engines?.probability?.metrics||[]).slice(0,2);
  const rrMetrics=a.engines?.riskReward?.metrics||[];
  const entryMetrics=a.engines?.entry?.metrics||[];
  const price=positive(a.latest?.close)||0;
  const trend=metricScore(trendMetrics,20),probability=metricScore(probabilityMetrics,25),riskReward=metricScore(rrMetrics,20),entry=metricScore(entryMetrics,15);
  const rs=safeNum(a.relativeStrength20),relativeStrength=rs===null?0:10*clamp((rs+.05)/.10,0,1);
  const marketRegime=!validBenchmark(a)?0:a.benchmark.riskOff?0:a.benchmark.bull?5:2.5;
  const sample=safeNum(a.wf?.sample,0),dataQuality=(validBenchmark(a)?1:0)+(validStop(a)?1:0)+(validTarget(a,price)?1:0)+(sample>=12?2:sample>=5?1:0);
  const components={trend:round1(trend),probability:round1(probability),riskReward:round1(riskReward),entry:round1(entry),relativeStrength:round1(relativeStrength),marketRegime:round1(marketRegime),dataQuality:round1(dataQuality)};
  const total=Math.round(Object.values(components).reduce((sum,v)=>sum+v,0));
  return{total:clamp(total,0,100),components};
}
export function opportunityScore(a){return scoreBreakdown(a).total;}

export function calculatePositionSizing({accountEquity,availableCash,maxRiskPct=.005,maxPositionPct=.20,entryPrice,stopPrice}){
  const equity=positive(accountEquity),cash=safeNum(availableCash),entry=positive(entryPrice),stop=positive(stopPrice);
  if(!equity||cash===null||cash<0||!entry||!stop||stop>=entry)return null;
  const riskPct=clamp(safeNum(maxRiskPct,.005),.001,.02),positionPct=clamp(safeNum(maxPositionPct,.20),.05,.50),perShareRisk=entry-stop,riskFraction=perShareRisk/entry,dollarRiskBudget=equity*riskPct;
  const dollarsByRisk=riskFraction>0?dollarRiskBudget/riskFraction:0,dollarsByCash=cash,dollarsByExposure=equity*positionPct,rawAllocation=Math.max(0,Math.min(dollarsByRisk,dollarsByCash,dollarsByExposure));
  const suggestedDollarAmount=Math.floor((rawAllocation+1e-9)*100)/100,estimatedShares=suggestedDollarAmount>0?Math.floor(((suggestedDollarAmount/entry)+1e-12)*1e6)/1e6:0,plannedRisk=suggestedDollarAmount*riskFraction;
  const minimum=Math.min(dollarsByRisk,dollarsByCash,dollarsByExposure),limitedBy=minimum===dollarsByRisk?'risk budget':minimum===dollarsByCash?'available cash':'position exposure';
  return{suggestedDollarAmount,estimatedShares,plannedRisk,dollarRiskBudget,perShareRisk,riskFraction,riskPct,maxPositionPct:positionPct,limitedBy,cashRemaining:Math.max(0,cash-suggestedDollarAmount),limits:{risk:dollarsByRisk,cash:dollarsByCash,exposure:dollarsByExposure}};
}

function buyGateSummary(a,price){
  const entryLow=positive(a.preferredEntryLow),entryHigh=positive(a.preferredEntryHigh),stop=validStop(a),target=validTarget(a,price),rsi=safeNum(a.rsi),overextension=positive(a.overextension),rr=safeNum(a.rr),participation=a?.intradayConfirmation||null;
  const entryZoneValid=Boolean(entryLow&&entryHigh&&entryLow<entryHigh),nearEntry=entryZoneValid&&price>=entryLow*.99&&price<=entryHigh*1.03,thesisIntact=Boolean(stop&&price>stop),notOverextended=Boolean(overextension&&rsi!==null&&price<=overextension&&rsi<76),participationPass=Boolean(participation?.pass&&participation?.participationPass);
  const checks=[{name:'Trend engine',pass:Boolean(a.engines?.trend?.ready)},{name:'Entry engine',pass:Boolean(a.engines?.entry?.ready)},{name:'Probability engine',pass:Boolean(a.engines?.probability?.ready)},{name:'Risk/reward engine',pass:Boolean(a.engines?.riskReward?.ready)},{name:'SPY benchmark available',pass:validBenchmark(a)},{name:'Structure stop resolved',pass:Boolean(stop)},{name:'Structure target resolved above price',pass:Boolean(target)},{name:'Entry zone resolved',pass:entryZoneValid},{name:'Price near preferred entry',pass:nearEntry},{name:`Actual structure R/R >= ${MIN_BUY_REWARD_RISK.toFixed(2)}`,pass:rr!==null&&rr>=MIN_BUY_REWARD_RISK},{name:'Thesis intact',pass:thesisIntact},{name:'Not overextended',pass:notOverextended},{name:'Participation / execution confirmation',pass:participationPass}];
  return{checks,failed:checks.filter(x=>!x.pass).map(x=>x.name),allPassed:checks.every(x=>x.pass),nearEntry,thesisIntact,notOverextended,entryZoneValid,stop,target,rr:rr===null?0:rr,participationPass};
}

export function calculateProfitProtection({entryPrice,currentPrice,thesisBreak,target=null,gainPct=null,previousProtectedPrice=null}){
  const entry=positive(entryPrice),price=positive(currentPrice),thesis=positive(thesisBreak),targetPrice=positive(target),previous=positive(previousProtectedPrice);
  if(!entry||!price)return null;
  const gain=gainPct===null||gainPct===undefined?price/entry-1:safeNum(gainPct,price/entry-1);
  if(gain<.05&&!previous)return{active:false,breached:false,protectedPrice:thesis&&thesis<price?round2(thesis):null,protectedGainPct:null,lockedProfitPerShare:0,lockedProfitAmountPct:0,tier:'THESIS ONLY'};
  let capture=0,tier='BREAK-EVEN';
  if(gain>=.25){capture=.65;tier='LOCK 65% OF GAIN';}
  else if(gain>=.18){capture=.55;tier='LOCK 55% OF GAIN';}
  else if(gain>=.12){capture=.42;tier='LOCK 42% OF GAIN';}
  else if(gain>=.08){capture=.25;tier='LOCK 25% OF GAIN';}
  const breakEvenFloor=entry*1.0025,gainFloor=entry*(1+Math.max(0,gain)*capture);
  let candidate=Math.max(breakEvenFloor,gainFloor,thesis&&thesis<price?thesis:0);
  if(targetPrice&&targetPrice>entry&&price>=targetPrice*.97)candidate=Math.max(candidate,entry+(price-entry)*.70);
  candidate=Math.min(candidate,price*.985);
  const protectedPrice=Math.max(previous||0,candidate),breached=Boolean(previous&&price<=previous),protectedGainPct=protectedPrice/entry-1;
  return{active:true,breached,protectedPrice:round2(protectedPrice),previousProtectedPrice:previous?round2(previous):null,protectedGainPct,lockedProfitPerShare:Math.max(0,protectedPrice-entry),lockedProfitAmountPct:gain>0?clamp(protectedGainPct/gain,0,1):0,tier:previous&&previous>candidate?'PRIOR FLOOR HELD':tier};
}

export function evaluateStrategy(analysis,holding=null,accountContext=null,previousStrategy=null){
  const price=positive(analysis?.latest?.close);if(!price)return null;
  const trendReady=Boolean(analysis.engines?.trend?.ready),probabilityReady=Boolean(analysis.engines?.probability?.ready),riskRewardReady=Boolean(analysis.engines?.riskReward?.ready),entryReady=Boolean(analysis.engines?.entry?.ready),gates=buyGateSummary(analysis,price),owned=Boolean(holding&&positive(holding.shares)&&positive(holding.entryPrice)),score=scoreBreakdown(analysis);
  if(owned){
    const entryPrice=positive(holding.entryPrice),shares=positive(holding.shares),gainPct=price/entryPrice-1,marketValue=price*shares,costBasis=entryPrice*shares,rsi=safeNum(analysis.rsi),previousProtectedPrice=positive(previousStrategy?.protection?.protectedPrice);
    const protection=calculateProfitProtection({entryPrice,currentPrice:price,thesisBreak:gates.stop,target:gates.target,gainPct,previousProtectedPrice});
    const continuationWeakness=[!trendReady,!probabilityReady,Boolean(analysis.benchmark?.riskOff),rsi!==null&&rsi>=76,!entryReady].filter(Boolean).length;
    let state='HOLD',reason='The investment thesis remains intact. Continue monitoring the larger trend and structure-based risk level.';
    if(!gates.thesisIntact||analysis.status==='SELL / EXIT'){state='SELL / EXIT';reason='Price has broken the structure-based thesis level. The original reason for owning this position is no longer intact.';}
    else if(protection?.breached){state='SELL / EXIT';reason='Price has fallen through the previously saved protected-profit floor. The protected portion of the gain should no longer be given back.';}
    else if((!trendReady&&gainPct<=0)||(analysis.benchmark?.riskOff&&!probabilityReady&&gainPct<.03)){state='SELL / EXIT';reason='Trend and market evidence deteriorated while the position has little or no profit cushion.';}
    else if(gainPct>=.12&&continuationWeakness>=2){state='REDUCE';reason='The thesis is still intact, but multiple continuation signals weakened while a meaningful gain is open. Reduce exposure and protect the remainder.';}
    else if(gainPct>=.08&&(!gates.notOverextended||!entryReady||(rsi!==null&&rsi>=72)||!probabilityReady)){state='PROTECT PROFIT';reason='The position is profitable but price is extended or continuation evidence is cooling. Protect gains while the core thesis remains valid.';}
    const protectedPrice=protection?.protectedPrice||null,protectedGainAmount=protectedPrice?Math.max(0,(protectedPrice-entryPrice)*shares):0,givebackToProtection=protectedPrice?Math.max(0,(price-protectedPrice)*shares):null;
    return{mode:'HOLDING',state,reason,price,entryPrice,shares,gainPct,gainAmount:marketValue-costBasis,marketValue,costBasis,thesisBreak:gates.stop,target:gates.target,opportunityScore:score.total,scoreBreakdown:score.components,timingEvidence:timingEvidence(analysis),protection:{...protection,protectedGainAmount,givebackToProtection},continuationWeakness};
  }
  const hardInvalid=analysis.status==='SELL / EXIT'||analysis.status==='AVOID'||(gates.stop&&price<=gates.stop)||!trendReady,dataReady=validBenchmark(analysis)&&Boolean(gates.stop)&&Boolean(gates.target)&&gates.entryZoneValid&&positive(analysis.overextension)&&safeNum(analysis.rsi)!==null;
  let state='WATCH',reason='The stock is worth monitoring, but the larger setup is not strong enough to commit capital yet.';
  if(hardInvalid){state='AVOID';reason='The higher-timeframe trend or structure is unfavorable for new capital.';}
  else if(!dataReady){state='WATCH';reason='The setup cannot become a buy yet because critical benchmark, structure, or entry data is unresolved.';}
  else if(!gates.notOverextended){state='WATCH';reason='The setup may be attractive, but price is extended. Do not chase the move.';}
  else if(gates.allPassed){state='BUY WINDOW';reason=`All higher-timeframe engines passed, structure R/R is at least ${MIN_BUY_REWARD_RISK.toFixed(2)}:1, price is near the preferred entry area, and live participation confirms execution.`;}
  else if(trendReady&&probabilityReady&&riskRewardReady&&gates.rr>=1.35&&gates.thesisIntact){state='BUY CANDIDATE';reason=gates.participationPass?'Higher-timeframe evidence and structure are favorable, but one or more BUY WINDOW conditions still need improvement.':'Higher-timeframe evidence is favorable, but BUY WINDOW remains closed until participation/execution confirmation passes.';}
  else if(trendReady&&(probabilityReady||riskRewardReady)){state='WATCH';reason='Trend quality is constructive, but probability, structure reward/risk, or entry quality still needs improvement.';}
  const sizing=(state==='BUY WINDOW'||state==='BUY CANDIDATE')&&accountContext&&gates.stop?calculatePositionSizing({...accountContext,entryPrice:price,stopPrice:gates.stop}):null;
  return{mode:'CANDIDATE',state,reason,price,opportunityScore:score.total,scoreBreakdown:score.components,expectedUpside:gates.target?(gates.target-price)/price:0,thesisRisk:gates.stop?(price-gates.stop)/price:0,rr:gates.rr,target:gates.target,thesisBreak:gates.stop,structure:analysis.structure||null,buyChecks:gates.checks,buyBlockers:gates.failed,timingEvidence:timingEvidence(analysis),sizing};
}

export function rankOpportunities(signals,holdings=[],accountContext=null){const owned=new Set((holdings||[]).map(h=>String(h.symbol||'').toUpperCase())),order={'BUY WINDOW':4,'BUY CANDIDATE':3,'WATCH':2,'AVOID':0};return(signals||[]).filter(row=>row?.analysis&&row?.symbol&&!owned.has(String(row.symbol).toUpperCase())).map(row=>({symbol:row.symbol,updatedAt:safeNum(row.updatedAt,0),strategy:evaluateStrategy(row.analysis,null,accountContext),analysis:row.analysis})).filter(row=>row.strategy).sort((a,b)=>{const d=(order[b.strategy.state]||0)-(order[a.strategy.state]||0);return d||b.strategy.opportunityScore-a.strategy.opportunityScore;});}
export function rankPortfolioActions(rows=[]){const order={'SELL / EXIT':4,'REDUCE':3,'PROTECT PROFIT':2,'HOLD':1};return[...(rows||[])].sort((a,b)=>{const d=(order[b?.strategy?.state]||0)-(order[a?.strategy?.state]||0);if(d)return d;const weakness=(b?.strategy?.continuationWeakness||0)-(a?.strategy?.continuationWeakness||0);return weakness||(b?.strategy?.opportunityScore||0)-(a?.strategy?.opportunityScore||0);});}
function timingEvidence(a){const c=a?.intradayConfirmation;if(!c)return{state:'NOT CHECKED',pass:null,reason:'Participation/execution timing has not been checked yet. It is required to open a new BUY WINDOW but does not change the higher-timeframe thesis.'};return{state:String(c.state||'UNKNOWN'),pass:Boolean(c.pass),reason:String(c.reason||''),passes:Number(c.passes)||0,total:Number(c.total)||5,participationPass:Boolean(c.participationPass),avwap:positive(c.avwap),relativeVolume:safeNum(c.relativeVolume),momentum4:safeNum(c.momentum4),volatility:c.volatility||null,metrics:Array.isArray(c.metrics)?c.metrics:[]};}
