import { analyze, assessIntradayConfirmation } from './analysis.js';
import { listPortfolioPositions, listRadarQuotes, listSignals, recordSignal } from './db.js';
import { getDiscoveryPool, getDiscoveryStatus } from './discovery.js';
import { getMarketData } from './market.js';
import { getResearchMap } from './research.js';
import { runPaperSimulation } from './simulation.js';
import { buildWeekendIntelligenceReport, getWeekendIntelligenceReport } from './weekend.js';
import { recordAnalysisEvidence } from './evidence.js';
import { refreshExecutionAnalysis, refreshPricePulseAnalysis } from './execution-confirmation.js';
import { assessSessionRange, recordSessionRangeShadow } from './session-range.js';
import { broadcastSignalPush } from './push.js';

const STATUS_BOOST={
  'BUY NOW':42,
  'SETUP — READY SOON':28,
  'WAIT FOR PULLBACK':8,
  'WAIT — SETUP NOT READY':0,
  'AVOID':-32,
  'SELL / EXIT':-42
};

const PROMOTION_STALE_MS=4*60*60*1000;
const NEAR_READY_RECHECK_MS=15*60*1000;
const PRIORITY_PULSE_MS=5*60*1000;
const EXECUTION_MODEL_VERSION='sf-analysis-v4-adaptive-execution';

export async function getSmartScreenerSnapshot(env,{limit=30}={}){
  const now=Date.now();
  const simulation=await runPaperSimulation(env);
  const [quotes,signals,pool,status,researchMap]=await Promise.all([
    listRadarQuotes(env,24*60*60*1000,80),
    listSignals(env),
    getDiscoveryPool(env,{limit:120}),
    getDiscoveryStatus(env),
    getResearchMap(env,{maxAgeMs:7*86_400_000})
  ]);
  const rows=buildScreenerRows(quotes,signals,{researchMap}).slice(0,Math.max(5,Math.min(50,Number(limit)||30)));
  const analyzed=rows.filter(row=>row.deepAnalysis).length,researchConfirmed=rows.filter(row=>row.research?.confirmationScore>=60).length;
  let weekendIntelligence=await getWeekendIntelligenceReport(env);
  const marketMode=marketModeFor(now);
  if(marketMode.weekend&&marketMode.weekendResearchWindowOpen&&(!weekendIntelligence||weekendIntelligence.weekKey!==marketMode.weekKey))weekendIntelligence=await buildWeekendIntelligenceReport(env,{now});
  return{rows,simulation,weekendIntelligence,marketMode,updatedAt:Math.max(0,...rows.map(row=>Number(row.quoteUpdatedAt)||0)),coverage:{weeklyPool:pool.length,catalogSize:status.catalogSize,scannedSymbols:status.scannedSymbols,rankedNow:rows.length,deepAnalyzed:analyzed,researchConfirmed},methodology:{stage1:'Discovery score: movement + relative volume + liquidity + score velocity.',stage2:'Top discovery candidates are automatically promoted into higher-cost four-engine analysis.',stage3:'After-hours 1-year historical research adds a bounded confirmation adjustment; it cannot override AVOID or SELL / EXIT.',stage4:'Saved live deep-analysis status remains authoritative for trade state.',stage5:'Forward paper trading opens only on new BUY NOW events and never uses future data.',stage6:'Three-of-four and four-of-four near-ready candidates receive the completed 15m participation, room-to-run, and opening-structure feed every 15 minutes when prioritized.',stage7:'Between broad scans, the top near-ready candidates can receive a five-minute price pulse that refreshes price, entry location, thesis integrity, overextension, and current reward/risk without pretending a new 15m confirmation exists.',stage8:'Live promotion uses SPY plus the candidate only; sector/industry evidence is deferred so execution checks stay within the provider budget.',stage9:'Room-to-run and opening structure remain shadow evidence and cannot block BUY NOW without validation.',weekend:'Weekend Intelligence converts stale executable-looking states into research-only Monday planning labels; fresh Monday data must reconfirm any BUY.',rule:'Historical research and experimental shadow features strengthen evidence, but never replace the live production decision gates without validation.'}};
}

