import { ensureEvidenceSchema } from './evidence.js';
import { getMarketData } from './market.js';
import { benchmarkContextFor } from './benchmark-context.js';
import { recordOperation } from './operations.js';

export const OUTCOME_HORIZONS=[1,3,5,10,20];
const MAX_PENDING_ROWS=750;
const outcomeSchemaReadyByDb=new WeakMap();

export async function ensureOutcomeSchema(env){
  await ensureEvidenceSchema(env);
  let ready=outcomeSchemaReadyByDb.get(env.DB);
  if(!ready){
    ready=initializeOutcomeSchema(env).catch(error=>{outcomeSchemaReadyByDb.delete(env.DB);throw error;});
    outcomeSchemaReadyByDb.set(env.DB,ready);
  }
  return ready;
}

async function initializeOutcomeSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS evidence_outcomes (
      observation_id INTEGER NOT NULL,horizon_sessions INTEGER NOT NULL,evaluated_at INTEGER NOT NULL,entry_price REAL NOT NULL,outcome_price REAL NOT NULL,forward_return REAL NOT NULL,mfe REAL NOT NULL,mae REAL NOT NULL,target_hit INTEGER,stop_hit INTEGER,first_hit TEXT NOT NULL DEFAULT 'NONE',outcome_session TEXT NOT NULL,
      industry_benchmark TEXT,industry_return REAL,industry_excess_return REAL,sector_benchmark TEXT,sector_return REAL,sector_excess_return REAL,market_benchmark TEXT,market_return REAL,market_excess_return REAL,
      PRIMARY KEY(observation_id,horizon_sessions)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_outcomes_horizon ON evidence_outcomes(horizon_sessions,evaluated_at DESC)`)
  ]);
  for(const [column,type] of [['industry_benchmark','TEXT'],['industry_return','REAL'],['industry_excess_return','REAL'],['sector_benchmark','TEXT'],['sector_return','REAL'],['sector_excess_return','REAL'],['market_benchmark','TEXT'],['market_return','REAL'],['market_excess_return','REAL']]){try{await env.DB.prepare(`ALTER TABLE evidence_outcomes ADD COLUMN ${column} ${type}`).run();}catch(error){if(!/duplicate column/i.test(String(error?.message||error)))throw error;}}
}

export async function runOutcomeTracker(env,{now=Date.now(),maxSymbols=4,observationType=null}={}){
  try{
    await ensureOutcomeSchema(env);const cutoff=now-12*60*60*1000,type=normalizeObservationType(observationType);
    const query=type
      ?env.DB.prepare(`SELECT e.id,e.symbol,e.observed_at AS observedAt,e.price,e.target,e.thesis_break AS thesisBreak,e.payload_json AS payloadJson FROM evidence_observations e WHERE e.observation_type=? AND e.observed_at<=? AND e.price>0 AND NOT EXISTS(SELECT 1 FROM evidence_outcomes o WHERE o.observation_id=e.id AND o.horizon_sessions=20) ORDER BY e.observed_at ASC,e.id ASC LIMIT ?`).bind(type,cutoff,MAX_PENDING_ROWS)
      :env.DB.prepare(`SELECT e.id,e.symbol,e.observed_at AS observedAt,e.price,e.target,e.thesis_break AS thesisBreak,e.payload_json AS payloadJson FROM evidence_observations e WHERE e.observed_at<=? AND e.price>0 AND NOT EXISTS(SELECT 1 FROM evidence_outcomes o WHERE o.observation_id=e.id AND o.horizon_sessions=20) ORDER BY e.observed_at ASC,e.id ASC LIMIT ?`).bind(cutoff,MAX_PENDING_ROWS);
    const rows=await query.all();
    const pending=(rows.results||[]).map(normalizeObservation).filter(x=>x.symbol&&x.entryPrice>0),grouped=groupBySymbol(pending),symbols=[...grouped.keys()].slice(0,Math.max(1,Math.min(12,Number(maxSymbols)||4))),completed=[],deferred=[],errors=[];
    for(const symbol of symbols){try{
      const observations=grouped.get(symbol)||[],mapping=observations[0]?.benchmarkContext||benchmarkContextFor(symbol),benchmarkSymbols=[...new Set([mapping?.industryBenchmark,mapping?.sectorBenchmark,mapping?.marketBenchmark].filter(Boolean).filter(x=>x!==symbol))];
      const stock=(await getMarketData(env,symbol,'3M',false,{completedOnly:true,purpose:'outcome-stock-3m'})).candles,benchmarks={};
      for(const b of benchmarkSymbols){try{benchmarks[b]=(await getMarketData(env,b,'3M',false,{completedOnly:true,purpose:'outcome-benchmark-3m'})).candles;}catch(error){errors.push({symbol:b,contextSymbol:symbol,message:String(error?.message||error)});if(/quota|429|too many requests/i.test(String(error?.message||'')))break;}}
      for(const observation of observations){const results=evaluateObservationOutcomes(observation,stock,{now,benchmarkCandles:benchmarks});for(const result of results){await saveOutcome(env,result);completed.push({observationId:observation.id,symbol,horizon:result.horizonSessions,forwardReturn:result.forwardReturn,marketExcessReturn:result.marketExcessReturn,sectorExcessReturn:result.sectorExcessReturn,firstHit:result.firstHit});}if(results.length<OUTCOME_HORIZONS.length)deferred.push({observationId:observation.id,symbol,completedHorizons:results.map(x=>x.horizonSessions)});}
    }catch(error){errors.push({symbol,message:String(error?.message||error)});if(/quota|429|too many requests/i.test(String(error?.message||'')))break;}}
    const result={observationType:type||'ALL',symbolsProcessed:symbols.length,observationsConsidered:pending.length,outcomesCompleted:completed.length,deferred:deferred.length,errors,completed};
    await recordOperation(env,'outcome-tracker',{status:errors.length&&!completed.length?'ERROR':pending.length?'OK':'IDLE',at:now,detail:{observationType:result.observationType,symbolsProcessed:result.symbolsProcessed,observationsConsidered:result.observationsConsidered,outcomesCompleted:result.outcomesCompleted,deferred:result.deferred,errors:errors.slice(0,6)}});return result;
  }catch(error){await recordOperation(env,'outcome-tracker',{status:'ERROR',at:now,detail:{observationType:normalizeObservationType(observationType)||'ALL',message:error?.message||String(error)}}).catch(()=>{});throw error;}
}

export function evaluateObservationOutcomes(observation,candles,{now=Date.now(),benchmarkCandles={}}={}){
  const entryPrice=Number(observation?.entryPrice??observation?.price)||0;if(!(entryPrice>0))return[];const observedDate=easternDateKey(Number(observation?.observedAt)||now),future=futureSessions(candles,observedDate),out=[],mapping=observation?.benchmarkContext||benchmarkContextFor(observation?.symbol);
  for(const horizon of OUTCOME_HORIZONS){if(future.length<horizon)continue;const window=future.slice(0,horizon),last=window.at(-1),outcomePrice=Number(last.close),high=Math.max(...window.map(c=>Number(c.high))),low=Math.min(...window.map(c=>Number(c.low))),target=positiveOrNull(observation?.target),stop=positiveOrNull(observation?.thesisBreak),hits=firstHit(window,{target,stop}),forwardReturn=outcomePrice/entryPrice-1,outcomeSession=utcDateKey(last.time);
    const industry=benchmarkOutcome(mapping?.industryBenchmark,benchmarkCandles,observedDate,outcomeSession),sector=benchmarkOutcome(mapping?.sectorBenchmark,benchmarkCandles,observedDate,outcomeSession),market=benchmarkOutcome(mapping?.marketBenchmark,benchmarkCandles,observedDate,outcomeSession);
    out.push({observationId:Number(observation.id),symbol:String(observation.symbol||''),horizonSessions:horizon,evaluatedAt:Number(now)||Date.now(),entryPrice,outcomePrice,forwardReturn,mfe:high/entryPrice-1,mae:low/entryPrice-1,targetHit:hits.targetHit,stopHit:hits.stopHit,firstHit:hits.firstHit,outcomeSession,industryBenchmark:mapping?.industryBenchmark||null,industryReturn:industry,industryExcessReturn:industry==null?null:forwardReturn-industry,sectorBenchmark:mapping?.sectorBenchmark||null,sectorReturn:sector,sectorExcessReturn:sector==null?null:forwardReturn-sector,marketBenchmark:mapping?.marketBenchmark||null,marketReturn:market,marketExcessReturn:market==null?null:forwardReturn-market});
  }return out;
}

export function firstHit(candles,{target=null,stop=null}={}){let targetHit=false,stopHit=false,firstHit='NONE';for(const candle of candles||[]){const hitTarget=target!=null&&Number(candle.high)>=target,hitStop=stop!=null&&Number(candle.low)<=stop;targetHit=targetHit||hitTarget;stopHit=stopHit||hitStop;if(firstHit==='NONE'&&(hitTarget||hitStop))firstHit=hitTarget&&hitStop?'AMBIGUOUS_SAME_SESSION':hitTarget?'TARGET':'STOP';}return{targetHit,stopHit,firstHit};}
export async function getOutcomeStatus(env){await ensureOutcomeSchema(env);const[count,complete,latest]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) AS count FROM evidence_outcomes`).first(),env.DB.prepare(`SELECT COUNT(DISTINCT observation_id) AS count FROM evidence_outcomes WHERE horizon_sessions=20`).first(),env.DB.prepare(`SELECT observation_id AS observationId,horizon_sessions AS horizonSessions,evaluated_at AS evaluatedAt FROM evidence_outcomes ORDER BY evaluated_at DESC LIMIT 1`).first()]);return{outcomeRows:Number(count?.count)||0,observationsWith20SessionOutcome:Number(complete?.count)||0,lastOutcome:latest?{...latest,observationId:Number(latest.observationId),horizonSessions:Number(latest.horizonSessions),evaluatedAt:Number(latest.evaluatedAt)||0}:null};}
async function saveOutcome(env,row){await env.DB.prepare(`INSERT OR REPLACE INTO evidence_outcomes(observation_id,horizon_sessions,evaluated_at,entry_price,outcome_price,forward_return,mfe,mae,target_hit,stop_hit,first_hit,outcome_session,industry_benchmark,industry_return,industry_excess_return,sector_benchmark,sector_return,sector_excess_return,market_benchmark,market_return,market_excess_return) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(row.observationId,row.horizonSessions,row.evaluatedAt,row.entryPrice,row.outcomePrice,row.forwardReturn,row.mfe,row.mae,boolInt(row.targetHit),boolInt(row.stopHit),row.firstHit,row.outcomeSession,row.industryBenchmark,row.industryReturn,row.industryExcessReturn,row.sectorBenchmark,row.sectorReturn,row.sectorExcessReturn,row.marketBenchmark,row.marketReturn,row.marketExcessReturn).run();}
function benchmarkOutcome(symbol,seriesBySymbol,observedDate,outcomeSession){if(!symbol)return null;const series=seriesBySymbol?.[symbol];if(!Array.isArray(series))return null;const future=futureSessions(series,observedDate),end=future.find(c=>utcDateKey(c.time)===outcomeSession);if(!end)return null;const prior=(series||[]).filter(c=>validDailyCandle(c)&&utcDateKey(c.time)<=observedDate).sort((a,b)=>Number(a.time)-Number(b.time)).at(-1);return prior&&Number(prior.close)>0?Number(end.close)/Number(prior.close)-1:null;}
function futureSessions(candles,observedDate){return(candles||[]).filter(c=>validDailyCandle(c)&&utcDateKey(c.time)>observedDate).sort((a,b)=>Number(a.time)-Number(b.time));}
function normalizeObservation(row){let payload={};try{payload=JSON.parse(row.payloadJson||'{}');}catch{}return{id:Number(row.id),symbol:String(row.symbol||'').toUpperCase(),observedAt:Number(row.observedAt)||0,entryPrice:Number(row.price)||0,target:positiveOrNull(row.target),thesisBreak:positiveOrNull(row.thesisBreak),benchmarkContext:payload?.benchmarkContext||benchmarkContextFor(row.symbol)};}
function normalizeObservationType(value){const type=String(value||'').trim().toUpperCase();return/^[A-Z_]{2,32}$/.test(type)?type:null;}
function groupBySymbol(rows){const map=new Map();for(const row of rows){if(!map.has(row.symbol))map.set(row.symbol,[]);map.get(row.symbol).push(row);}return map;}function validDailyCandle(c){return Number.isFinite(Number(c?.time))&&Number(c?.open)>0&&Number(c?.high)>0&&Number(c?.low)>0&&Number(c?.close)>0;}function utcDateKey(time){return new Date(Number(time)).toISOString().slice(0,10);}function easternDateKey(time){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time)).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`;}function positiveOrNull(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}function boolInt(v){return v?1:0;}
