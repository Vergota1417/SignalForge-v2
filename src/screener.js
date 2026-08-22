import { analyze } from './analysis.js';
import { listPortfolioPositions, listRadarQuotes, listSignals, recordSignal } from './db.js';
import { getDiscoveryPool, getDiscoveryStatus } from './discovery.js';
import { getMarketData } from './market.js';
import { getResearchMap } from './research.js';

const STATUS_BOOST={
  'BUY NOW':42,
  'SETUP — READY SOON':28,
  'WAIT FOR PULLBACK':8,
  'WAIT — SETUP NOT READY':0,
  'AVOID':-32,
  'SELL / EXIT':-42
};

const PROMOTION_STALE_MS=4*60*60*1000;

export async function getSmartScreenerSnapshot(env,{limit=30}={}){
  const [quotes,signals,pool,status,researchMap]=await Promise.all([
    listRadarQuotes(env,24*60*60*1000,80),
    listSignals(env),
    getDiscoveryPool(env,{limit:120}),
    getDiscoveryStatus(env),
    getResearchMap(env,{maxAgeMs:7*86_400_000})
  ]);
  const rows=buildScreenerRows(quotes,signals,{researchMap}).slice(0,Math.max(5,Math.min(50,Number(limit)||30)));
  const analyzed=rows.filter(row=>row.deepAnalysis).length,researchConfirmed=rows.filter(row=>row.research?.confirmationScore>=60).length;
  return {
    rows,
    updatedAt:Math.max(0,...rows.map(row=>Number(row.quoteUpdatedAt)||0)),
    coverage:{weeklyPool:pool.length,catalogSize:status.catalogSize,scannedSymbols:status.scannedSymbols,rankedNow:rows.length,deepAnalyzed:analyzed,researchConfirmed},
    methodology:{
      stage1:'Discovery score: movement + relative volume + liquidity + score velocity.',
      stage2:'Top discovery candidates are automatically promoted into higher-cost four-engine analysis.',
      stage3:'After-hours 1-year historical research adds a bounded confirmation adjustment; it cannot override AVOID or SELL / EXIT.',
      stage4:'Saved live deep-analysis status remains authoritative for trade state.',
      rule:'Historical research strengthens evidence and ranking, but never replaces the live decision gates.'
    }
  };
}

export async function runScreenerPromotion(env,{maxPromotions=2,now=Date.now()}={}){
  const [quotes,signals,positions,researchMap]=await Promise.all([
    listRadarQuotes(env,24*60*60*1000,80),
    listSignals(env),
    listPortfolioPositions(env),
    getResearchMap(env,{maxAgeMs:7*86_400_000})
  ]);
  const owned=new Set((positions||[]).map(row=>String(row.symbol||'').toUpperCase()));
  const candidates=selectPromotionCandidates(quotes,signals,{owned,now,limit:Math.max(1,Math.min(2,Number(maxPromotions)||2)),researchMap});
  if(!candidates.length)return{promoted:[],candidates:[],skipped:'no-qualified-candidates'};

  let benchmarkCandles=null;
  try{benchmarkCandles=(await getMarketData(env,'SPY','6M',false)).candles;}catch(error){console.error(JSON.stringify({event:'promotion_benchmark_error',message:error?.message||String(error)}));}
  if(!benchmarkCandles)return{promoted:[],candidates:candidates.map(x=>x.symbol),skipped:'benchmark-unavailable'};

  const promoted=[];
  for(const candidate of candidates){
    try{
      const market=await getMarketData(env,candidate.symbol,'6M',false),analysis=analyze(market.candles,candidate.symbol,{benchmarkCandles});
      const event=await recordSignal(env,analysis);
      promoted.push({symbol:candidate.symbol,screenScore:candidate.screenScore,researchScore:candidate.research?.confirmationScore||0,status:analysis.status,readiness:analysis.readiness,changed:event.changed});
    }catch(error){
      console.error(JSON.stringify({event:'screener_promotion_error',symbol:candidate.symbol,message:error?.message||String(error)}));
      break;
    }
  }
  return{promoted,candidates:candidates.map(x=>x.symbol)};
}

export function selectPromotionCandidates(quotes=[],signals=[],{owned=new Set(),now=Date.now(),limit=2,researchMap=new Map()}={}){
  const signalMap=new Map((signals||[]).filter(Boolean).map(row=>[row.symbol,row]));
  return buildScreenerRows(quotes,signals,{researchMap})
    .filter(row=>!owned.has(row.symbol))
    .filter(row=>row.bucket!=='AVOID')
    .filter(row=>row.discoveryScore>=20||row.relativeVolume>=1.25||row.scoreVelocity>=8||row.research?.confirmationScore>=60)
    .filter(row=>{
      const signal=signalMap.get(row.symbol),updated=Number(signal?.updatedAt)||0;
      return !signal?.analysis||now-updated>=PROMOTION_STALE_MS;
    })
    .sort((a,b)=>promotionPriority(b)-promotionPriority(a)||b.screenScore-a.screenScore||b.scoreVelocity-a.scoreVelocity)
    .slice(0,Math.max(1,Math.min(2,Number(limit)||2)));
}

export function buildScreenerRows(quotes=[],signals=[],{researchMap=new Map()}={}){
  const signalMap=new Map(signals.filter(Boolean).map(row=>[row.symbol,row]));
  return quotes
    .map(quote=>buildRow(quote,signalMap.get(quote.symbol),researchMap.get(quote.symbol)))
    .filter(row=>row.price>=5&&row.dollarVolume>=2_000_000&&row.discoveryScore>-100)
    .sort((a,b)=>b.screenScore-a.screenScore||b.scoreVelocity-a.scoreVelocity||b.relativeVolume-a.relativeVolume||a.symbol.localeCompare(b.symbol));
}