export async function runScreenerPromotion(env,{maxPromotions=2,now=Date.now()}={}){
  const [quotes,signals,positions,researchMap]=await Promise.all([listRadarQuotes(env,24*60*60*1000,80),listSignals(env),listPortfolioPositions(env),getResearchMap(env,{maxAgeMs:7*86_400_000})]);
  const owned=new Set((positions||[]).map(row=>String(row.symbol||'').toUpperCase())),signalMap=new Map((signals||[]).filter(Boolean).map(row=>[row.symbol,row]));
  const candidates=selectPromotionCandidates(quotes,signals,{owned,now,limit:Math.max(1,Math.min(2,Number(maxPromotions)||2)),researchMap});
  if(!candidates.length){await runPaperSimulation(env,{now});return{promoted:[],candidates:[],skipped:'no-qualified-candidates'};}
  let benchmarkCandles=null;
  const ensureBenchmark=async()=>{
    if(benchmarkCandles)return benchmarkCandles;
    try{benchmarkCandles=(await getMarketData(env,'SPY','6M',false,{purpose:'promotion-spy-6m'})).candles;}catch(error){console.error(JSON.stringify({event:'promotion_benchmark_error',message:error?.message||String(error)}));}
    return benchmarkCandles;
  };
  const promoted=[];
  for(const candidate of candidates){
    try{
      const previousSignal=signalMap.get(candidate.symbol)||null,previousAnalysis=previousSignal?.analysis||null,dailyAt=dailyAnalysisAt(previousSignal),dailyAgeMs=dailyAt?Math.max(0,Number(now)-dailyAt):Infinity;
      let analysis=null,mode='FULL';
      if(previousAnalysis&&executionProbeEligible(previousAnalysis)&&dailyAgeMs<PROMOTION_STALE_MS){
        const base={...previousAnalysis,dailyAnalyzedAt:dailyAt||Number(previousSignal?.updatedAt)||Number(now)};
        const intraday=await getMarketData(env,candidate.symbol,'5D',false,{purpose:'execution-confirmation-15m'}),confirmation=assessIntradayConfirmation(intraday.candles),sessionRangeShadow=assessSessionRange(intraday.candles,{atr:base.atr,currentPrice:confirmation.latestPrice});
        analysis={...refreshExecutionAnalysis(base,confirmation),sessionRangeShadow,executionCheckedAt:Number(now)};mode='EXECUTION';
      }else{
        const benchmark=await ensureBenchmark();if(!benchmark)break;
        const market=await getMarketData(env,candidate.symbol,'6M',false,{purpose:'promotion-stock-6m'});
        analysis={...analyze(market.candles,candidate.symbol,{benchmarkCandles:benchmark}),dailyAnalyzedAt:Number(now),executionCheckedAt:0};
        if(executionProbeEligible(analysis)){
          const intraday=await getMarketData(env,candidate.symbol,'5D',false,{purpose:'execution-confirmation-15m'}),confirmation=assessIntradayConfirmation(intraday.candles),sessionRangeShadow=assessSessionRange(intraday.candles,{atr:analysis.atr,currentPrice:confirmation.latestPrice});
          analysis={...refreshExecutionAnalysis(analysis,confirmation),sessionRangeShadow,dailyAnalyzedAt:Number(now),executionCheckedAt:Number(now)};
        }
      }
      const event=await recordSignal(env,analysis),evidenceSource=mode==='EXECUTION'?'execution-recheck':'screener-promotion',hasExecution=Number(analysis.executionCheckedAt)>0;
      await recordAnalysisEvidence(env,analysis,{source:evidenceSource,timeframe:hasExecution?'6M+5D':'6M',quote:candidate,now,modelVersion:EXECUTION_MODEL_VERSION});
      await recordSessionRangeShadow(env,analysis,{source:evidenceSource,now});
      if(event.changed){
        try{const push=await broadcastSignalPush(env,analysis,event.previousStatus,event.now);console.log(JSON.stringify({event:'signal_status_push',symbol:candidate.symbol,status:analysis.status,previousStatus:event.previousStatus,mode,...push}));}
        catch(error){console.error(JSON.stringify({event:'signal_status_push_error',symbol:candidate.symbol,status:analysis.status,message:error?.message||String(error)}));}
      }
      promoted.push({symbol:candidate.symbol,screenScore:candidate.screenScore,researchScore:candidate.research?.confirmationScore||0,status:analysis.status,readiness:analysis.readiness,changed:event.changed,mode,modelVersion:EXECUTION_MODEL_VERSION,participation:analysis.intradayConfirmation?{pass:Boolean(analysis.intradayConfirmation.pass),corePass:Boolean(analysis.intradayConfirmation.participationPass),passes:Number(analysis.intradayConfirmation.passes)||0,total:Number(analysis.intradayConfirmation.total)||5}:null,roomToRun:analysis.sessionRangeShadow?{state:String(analysis.sessionRangeShadow.state||'INSUFFICIENT'),atrUsage:finiteOrNull(analysis.sessionRangeShadow.atrUsage),medianRangeUsage:finiteOrNull(analysis.sessionRangeShadow.medianRangeUsage),sameTimePace:finiteOrNull(analysis.sessionRangeShadow.sameTimePace),shadowOnly:true}:null});
      signalMap.set(candidate.symbol,{symbol:candidate.symbol,status:analysis.status,analysis,updatedAt:event.now});
    }catch(error){console.error(JSON.stringify({event:'screener_promotion_error',symbol:candidate.symbol,message:error?.message||String(error)}));break;}
  }
  await runPaperSimulation(env,{now});return{promoted,candidates:candidates.map(x=>x.symbol)};
}

