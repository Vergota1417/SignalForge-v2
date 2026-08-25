import { listRadarQuotes, listSignals } from './db.js';
import { getResearchMap } from './research.js';

const WEEK_MS=7*86_400_000;
const weekendSchemaReadyByDb=new WeakMap();

export async function ensureWeekendSchema(env){
  if(!env?.DB)throw new Error('D1 binding DB is not configured.');
  let ready=weekendSchemaReadyByDb.get(env.DB);
  if(!ready){
    ready=initializeWeekendSchema(env).catch(error=>{weekendSchemaReadyByDb.delete(env.DB);throw error;});
    weekendSchemaReadyByDb.set(env.DB,ready);
  }
  return ready;
}

async function initializeWeekendSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS weekend_intelligence_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key TEXT NOT NULL UNIQUE,
    generated_at INTEGER NOT NULL,
    research_run_json TEXT NOT NULL DEFAULT '{}',
    report_json TEXT NOT NULL DEFAULT '{}'
  )`).run();
}

export async function buildWeekendIntelligenceReport(env,{researchRun=null,now=Date.now()}={}){
  await ensureWeekendSchema(env);
  const weekKey=weekKeyFor(now);
  const previous=await getPreviousReport(env,weekKey);
  const [signals,quotes,researchMap]=await Promise.all([
    listSignals(env),
    listRadarQuotes(env,72*60*60*1000,100),
    getResearchMap(env,{maxAgeMs:14*86_400_000})
  ]);
  const signalMap=new Map((signals||[]).map(x=>[x.symbol,x]));
  const quoteMap=new Map((quotes||[]).map(x=>[x.symbol,x]));
  const previousMap=new Map((previous?.candidates||[]).map(x=>[x.symbol,x]));
  const researchedSymbols=(researchRun?.researched||[]).map(x=>String(x.symbol||'').toUpperCase()).filter(Boolean);
  const fallback=[...researchMap.values()].sort((a,b)=>Number(b.researchedAt)-Number(a.researchedAt)).slice(0,6).map(x=>String(x.symbol||'').toUpperCase());
  const symbols=[...new Set(researchedSymbols.length?researchedSymbols:fallback)].slice(0,12);

  const candidates=[];
  for(const symbol of symbols){
    const signal=signalMap.get(symbol)||null;
    const research=researchMap.get(symbol)||null;
    const quote=quoteMap.get(symbol)||null;
    const analysis=signal?.analysis||research?.analysis||null;
    const score=Number(research?.confirmationScore)||0;
    const prior=previousMap.get(symbol);
    const priorScore=Number(prior?.confirmationScore);
    const scoreChange=Number.isFinite(priorScore)?Math.round((score-priorScore)*10)/10:null;
    const weekendStatus=weekendStatusFor({status:signal?.status||research?.status,score,analysis});
    const entryLow=numOrNull(analysis?.preferredEntryLow);
    const entryHigh=numOrNull(analysis?.preferredEntryHigh);
    const maxChase=numOrNull(analysis?.overextension);
    const thesisBreak=numOrNull(analysis?.thesisBreak);
    const target=numOrNull(analysis?.target);
    const changeLabel=scoreChange===null?'NEW':scoreChange>=5?'IMPROVED':scoreChange<=-5?'WEAKENED':'UNCHANGED';
    candidates.push({
      symbol,
      weekendStatus,
      liveStatus:String(signal?.status||research?.status||analysis?.status||'NOT ANALYZED'),
      confirmationScore:score,
      confidenceLabel:String(research?.confidenceLabel||'UNRESOLVED'),
      sampleSize:Number(research?.sampleSize)||0,
      winRate:Number(research?.winRate)||0,
      avgReturn:Number(research?.avgReturn)||0,
      historicalRR:Number(research?.rr)||0,
      gatesReady:Number(research?.gatesReady)||0,
      readiness:Number(signal?.readiness??analysis?.readiness)||0,
      relativeVolume:Number(quote?.relativeVolume)||0,
      discoveryScore:Number(quote?.rollingDiscoveryScore??quote?.discoveryScore??quote?.score)||0,
      scoreChange,
      changeLabel,
      preferredEntryLow:entryLow,
      preferredEntryHigh:entryHigh,
      maxChasePrice:maxChase,
      thesisBreak,
      target,
      researchedAt:Number(research?.researchedAt)||0,
      reason:weekendReason({weekendStatus,score,analysis,signal,research})
    });
  }

  candidates.sort((a,b)=>statusRank(b.weekendStatus)-statusRank(a.weekendStatus)||b.confirmationScore-a.confirmationScore||b.readiness-a.readiness);
  const counts=countStatuses(candidates);
  const report={
    weekKey,
    generatedAt:now,
    mode:'WEEKEND INTELLIGENCE',
    executionLocked:true,
    nextAction:'Reconfirm fresh price, volume, market regime, and all critical gates before any Monday BUY.',
    researchedCount:candidates.length,
    runResearchedCount:Array.isArray(researchRun?.researched)?researchRun.researched.length:0,
    skippedReason:String(researchRun?.skippedReason||''),
    counts,
    topCandidate:candidates.find(x=>x.weekendStatus!=='REJECTED')||candidates[0]||null,
    candidates
  };
  await env.DB.prepare(`INSERT INTO weekend_intelligence_reports(week_key,generated_at,research_run_json,report_json) VALUES(?,?,?,?) ON CONFLICT(week_key) DO UPDATE SET generated_at=excluded.generated_at,research_run_json=excluded.research_run_json,report_json=excluded.report_json`)
    .bind(weekKey,now,JSON.stringify(researchRun||{}),JSON.stringify(report)).run();
  return report;
}

export async function getWeekendIntelligenceReport(env){
  await ensureWeekendSchema(env);
  const row=await env.DB.prepare(`SELECT report_json AS reportJson,generated_at AS generatedAt FROM weekend_intelligence_reports ORDER BY generated_at DESC LIMIT 1`).first();
  if(!row?.reportJson)return null;
  try{return {...JSON.parse(row.reportJson),generatedAt:Number(row.generatedAt)||0};}catch{return null;}
}

async function getPreviousReport(env,currentWeekKey){
  const row=await env.DB.prepare(`SELECT report_json AS reportJson FROM weekend_intelligence_reports WHERE week_key<>? ORDER BY generated_at DESC LIMIT 1`).bind(currentWeekKey).first();
  if(!row?.reportJson)return null;
  try{return JSON.parse(row.reportJson);}catch{return null;}
}

function weekendStatusFor({status,score,analysis}){
  const s=String(status||'');
  if(s==='AVOID'||s==='SELL / EXIT'||score<45)return'REJECTED';
  if(s==='WAIT FOR PULLBACK')return'PULLBACK CANDIDATE';
  if(s==='BUY NOW'&&score>=60)return'MONDAY CANDIDATE';
  if(s==='SETUP — READY SOON'||score>=75)return'HIGH-PRIORITY WATCH';
  if(analysis&&Array.isArray(analysis.criticalFailed)&&analysis.criticalFailed.length>=3)return'NEEDS CONFIRMATION';
  return'NEEDS CONFIRMATION';
}

function weekendReason({weekendStatus,score,analysis,signal,research}){
  if(weekendStatus==='MONDAY CANDIDATE')return`Friday/live structure was buy-ready and historical confirmation is ${Math.round(score)}/100. Reconfirm Monday before entry.`;
  if(weekendStatus==='HIGH-PRIORITY WATCH')return`Research is promising (${Math.round(score)}/100), but a fresh Monday trigger is still required.`;
  if(weekendStatus==='PULLBACK CANDIDATE')return'Underlying setup remains interesting, but price was extended. Do not chase the Monday open.';
  if(weekendStatus==='REJECTED')return signal?.reason||analysis?.reason||`Historical confirmation is only ${Math.round(score)}/100; keep capital out unless evidence materially improves.`;
  const failed=Array.isArray(analysis?.criticalFailed)?analysis.criticalFailed:[];
  if(failed.length)return`Needs fresh confirmation on ${failed.slice(0,3).join(', ')}.`;
  return research?.confidenceLabel?`Historical evidence is ${String(research.confidenceLabel).toLowerCase()}; Monday price/volume must confirm.`:'Research is incomplete; wait for fresh Monday evidence.';
}

function countStatuses(rows){const out={mondayCandidates:0,highPriority:0,pullback:0,needsConfirmation:0,rejected:0};for(const r of rows){if(r.weekendStatus==='MONDAY CANDIDATE')out.mondayCandidates++;else if(r.weekendStatus==='HIGH-PRIORITY WATCH')out.highPriority++;else if(r.weekendStatus==='PULLBACK CANDIDATE')out.pullback++;else if(r.weekendStatus==='REJECTED')out.rejected++;else out.needsConfirmation++;}return out;}
function statusRank(v){return{'MONDAY CANDIDATE':5,'HIGH-PRIORITY WATCH':4,'PULLBACK CANDIDATE':3,'NEEDS CONFIRMATION':2,'REJECTED':0}[v]||1;}
function numOrNull(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function weekKeyFor(now){const d=new Date(now);const day=d.getUTCDay();const monday=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-(day===0?6:day-1)));return monday.toISOString().slice(0,10);}
