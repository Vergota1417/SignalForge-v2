import { listRadarQuotes, listSignals } from './db.js';
import { getDiscoveryPool, getDiscoveryStatus } from './discovery.js';

const STATUS_BOOST={
  'BUY NOW':42,
  'SETUP — READY SOON':28,
  'WAIT FOR PULLBACK':8,
  'WAIT — SETUP NOT READY':0,
  'AVOID':-32,
  'SELL / EXIT':-42
};

export async function getSmartScreenerSnapshot(env,{limit=30}={}){
  const [quotes,signals,pool,status]=await Promise.all([
    listRadarQuotes(env,24*60*60*1000,80),
    listSignals(env),
    getDiscoveryPool(env,{limit:120}),
    getDiscoveryStatus(env)
  ]);
  const rows=buildScreenerRows(quotes,signals).slice(0,Math.max(5,Math.min(50,Number(limit)||30)));
  const analyzed=rows.filter(row=>row.deepAnalysis).length;
  return {
    rows,
    updatedAt:Math.max(0,...rows.map(row=>Number(row.quoteUpdatedAt)||0)),
    coverage:{
      weeklyPool:pool.length,
      catalogSize:status.catalogSize,
      scannedSymbols:status.scannedSymbols,
      rankedNow:rows.length,
      deepAnalyzed:analyzed
    },
    methodology:{
      stage1:'Discovery score: movement + relative volume + liquidity + score velocity.',
      stage2:'Deep-analysis boost: critical-gate status is added when a saved analysis exists.',
      rule:'A high discovery score never overrides AVOID or SELL / EXIT.'
    }
  };
}

export function buildScreenerRows(quotes=[],signals=[]){
  const signalMap=new Map(signals.filter(Boolean).map(row=>[row.symbol,row]));
  return quotes
    .map(quote=>buildRow(quote,signalMap.get(quote.symbol)))
    .filter(row=>row.price>=5&&row.dollarVolume>=2_000_000&&row.discoveryScore>-100)
    .sort((a,b)=>b.screenScore-a.screenScore||b.scoreVelocity-a.scoreVelocity||b.relativeVolume-a.relativeVolume||a.symbol.localeCompare(b.symbol));
}

function buildRow(quote,signal){
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
  const overextensionPenalty=status==='WAIT FOR PULLBACK'?10:0;
  const bucket=bucketFor(status,analysis);
  const rawScore=round(discoveryScore+statusBoost+velocityBoost+participationBoost+gateBoost-overextensionPenalty,1);
  const screenScore=bucket==='AVOID'?Math.min(rawScore,-10):rawScore;
  const reason=reasonFor({status,analysis,relativeVolume,scoreVelocity});
  return {
    symbol:String(quote.symbol||''),
    name:String(quote.name||quote.symbol||''),
    exchange:String(quote.exchange||''),
    price:finite(quote.price),
    changePct:finite(quote.changePct),
    relativeVolume,
    dollarVolume,
    discoveryScore:round(discoveryScore,1),
    scoreVelocity:round(scoreVelocity,1),
    screenScore,
    bucket,
    status,
    readiness:analysis?finite(analysis.readiness):null,
    gatesReady,
    gateTotal,
    criticalFailed:Array.isArray(analysis?.criticalFailed)?analysis.criticalFailed:[],
    deepAnalysis:Boolean(analysis),
    deepUpdatedAt:Number(signal?.updatedAt)||0,
    quoteUpdatedAt:Number(quote.updatedAt)||0,
    preferredEntryLow:finiteOrNull(analysis?.preferredEntryLow),
    preferredEntryHigh:finiteOrNull(analysis?.preferredEntryHigh),
    overextension:finiteOrNull(analysis?.overextension),
    thesisBreak:finiteOrNull(analysis?.thesisBreak),
    target:finiteOrNull(analysis?.target),
    rr:finiteOrNull(analysis?.rr),
    reason
  };
}

function bucketFor(status,analysis){
  if(status==='BUY NOW')return'ACTIONABLE';
  if(status==='SETUP — READY SOON')return'READY SOON';
  if(status==='WAIT FOR PULLBACK')return'PULLBACK';
  if(status==='AVOID'||status==='SELL / EXIT')return'AVOID';
  if(analysis)return'WATCH';
  return'DISCOVERY';
}

function reasonFor({status,analysis,relativeVolume,scoreVelocity}){
  if(status==='BUY NOW')return'All saved critical gates are cleared and the setup is buy-ready.';
  if(status==='SETUP — READY SOON')return'High-quality setup; one timing or confirmation step remains.';
  if(status==='WAIT FOR PULLBACK')return'Strong enough to watch, but current price is extended; do not chase.';
  if(status==='AVOID')return analysis?.reason||'Deep analysis rejects a new entry.';
  if(status==='SELL / EXIT')return analysis?.reason||'Existing thesis is broken; this is not a new-entry candidate.';
  if(analysis?.criticalFailed?.length)return`Deep analysis is waiting on: ${analysis.criticalFailed.join(', ')}.`;
  if(relativeVolume>=1.5&&scoreVelocity>0)return'Unusual participation is increasing; candidate deserves deeper analysis.';
  if(scoreVelocity>0)return'Discovery score is improving; watch for confirmation.';
  return'Discovery candidate; deep analysis has not promoted it yet.';
}

function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function finiteOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function round(v,d=1){const p=10**d;return Math.round(v*p)/p;}