function buildRow(quote,signal,research=null){
  const analysis=signal?.analysis||null;
  const status=String(signal?.status||analysis?.status||'NOT ANALYZED');
  const discoveryScore=finite(quote.rollingDiscoveryScore??quote.discoveryScore??quote.score);
  const scoreVelocity=finite(quote.scoreVelocity);
  const relativeVolume=Math.max(0,finite(quote.relativeVolume));
  const dollarVolume=Math.max(0,finite(quote.dollarVolume)||finite(quote.price)*finite(quote.volume));
  const gates=analysis?.engines?Object.values(analysis.engines):[];
  const gatesReady=gates.filter(g=>g?.ready).length;
  const gateTotal=gates.length||4;
  const statusBoost=STATUS_BOOST[status]??0;
  const velocityBoost=clamp(scoreVelocity*1.6,-12,18);
  const participationBoost=clamp((relativeVolume-1)*7,-5,15);
  const gateBoost=analysis?gatesReady*4:0;
  const researchScore=finite(research?.confirmationScore);
  const researchAdjustment=research?clamp((researchScore-50)*.24,-12,12):0;
  const overextensionPenalty=status==='WAIT FOR PULLBACK'?10:0;
  const bucket=bucketFor(status,analysis);
  const rawScore=round(discoveryScore+statusBoost+velocityBoost+participationBoost+gateBoost+researchAdjustment-overextensionPenalty,1);
  const screenScore=bucket==='AVOID'?Math.min(rawScore,-10):rawScore;
  const reason=reasonFor({status,analysis,relativeVolume,scoreVelocity,research});
  return {
    symbol:String(quote.symbol||''),name:String(quote.name||quote.symbol||''),exchange:String(quote.exchange||''),price:finite(quote.price),changePct:finite(quote.changePct),relativeVolume,dollarVolume,
    discoveryScore:round(discoveryScore,1),scoreVelocity:round(scoreVelocity,1),screenScore,bucket,status,readiness:analysis?finite(analysis.readiness):null,gatesReady,gateTotal,
    criticalFailed:Array.isArray(analysis?.criticalFailed)?analysis.criticalFailed:[],deepAnalysis:Boolean(analysis),deepUpdatedAt:Number(signal?.updatedAt)||0,quoteUpdatedAt:Number(quote.updatedAt)||0,
    preferredEntryLow:finiteOrNull(analysis?.preferredEntryLow),preferredEntryHigh:finiteOrNull(analysis?.preferredEntryHigh),overextension:finiteOrNull(analysis?.overextension),thesisBreak:finiteOrNull(analysis?.thesisBreak),target:finiteOrNull(analysis?.target),rr:finiteOrNull(analysis?.rr),
    research:research?{confirmationScore:researchScore,confidenceLabel:String(research.confidenceLabel||'UNRESOLVED'),sampleSize:finite(research.sampleSize),winRate:finite(research.winRate),avgReturn:finite(research.avgReturn),rr:finite(research.rr),gatesReady:finite(research.gatesReady),researchedAt:Number(research.researchedAt)||0}:null,
    researchAdjustment:round(researchAdjustment,1),reason
  };
}

function promotionPriority(row){
  const bucketOrder={'ACTIONABLE':6,'READY SOON':5,'PULLBACK':4,'WATCH':3,'DISCOVERY':2,'AVOID':0};
  const activity=Math.min(20,Math.max(0,row.scoreVelocity))+Math.min(12,Math.max(0,(row.relativeVolume-1)*8));
  const historical=row.research?clamp((row.research.confirmationScore-50)*.3,-15,15):0;
  return (bucketOrder[row.bucket]||0)*100+row.screenScore+activity+historical;
}
function bucketFor(status,analysis){if(status==='BUY NOW')return'ACTIONABLE';if(status==='SETUP — READY SOON')return'READY SOON';if(status==='WAIT FOR PULLBACK')return'PULLBACK';if(status==='AVOID'||status==='SELL / EXIT')return'AVOID';if(analysis)return'WATCH';return'DISCOVERY';}
function reasonFor({status,analysis,relativeVolume,scoreVelocity,research}){if(status==='BUY NOW')return'All saved critical gates are cleared and the setup is buy-ready.';if(status==='SETUP — READY SOON')return'High-quality setup; one timing or confirmation step remains.';if(status==='WAIT FOR PULLBACK')return'Strong enough to watch, but current price is extended; do not chase.';if(status==='AVOID')return analysis?.reason||'Deep analysis rejects a new entry.';if(status==='SELL / EXIT')return analysis?.reason||'Existing thesis is broken; this is not a new-entry candidate.';if(analysis?.criticalFailed?.length)return`Deep analysis is waiting on: ${analysis.criticalFailed.join(', ')}.`;if(research?.confirmationScore>=75)return'After-hours historical research strongly confirms this candidate; promote it for fresh live-gate analysis.';if(research?.confirmationScore<45&&research?.researchedAt)return'Historical confirmation is weak; live evidence must improve before promotion.';if(relativeVolume>=1.5&&scoreVelocity>0)return'Unusual participation is increasing; candidate deserves deeper analysis.';if(scoreVelocity>0)return'Discovery score is improving; watch for confirmation.';return'Discovery candidate; deep analysis has not promoted it yet.';}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function finiteOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function round(v,d=1){const p=10**d;return Math.round(v*p)/p;}