export async function runPriorityExecutionPulse(env,{maxCandidates=2,now=Date.now()}={}){
  const [quotes,signals,positions,researchMap]=await Promise.all([listRadarQuotes(env,24*60*60*1000,80),listSignals(env),listPortfolioPositions(env),getResearchMap(env,{maxAgeMs:7*86_400_000})]);
  const owned=new Set((positions||[]).map(row=>String(row.symbol||'').toUpperCase())),signalMap=new Map((signals||[]).filter(Boolean).map(row=>[row.symbol,row]));
  const candidates=selectPriorityExecutionCandidates(quotes,signals,{owned,now,limit:Math.max(1,Math.min(2,Number(maxCandidates)||2)),researchMap});
  if(!candidates.length)return{pulsed:[],candidates:[],skipped:'no-near-ready-candidates'};
  const pulsed=[];
  for(const candidate of candidates){
    try{
      const previousSignal=signalMap.get(candidate.symbol),previousAnalysis=previousSignal?.analysis;if(!previousAnalysis)continue;
      const dailyAt=dailyAnalysisAt(previousSignal)||Number(previousSignal.updatedAt)||Number(now),executionAt=executionCheckAt(previousSignal);
      const pulse=await getMarketData(env,candidate.symbol,'1D',false,{purpose:'priority-price-pulse-5m'}),latest=pulse.candles[pulse.candles.length-1];if(!latest?.close)continue;
      const base={...previousAnalysis,dailyAnalyzedAt:dailyAt,executionCheckedAt:executionAt};
      const analysis={...refreshPricePulseAnalysis(base,latest.close,now),dailyAnalyzedAt:dailyAt,executionCheckedAt:executionAt,pricePulse:{timeframe:'1D/5min',price:Number(latest.close),candleTime:Number(latest.time)||0,checkedAt:Number(now)}};
      const event=await recordSignal(env,analysis);
      if(event.changed){
        try{const push=await broadcastSignalPush(env,analysis,event.previousStatus,event.now);console.log(JSON.stringify({event:'priority_price_pulse_push',symbol:candidate.symbol,status:analysis.status,previousStatus:event.previousStatus,...push}));}
        catch(error){console.error(JSON.stringify({event:'priority_price_pulse_push_error',symbol:candidate.symbol,status:analysis.status,message:error?.message||String(error)}));}
      }
      pulsed.push({symbol:candidate.symbol,status:analysis.status,readiness:analysis.readiness,price:Number(latest.close),rr:finiteOrNull(analysis.rr),gatesReady:candidate.gatesReady,participationConfirmed:Boolean(analysis.intradayConfirmation?.pass&&analysis.intradayConfirmation?.participationPass),changed:event.changed});
      signalMap.set(candidate.symbol,{symbol:candidate.symbol,status:analysis.status,analysis,updatedAt:event.now});
    }catch(error){console.error(JSON.stringify({event:'priority_price_pulse_error',symbol:candidate.symbol,message:error?.message||String(error)}));}
  }
  await runPaperSimulation(env,{now});return{pulsed,candidates:candidates.map(x=>x.symbol),intervalMs:PRIORITY_PULSE_MS};
}

