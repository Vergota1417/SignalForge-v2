import { ensureEvidenceSchema } from './evidence.js';
import { getMarketData } from './market.js';

export const OUTCOME_HORIZONS=[1,3,5,10,20];
const MAX_PENDING_ROWS=750;

export async function ensureOutcomeSchema(env){
  await ensureEvidenceSchema(env);
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS evidence_outcomes (
      observation_id INTEGER NOT NULL,
      horizon_sessions INTEGER NOT NULL,
      evaluated_at INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      outcome_price REAL NOT NULL,
      forward_return REAL NOT NULL,
      mfe REAL NOT NULL,
      mae REAL NOT NULL,
      target_hit INTEGER,
      stop_hit INTEGER,
      first_hit TEXT NOT NULL DEFAULT 'NONE',
      outcome_session TEXT NOT NULL,
      PRIMARY KEY(observation_id,horizon_sessions)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_outcomes_horizon ON evidence_outcomes(horizon_sessions,evaluated_at DESC)`)
  ]);
}

export async function runOutcomeTracker(env,{now=Date.now(),maxSymbols=4}={}){
  await ensureOutcomeSchema(env);
  const cutoff=now-12*60*60*1000;
  const rows=await env.DB.prepare(`SELECT e.id,e.symbol,e.observed_at AS observedAt,e.price,e.target,e.thesis_break AS thesisBreak
    FROM evidence_observations e
    WHERE e.observed_at<=? AND e.price>0
      AND NOT EXISTS(SELECT 1 FROM evidence_outcomes o WHERE o.observation_id=e.id AND o.horizon_sessions=20)
    ORDER BY e.observed_at ASC,e.id ASC LIMIT ?`).bind(cutoff,MAX_PENDING_ROWS).all();
  const pending=(rows.results||[]).map(normalizeObservation).filter(x=>x.symbol&&x.entryPrice>0);
  const grouped=groupBySymbol(pending),symbols=[...grouped.keys()].slice(0,Math.max(1,Math.min(12,Number(maxSymbols)||4)));
  const completed=[],deferred=[],errors=[];
  for(const symbol of symbols){
    try{
      const market=await getMarketData(env,symbol,'3M',false,{completedOnly:true});
      for(const observation of grouped.get(symbol)||[]){
        const results=evaluateObservationOutcomes(observation,market.candles,{now});
        for(const result of results){
          await saveOutcome(env,result);
          completed.push({observationId:observation.id,symbol,horizon:result.horizonSessions,forwardReturn:result.forwardReturn,firstHit:result.firstHit});
        }
        if(results.length<OUTCOME_HORIZONS.length)deferred.push({observationId:observation.id,symbol,completedHorizons:results.map(x=>x.horizonSessions)});
      }
    }catch(error){
      errors.push({symbol,message:String(error?.message||error)});
      if(/quota|429|too many requests/i.test(String(error?.message||'')))break;
    }
  }
  return{symbolsProcessed:symbols.length,observationsConsidered:pending.length,outcomesCompleted:completed.length,deferred:deferred.length,errors,completed};
}

export function evaluateObservationOutcomes(observation,candles,{now=Date.now()}={}){
  const entryPrice=Number(observation?.entryPrice??observation?.price)||0;if(!(entryPrice>0))return[];
  const observedDate=easternDateKey(Number(observation?.observedAt)||now);
  const future=(candles||[]).filter(c=>validDailyCandle(c)&&utcDateKey(c.time)>observedDate).sort((a,b)=>Number(a.time)-Number(b.time));
  const out=[];
  for(const horizon of OUTCOME_HORIZONS){
    if(future.length<horizon)continue;
    const window=future.slice(0,horizon),last=window.at(-1),outcomePrice=Number(last.close),high=Math.max(...window.map(c=>Number(c.high))),low=Math.min(...window.map(c=>Number(c.low)));
    const target=positiveOrNull(observation?.target),stop=positiveOrNull(observation?.thesisBreak),hits=firstHit(window,{target,stop});
    out.push({
      observationId:Number(observation.id),symbol:String(observation.symbol||''),horizonSessions:horizon,evaluatedAt:Number(now)||Date.now(),entryPrice,outcomePrice,
      forwardReturn:outcomePrice/entryPrice-1,mfe:high/entryPrice-1,mae:low/entryPrice-1,targetHit:hits.targetHit,stopHit:hits.stopHit,firstHit:hits.firstHit,outcomeSession:utcDateKey(last.time)
    });
  }
  return out;
}

export function firstHit(candles,{target=null,stop=null}={}){
  let targetHit=false,stopHit=false,firstHit='NONE';
  for(const candle of candles||[]){
    const hitTarget=target!=null&&Number(candle.high)>=target,hitStop=stop!=null&&Number(candle.low)<=stop;
    targetHit=targetHit||hitTarget;stopHit=stopHit||hitStop;
    if(firstHit==='NONE'&&(hitTarget||hitStop))firstHit=hitTarget&&hitStop?'AMBIGUOUS_SAME_SESSION':hitTarget?'TARGET':'STOP';
  }
  return{targetHit,stopHit,firstHit};
}

export async function getOutcomeStatus(env){
  await ensureOutcomeSchema(env);
  const [count,complete,latest]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM evidence_outcomes`).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT observation_id) AS count FROM evidence_outcomes WHERE horizon_sessions=20`).first(),
    env.DB.prepare(`SELECT observation_id AS observationId,horizon_sessions AS horizonSessions,evaluated_at AS evaluatedAt FROM evidence_outcomes ORDER BY evaluated_at DESC LIMIT 1`).first()
  ]);
  return{outcomeRows:Number(count?.count)||0,observationsWith20SessionOutcome:Number(complete?.count)||0,lastOutcome:latest?{...latest,observationId:Number(latest.observationId),horizonSessions:Number(latest.horizonSessions),evaluatedAt:Number(latest.evaluatedAt)||0}:null};
}

async function saveOutcome(env,row){
  await env.DB.prepare(`INSERT OR REPLACE INTO evidence_outcomes(observation_id,horizon_sessions,evaluated_at,entry_price,outcome_price,forward_return,mfe,mae,target_hit,stop_hit,first_hit,outcome_session) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    row.observationId,row.horizonSessions,row.evaluatedAt,row.entryPrice,row.outcomePrice,row.forwardReturn,row.mfe,row.mae,boolInt(row.targetHit),boolInt(row.stopHit),row.firstHit,row.outcomeSession
  ).run();
}
function normalizeObservation(row){return{id:Number(row.id),symbol:String(row.symbol||'').toUpperCase(),observedAt:Number(row.observedAt)||0,entryPrice:Number(row.price)||0,target:positiveOrNull(row.target),thesisBreak:positiveOrNull(row.thesisBreak)};}
function groupBySymbol(rows){const map=new Map();for(const row of rows){if(!map.has(row.symbol))map.set(row.symbol,[]);map.get(row.symbol).push(row);}return map;}
function validDailyCandle(c){return Number.isFinite(Number(c?.time))&&Number(c?.open)>0&&Number(c?.high)>0&&Number(c?.low)>0&&Number(c?.close)>0;}
function utcDateKey(time){return new Date(Number(time)).toISOString().slice(0,10);}
function easternDateKey(time){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time)).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`;}
function positiveOrNull(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function boolInt(v){return v?1:0;}
