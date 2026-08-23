import { analyze } from './analysis.js';
import { listPortfolioPositions, listRadarQuotes, listSignals } from './db.js';
import { getWeeklyResearchUniverse } from './discovery.js';
import { getMarketData } from './market.js';
import { recordAnalysisEvidence } from './evidence.js';

const DAY_MS=86_400_000;
const RESEARCH_STALE_MS=20*60*60*1000;
const DEFAULT_TARGET_PCT=.85;
const DEFAULT_MAX_PER_RUN=6;

export async function ensureResearchSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS after_hours_research (
      symbol TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'UNKNOWN',
      confirmation_score REAL NOT NULL DEFAULT 0,
      confidence_label TEXT NOT NULL DEFAULT 'UNRESOLVED',
      sample_size INTEGER NOT NULL DEFAULT 0,
      win_rate REAL NOT NULL DEFAULT 0,
      avg_return REAL NOT NULL DEFAULT 0,
      rr REAL NOT NULL DEFAULT 0,
      gates_ready INTEGER NOT NULL DEFAULT 0,
      summary_json TEXT NOT NULL DEFAULT '{}',
      analysis_json TEXT NOT NULL DEFAULT '{}',
      researched_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS after_hours_research_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_key TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER NOT NULL,
      usage_before INTEGER NOT NULL DEFAULT 0,
      usage_after INTEGER NOT NULL DEFAULT 0,
      quota_max INTEGER NOT NULL DEFAULT 0,
      target_requests INTEGER NOT NULL DEFAULT 0,
      candidates_json TEXT NOT NULL DEFAULT '[]',
      researched_json TEXT NOT NULL DEFAULT '[]',
      skipped_reason TEXT NOT NULL DEFAULT ''
    )`)
  ]);
}

export async function providerBudget(env,{now=Date.now()}={}){
  const max=clampInt(env.MAX_PROVIDER_REQUESTS_PER_DAY,50,5000,700);
  const targetPct=clampNum(env.AFTER_HOURS_QUOTA_TARGET_PCT,.50,.95,DEFAULT_TARGET_PCT);
  const targetRequests=Math.max(1,Math.floor(max*targetPct));
  const dayKey=new Date(now).toISOString().slice(0,10);
  const row=await env.DB.prepare(`SELECT requests FROM provider_usage WHERE day_key=?`).bind(dayKey).first();
  const used=Number(row?.requests)||0;
  return{dayKey,max,targetPct,targetRequests,used,remainingToTarget:Math.max(0,targetRequests-used),hardRemaining:Math.max(0,max-used),reserve:Math.max(0,max-targetRequests)};
}

export async function getResearchMap(env,{maxAgeMs=7*DAY_MS}={}){
  await ensureResearchSchema(env);
  const cutoff=Date.now()-Math.max(DAY_MS,Number(maxAgeMs)||7*DAY_MS);
  const rows=await env.DB.prepare(`SELECT symbol,status,confirmation_score AS confirmationScore,confidence_label AS confidenceLabel,sample_size AS sampleSize,win_rate AS winRate,avg_return AS avgReturn,rr,gates_ready AS gatesReady,summary_json AS summaryJson,analysis_json AS analysisJson,researched_at AS researchedAt FROM after_hours_research WHERE researched_at>=?`).bind(cutoff).all();
  const map=new Map();
  for(const row of rows.results||[]){
    let summary={},analysis={};
    try{summary=JSON.parse(row.summaryJson||'{}');}catch{}
    try{analysis=JSON.parse(row.analysisJson||'{}');}catch{}
    map.set(row.symbol,{...row,confirmationScore:Number(row.confirmationScore)||0,sampleSize:Number(row.sampleSize)||0,winRate:Number(row.winRate)||0,avgReturn:Number(row.avgReturn)||0,rr:Number(row.rr)||0,gatesReady:Number(row.gatesReady)||0,researchedAt:Number(row.researchedAt)||0,summary,analysis});
  }
  return map;
}

export async function getAfterHoursResearchStatus(env){
  await ensureResearchSchema(env);
  const [budget,count,lastRun]=await Promise.all([
    providerBudget(env),
    env.DB.prepare(`SELECT COUNT(*) AS count,MAX(researched_at) AS lastResearchedAt FROM after_hours_research`).first(),
    env.DB.prepare(`SELECT day_key AS dayKey,started_at AS startedAt,completed_at AS completedAt,usage_before AS usageBefore,usage_after AS usageAfter,quota_max AS quotaMax,target_requests AS targetRequests,candidates_json AS candidatesJson,researched_json AS researchedJson,skipped_reason AS skippedReason FROM after_hours_research_runs ORDER BY id DESC LIMIT 1`).first()
  ]);
  let candidates=[],researched=[];
  try{candidates=JSON.parse(lastRun?.candidatesJson||'[]');}catch{}
  try{researched=JSON.parse(lastRun?.researchedJson||'[]');}catch{}
  return{budget,researchCount:Number(count?.count)||0,lastResearchedAt:Number(count?.lastResearchedAt)||0,lastRun:lastRun?{...lastRun,startedAt:Number(lastRun.startedAt)||0,completedAt:Number(lastRun.completedAt)||0,usageBefore:Number(lastRun.usageBefore)||0,usageAfter:Number(lastRun.usageAfter)||0,quotaMax:Number(lastRun.quotaMax)||0,targetRequests:Number(lastRun.targetRequests)||0,candidates,researched}:null};
}

export async function runAfterHoursResearch(env,{now=Date.now(),maxPerRun=DEFAULT_MAX_PER_RUN,expandUniverse=false}={}){
  await ensureResearchSchema(env);
  const startedAt=Date.now(),budget=await providerBudget(env,{now});
  const runCap=Math.max(1,Math.min(12,Number(maxPerRun)||DEFAULT_MAX_PER_RUN));
  if(budget.remainingToTarget<=1)return saveRun(env,{startedAt,budget,candidates:[],researched:[],skippedReason:'quota-target-reached'});

  const [positions,signals,quotes,researchMap,fallbackSymbols]=await Promise.all([
    listPortfolioPositions(env),
    listSignals(env),
    listRadarQuotes(env,36*60*60*1000,100),
    getResearchMap(env,{maxAgeMs:30*DAY_MS}),
    expandUniverse?getWeeklyResearchUniverse(env,{limit:36,now}):Promise.resolve([])
  ]);
  const candidateLimit=Math.min(runCap,Math.max(1,budget.remainingToTarget-1));
  const candidates=selectResearchCandidates({positions,signals,quotes,researchMap,fallbackSymbols,now,limit:candidateLimit});
  if(!candidates.length)return saveRun(env,{startedAt,budget,candidates:[],researched:[],skippedReason:'no-stale-qualified-candidates'});

  let benchmarkCandles=null;
  try{benchmarkCandles=(await getMarketData(env,'SPY','1Y',false,{completedOnly:true})).candles;}
  catch(error){console.error(JSON.stringify({event:'after_hours_benchmark_error',message:error?.message||String(error)}));}
  if(!benchmarkCandles)return saveRun(env,{startedAt,budget,candidates:candidates.map(x=>x.symbol),researched:[],skippedReason:'benchmark-unavailable'});

  const researched=[];
  for(const candidate of candidates){
    const liveBudget=await providerBudget(env,{now:Date.now()});
    if(liveBudget.remainingToTarget<=0)break;
    try{
      const market=await getMarketData(env,candidate.symbol,'1Y',false,{completedOnly:true});
      const analysis=analyze(market.candles,candidate.symbol,{benchmarkCandles});
      const confirmation=historicalConfirmation(analysis);
      const observedAt=Date.now();
      await saveResearch(env,{symbol:candidate.symbol,analysis,confirmation,now:observedAt});
      await recordAnalysisEvidence(env,analysis,{source:expandUniverse?'weekend-research':'after-hours-research',timeframe:'1Y',quote:candidate,now:observedAt});
      researched.push({symbol:candidate.symbol,priority:candidate.priority,status:analysis.status,confirmationScore:confirmation.score,label:confirmation.label,sampleSize:confirmation.sampleSize,winRate:confirmation.winRate,avgReturn:confirmation.avgReturn,rr:confirmation.rr});
    }catch(error){
      console.error(JSON.stringify({event:'after_hours_research_error',symbol:candidate.symbol,message:error?.message||String(error)}));
      if(/quota|429|too many requests/i.test(String(error?.message||'')))break;
    }
  }
  const after=await providerBudget(env,{now:Date.now()});
  return saveRun(env,{startedAt,budget:{...budget,usedAfter:after.used},candidates:candidates.map(x=>x.symbol),researched,skippedReason:researched.length?'':'research-unavailable'});
}

export function selectResearchCandidates({positions=[],signals=[],quotes=[],researchMap=new Map(),fallbackSymbols=[],now=Date.now(),limit=6}={}){
  const positionSet=new Set((positions||[]).map(x=>String(x.symbol||'').toUpperCase()).filter(Boolean));
  const signalMap=new Map((signals||[]).map(x=>[String(x.symbol||'').toUpperCase(),x]));
  const quoteMap=new Map((quotes||[]).map(x=>[String(x.symbol||'').toUpperCase(),x]));
  const fallbackIndex=new Map((fallbackSymbols||[]).map((x,i)=>[String(x||'').toUpperCase(),i]));
  const symbols=new Set([...positionSet,...signalMap.keys(),...quoteMap.keys(),...fallbackIndex.keys()]);
  const rows=[];
  for(const symbol of symbols){
    if(!symbol||symbol==='SPY')continue;
    const signal=signalMap.get(symbol),quote=quoteMap.get(symbol),prior=researchMap.get(symbol),researchedAt=Number(prior?.researchedAt)||0;
    if(researchedAt&&now-researchedAt<RESEARCH_STALE_MS)continue;
    const status=String(signal?.status||signal?.analysis?.status||'NOT ANALYZED');
    if(!positionSet.has(symbol)&&(status==='AVOID'||status==='SELL / EXIT'))continue;
    const discovery=finite(quote?.rollingDiscoveryScore??quote?.discoveryScore??quote?.score);
    const velocity=finite(quote?.scoreVelocity);
    const rv=Math.max(0,finite(quote?.relativeVolume));
    const readiness=finite(signal?.readiness??signal?.analysis?.readiness);
    let priority=0;
    if(positionSet.has(symbol))priority+=1000;
    if(status==='BUY NOW')priority+=700;
    else if(status==='SETUP — READY SOON')priority+=600;
    else if(status==='WAIT FOR PULLBACK')priority+=500;
    else if(status==='WAIT — SETUP NOT READY')priority+=300;
    else if(status==='NOT ANALYZED')priority+=250;
    if(fallbackIndex.has(symbol))priority+=Math.max(0,180-fallbackIndex.get(symbol)*4);
    priority+=Math.max(-50,Math.min(150,discovery));
    priority+=Math.max(-30,Math.min(80,velocity*2));
    priority+=Math.max(0,Math.min(60,(rv-1)*30));
    priority+=Math.max(0,Math.min(60,readiness*.6));
    rows.push({symbol,status,owned:positionSet.has(symbol),priority:Math.round(priority*10)/10,discoveryScore:discovery,scoreVelocity:velocity,relativeVolume:rv,researchedAt,source:fallbackIndex.has(symbol)?'weekly-universe':'active-pool'});
  }
  return rows.sort((a,b)=>b.priority-a.priority||a.researchedAt-b.researchedAt||a.symbol.localeCompare(b.symbol)).slice(0,Math.max(1,Math.min(12,Number(limit)||6)));
}

export function historicalConfirmation(analysis){
  const engines=analysis?.engines?Object.values(analysis.engines):[];
  const gatesReady=engines.filter(x=>x?.ready).length;
  const readiness=clampNum(analysis?.readiness,0,100,0);
  const sampleSize=Math.max(0,Math.round(finite(analysis?.wf?.sample)));
  const winRate=clampNum(analysis?.wf?.winRate,0,1,0);
  const avgReturn=finite(analysis?.wf?.avgReturn);
  const rr=Math.max(0,finite(analysis?.rr));
  const rs=finite(analysis?.relativeStrength20);
  const regimePenalty=analysis?.benchmark?.riskOff?12:0;
  const sampleScore=sampleSize>=30?15:sampleSize>=20?12:sampleSize>=12?9:sampleSize>=6?5:0;
  const winScore=clampNum((winRate-.45)/.25*25,0,25,0);
  const expectancyScore=clampNum((avgReturn+.01)/.07*18,0,18,0);
  const rrScore=clampNum((rr-1)/1.5*15,0,15,0);
  const gateScore=gatesReady/Math.max(4,engines.length||4)*15;
  const rsScore=clampNum((rs+.03)/.10*7,0,7,0);
  const readinessScore=readiness*.05;
  const score=Math.round(clampNum(sampleScore+winScore+expectancyScore+rrScore+gateScore+rsScore+readinessScore-regimePenalty,0,100,0));
  const label=score>=75?'STRONG':score>=60?'CONFIRMING':score>=45?'MIXED':'WEAK';
  return{score,label,sampleSize,winRate,avgReturn,rr,gatesReady,readiness,relativeStrength20:rs,riskOff:Boolean(analysis?.benchmark?.riskOff)};
}

async function saveResearch(env,{symbol,analysis,confirmation,now}){
  const summary={score:confirmation.score,label:confirmation.label,sampleSize:confirmation.sampleSize,winRate:confirmation.winRate,avgReturn:confirmation.avgReturn,rr:confirmation.rr,gatesReady:confirmation.gatesReady,readiness:confirmation.readiness,relativeStrength20:confirmation.relativeStrength20,riskOff:confirmation.riskOff};
  await env.DB.prepare(`INSERT INTO after_hours_research(symbol,status,confirmation_score,confidence_label,sample_size,win_rate,avg_return,rr,gates_ready,summary_json,analysis_json,researched_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET status=excluded.status,confirmation_score=excluded.confirmation_score,confidence_label=excluded.confidence_label,sample_size=excluded.sample_size,win_rate=excluded.win_rate,avg_return=excluded.avg_return,rr=excluded.rr,gates_ready=excluded.gates_ready,summary_json=excluded.summary_json,analysis_json=excluded.analysis_json,researched_at=excluded.researched_at,updated_at=excluded.updated_at`).bind(symbol,String(analysis?.status||'UNKNOWN'),confirmation.score,confirmation.label,confirmation.sampleSize,confirmation.winRate,confirmation.avgReturn,confirmation.rr,confirmation.gatesReady,JSON.stringify(summary),JSON.stringify(analysis),now,now).run();
}

async function saveRun(env,{startedAt,budget,candidates,researched,skippedReason}){
  const completedAt=Date.now();
  const after=budget.usedAfter??(await providerBudget(env,{now:completedAt})).used;
  await env.DB.prepare(`INSERT INTO after_hours_research_runs(day_key,started_at,completed_at,usage_before,usage_after,quota_max,target_requests,candidates_json,researched_json,skipped_reason) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(budget.dayKey,startedAt,completedAt,budget.used,after,budget.max,budget.targetRequests,JSON.stringify(candidates||[]),JSON.stringify(researched||[]),String(skippedReason||'')).run();
  return{dayKey:budget.dayKey,startedAt,completedAt,usageBefore:budget.used,usageAfter:after,quotaMax:budget.max,targetRequests:budget.targetRequests,reserve:budget.reserve,candidates:candidates||[],researched:researched||[],skippedReason:skippedReason||''};
}

function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function clampNum(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function clampInt(v,min,max,fallback){const n=Number.parseInt(v,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