export function selectPromotionCandidates(quotes=[],signals=[],{owned=new Set(),now=Date.now(),limit=2,researchMap=new Map()}={}){
  const signalMap=new Map((signals||[]).filter(Boolean).map(row=>[row.symbol,row]));
  return buildScreenerRows(quotes,signals,{researchMap}).filter(row=>!owned.has(row.symbol)).filter(row=>row.bucket!=='AVOID').filter(row=>{const signal=signalMap.get(row.symbol);return isNearReadySignal(signal)||row.discoveryScore>=20||row.relativeVolume>=1.25||row.scoreVelocity>=8||row.research?.confirmationScore>=60;}).filter(row=>promotionDue(signalMap.get(row.symbol),now)).sort((a,b)=>promotionPriority(b)-promotionPriority(a)||b.screenScore-a.screenScore||b.scoreVelocity-a.scoreVelocity).slice(0,Math.max(1,Math.min(2,Number(limit)||2)));
}

export function selectPriorityExecutionCandidates(quotes=[],signals=[],{owned=new Set(),now=Date.now(),limit=2,researchMap=new Map()}={}){
  const signalMap=new Map((signals||[]).filter(Boolean).map(row=>[row.symbol,row]));
  return buildScreenerRows(quotes,signals,{researchMap}).filter(row=>!owned.has(row.symbol)).filter(row=>{const signal=signalMap.get(row.symbol);if(!signal?.analysis||!executionProbeEligible(signal.analysis))return false;const dailyAt=dailyAnalysisAt(signal),pulseAt=Number(signal.analysis?.pricePulse?.checkedAt)||0;if(!dailyAt||now-dailyAt>=PROMOTION_STALE_MS)return false;if(pulseAt&&now-pulseAt<PRIORITY_PULSE_MS-15_000)return false;return true;}).sort((a,b)=>priorityExecutionScore(b,signalMap.get(b.symbol))-priorityExecutionScore(a,signalMap.get(a.symbol))||b.screenScore-a.screenScore).slice(0,Math.max(1,Math.min(2,Number(limit)||2)));
}

export function refreshIntervalFor(signal){return executionProbeEligible(signal?.analysis)?NEAR_READY_RECHECK_MS:PROMOTION_STALE_MS;}
export function executionProbeEligible(analysis){if(!analysis||typeof analysis!=='object')return false;const status=String(analysis.status||'');if(status==='AVOID'||status==='SELL / EXIT')return false;const engines=analysis.engines||{},gates=Object.values(engines).filter(Boolean),gatesReady=gates.filter(engine=>engine?.ready).length;return Boolean(analysis.dailyGatesReady||(engines?.trend?.ready&&gatesReady>=3)||status==='SETUP — READY SOON'||status==='WAIT FOR PULLBACK'||status==='BUY NOW');}
function isNearReadySignal(signal){return executionProbeEligible(signal?.analysis);}
function dailyAnalysisAt(signal){return Number(signal?.analysis?.dailyAnalyzedAt)||Number(signal?.updatedAt)||0;}
function executionCheckAt(signal){return Number(signal?.analysis?.executionCheckedAt)||0;}
function promotionDue(signal,now){if(!signal?.analysis)return true;const dailyAt=dailyAnalysisAt(signal);if(!dailyAt||now-dailyAt>=PROMOTION_STALE_MS)return true;if(executionProbeEligible(signal.analysis)){const executionAt=executionCheckAt(signal);return !executionAt||now-executionAt>=NEAR_READY_RECHECK_MS;}return false;}
function priorityExecutionScore(row,signal){const a=signal?.analysis||{},status=String(signal?.status||a.status||''),statusWeight=status==='BUY NOW'?500:status==='SETUP — READY SOON'?420:status==='WAIT FOR PULLBACK'?280:180,dailyReady=a.dailyGatesReady?500:0,gateWeight=(Number(row.gatesReady)||0)*120,participation=a.intradayConfirmation?.participationPass?50:0;return dailyReady+statusWeight+gateWeight+participation+promotionPriority(row);}

export function buildScreenerRows(quotes=[],signals=[],{researchMap=new Map()}={}){const signalMap=new Map(signals.filter(Boolean).map(row=>[row.symbol,row]));return quotes.map(quote=>buildRow(quote,signalMap.get(quote.symbol),researchMap.get(quote.symbol))).filter(row=>row.price>=5&&row.dollarVolume>=2_000_000&&row.discoveryScore>-100).sort((a,b)=>b.screenScore-a.screenScore||b.scoreVelocity-a.scoreVelocity||b.relativeVolume-a.relativeVolume||a.symbol.localeCompare(b.symbol));}
function buildRow(quote,signal,research=null){const analysis=signal?.analysis||null,status=String(signal?.status||analysis?.status||'NOT ANALYZED'),discoveryScore=finite(quote.rollingDiscoveryScore??quote.discoveryScore??quote.score),scoreVelocity=finite(quote.scoreVelocity),relativeVolume=Math.max(0,finite(quote.relativeVolume)),dollarVolume=Math.max(0,finite(quote.dollarVolume)||finite(quote.price)*finite(quote.volume)),gates=analysis?.engines?Object.values(analysis.engines):[],gatesReady=gates.filter(g=>g?.ready).length,gateTotal=gates.length||4,statusBoost=STATUS_BOOST[status]??0,velocityBoost=clamp(scoreVelocity*1.6,-12,18),participationBoost=clamp((relativeVolume-1)*7,-5,15),gateBoost=analysis?gatesReady*4:0,researchScore=finite(research?.confirmationScore),researchAdjustment=research?clamp((researchScore-50)*.24,-12,12):0,overextensionPenalty=status==='WAIT FOR PULLBACK'?10:0,bucket=bucketFor(status,analysis),rawScore=round(discoveryScore+statusBoost+velocityBoost+participationBoost+gateBoost+researchAdjustment-overextensionPenalty,1),screenScore=bucket==='AVOID'?Math.min(rawScore,-10):rawScore,reason=reasonFor({status,analysis,relativeVolume,scoreVelocity,research}),range=analysis?.sessionRangeShadow||null;return{symbol:String(quote.symbol||''),name:String(quote.name||quote.symbol||''),exchange:String(quote.exchange||''),price:finite(quote.price),changePct:finite(quote.changePct),relativeVolume,dollarVolume,discoveryScore:round(discoveryScore,1),scoreVelocity:round(scoreVelocity,1),screenScore,bucket,status,readiness:analysis?finite(analysis.readiness):null,gatesReady,gateTotal,criticalFailed:Array.isArray(analysis?.criticalFailed)?analysis.criticalFailed:[],deepAnalysis:Boolean(analysis),deepUpdatedAt:Number(signal?.updatedAt)||0,preferredEntryLow:finiteOrNull(analysis?.preferredEntryLow),preferredEntryHigh:finiteOrNull(analysis?.preferredEntryHigh),overextension:finiteOrNull(analysis?.overextension),thesisBreak:finiteOrNull(analysis?.thesisBreak),target:finiteOrNull(analysis?.target),rr:finiteOrNull(analysis?.rr),roomToRun:range?{state:String(range.state||'INSUFFICIENT'),atrUsage:finiteOrNull(range.atrUsage),medianRangeUsage:finiteOrNull(range.medianRangeUsage),sameTimePace:finiteOrNull(range.sameTimePace),shadowOnly:true}:null,research:research?{confirmationScore:researchScore,confidenceLabel:String(research.confidenceLabel||'UNRESOLVED'),sampleSize:finite(research.sampleSize),winRate:finite(research.winRate),avgReturn:finite(research.avgReturn),rr:finite(research.rr),gatesReady:finite(research.gatesReady),researchedAt:Number(research.researchedAt)||0}:null,researchAdjustment:round(researchAdjustment,1),reason};}
function promotionPriority(row){const bucketOrder={'ACTIONABLE':6,'READY SOON':5,'PULLBACK':4,'WATCH':3,'DISCOVERY':2,'AVOID':0},activity=Math.min(20,Math.max(0,row.scoreVelocity))+Math.min(12,Math.max(0,(row.relativeVolume-1)*8)),historical=row.research?clamp((row.research.confirmationScore-50)*.3,-15,15):0;return(bucketOrder[row.bucket]||0)*100+row.screenScore+activity+historical;}
function bucketFor(status,analysis){if(status==='BUY NOW')return'ACTIONABLE';if(status==='SETUP — READY SOON')return'READY SOON';if(status==='WAIT FOR PULLBACK')return'PULLBACK';if(status==='AVOID'||status==='SELL / EXIT')return'AVOID';if(analysis)return'WATCH';return'DISCOVERY';}
function reasonFor({status,analysis,relativeVolume,scoreVelocity,research}){if(status==='BUY NOW')return'All saved higher-timeframe and live execution gates are cleared.';if(status==='SETUP — READY SOON')return analysis?.reason||'High-quality setup; one timing or confirmation step remains.';if(status==='WAIT FOR PULLBACK')return'Strong enough to watch, but current price is extended; do not chase.';if(status==='AVOID')return analysis?.reason||'Deep analysis rejects a new entry.';if(status==='SELL / EXIT')return analysis?.reason||'Existing thesis is broken; this is not a new-entry candidate.';if(analysis?.criticalFailed?.length)return`Deep analysis is waiting on: ${analysis.criticalFailed.join(', ')}.`;if(research?.confirmationScore>=75)return'After-hours historical research strongly confirms this candidate; promote it for fresh live-gate analysis.';if(research?.confirmationScore<45&&research?.researchedAt)return'Historical confirmation is weak; live evidence must improve before promotion.';if(relativeVolume>=1.5&&scoreVelocity>0)return'Unusual participation is increasing; candidate deserves deeper analysis.';if(scoreVelocity>0)return'Discovery score is improving; watch for confirmation.';return'Discovery candidate; deep analysis has not promoted it yet.';}
function marketModeFor(now){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)),p=Object.fromEntries(parts.map(x=>[x.type,x.value])),weekend=p.weekday==='Sat'||p.weekday==='Sun',minutes=Number(p.hour)*60+Number(p.minute),d=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))),day=d.getUTCDay(),monday=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-(day===0?6:day-1)));return{weekend,weekday:p.weekday,minutes,weekKey:monday.toISOString().slice(0,10),weekendResearchWindowOpen:p.weekday==='Sun'||(p.weekday==='Sat'&&minutes>=675),executionMessage:weekend?'Market closed — weekend labels are planning states only. Fresh Monday confirmation is required.':'Live-market labels may become executable only when all current gates clear.'};}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}function finiteOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}function round(v,d=1){const p=10**d;return Math.round(v*p)/p;}
