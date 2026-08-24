import { buildChallengerRule, compareChampionChallenger } from './challenger.js';
import { ensureOutcomeSchema } from './outcomes.js';

export const DEFAULT_SHADOW_ID='challenger-v1';
export const SHADOW_ROLLOUT_AT=Date.parse('2026-08-24T02:43:00Z');
export const DEFAULT_SHADOW_CONFIG={
  statuses:['BUY NOW'],
  minReadiness:80,
  minRvol:1.5,
  minGates:4,
  requireNormalRegime:true,
  requireStrongSector:true
};

export async function ensureShadowValidationSchema(env,{now=Date.now()}={}){
  await ensureOutcomeSchema(env);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS shadow_challengers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    horizon_sessions INTEGER NOT NULL DEFAULT 10,
    min_sample INTEGER NOT NULL DEFAULT 30,
    started_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'COLLECTING',
    evaluation_json TEXT NOT NULL DEFAULT '{}',
    evaluated_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  const created=Number(now)||Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO shadow_challengers(id,name,config_json,horizon_sessions,min_sample,started_at,status,evaluation_json,evaluated_at,created_at,updated_at) VALUES(?,?,?,?,?,?, 'COLLECTING','{}',0,?,?)`)
    .bind(DEFAULT_SHADOW_ID,'Default evidence challenger',JSON.stringify(DEFAULT_SHADOW_CONFIG),10,30,SHADOW_ROLLOUT_AT,created,created).run();
}

export async function runShadowValidation(env,{now=Date.now()}={}){
  await ensureShadowValidationSchema(env,{now});
  const defs=await env.DB.prepare(`SELECT id,name,config_json AS configJson,horizon_sessions AS horizonSessions,min_sample AS minSample,started_at AS startedAt,status,evaluation_json AS evaluationJson,evaluated_at AS evaluatedAt FROM shadow_challengers ORDER BY created_at ASC,id ASC`).all();
  const reports=[];
  for(const def of defs.results||[]){
    const config=parseJson(def.configJson,DEFAULT_SHADOW_CONFIG),horizon=normalizeHorizon(def.horizonSessions),minSample=Math.max(10,Number(def.minSample)||30),startedAt=Number(def.startedAt)||SHADOW_ROLLOUT_AT;
    const rows=await loadForwardRows(env,{startedAt,horizon});
    const evaluation=evaluateForwardShadow(rows,config,{minSample});
    const status=shadowStatus(evaluation),evaluatedAt=Number(now)||Date.now();
    const report={id:String(def.id),name:String(def.name),startedAt,horizon,minSample,config,status,evaluatedAt,forwardRows:rows.length,evaluation,policy:{productionChanged:false,message:'Forward shadow validation is evidence-only. A pass may nominate a challenger for deliberate review but never changes production gates automatically.'}};
    await env.DB.prepare(`UPDATE shadow_challengers SET status=?,evaluation_json=?,evaluated_at=?,updated_at=? WHERE id=?`).bind(status,JSON.stringify(report),evaluatedAt,evaluatedAt,String(def.id)).run();
    reports.push(report);
  }
  return{generatedAt:Number(now)||Date.now(),rolloutAt:SHADOW_ROLLOUT_AT,challengers:reports};
}

export async function getShadowValidationReport(env,{refresh=true,now=Date.now()}={}){
  await ensureShadowValidationSchema(env,{now});
  if(refresh)return runShadowValidation(env,{now});
  const rows=await env.DB.prepare(`SELECT id,name,status,evaluation_json AS evaluationJson,started_at AS startedAt,evaluated_at AS evaluatedAt FROM shadow_challengers ORDER BY created_at ASC,id ASC`).all();
  return{generatedAt:Number(now)||Date.now(),rolloutAt:SHADOW_ROLLOUT_AT,challengers:(rows.results||[]).map(row=>{const saved=parseJson(row.evaluationJson,null);return saved||{id:row.id,name:row.name,status:row.status,startedAt:Number(row.startedAt)||0,evaluatedAt:Number(row.evaluatedAt)||0};})};
}

export function evaluateForwardShadow(rows=[],config=DEFAULT_SHADOW_CONFIG,{minSample=30}={}){
  return compareChampionChallenger(rows,buildChallengerRule(config),{minSample:Math.max(10,Number(minSample)||30)});
}

export function shadowStatus(evaluation){
  if(!evaluation?.checks?.sample)return'COLLECTING';
  return evaluation.promotable?'FORWARD_PASS':'FORWARD_FAIL';
}

async function loadForwardRows(env,{startedAt,horizon}){
  const result=await env.DB.prepare(`SELECT e.id,e.symbol,e.status,e.readiness,e.relative_volume AS relativeVolume,e.gates_ready AS gatesReady,e.benchmark_risk_off AS benchmarkRiskOff,e.model_version AS modelVersion,e.observed_at AS observedAt,e.payload_json AS payloadJson,o.forward_return AS forwardReturn,o.mfe,o.mae,o.market_excess_return AS marketExcessReturn,o.sector_excess_return AS sectorExcessReturn FROM evidence_observations e JOIN evidence_outcomes o ON o.observation_id=e.id WHERE e.observation_type='ANALYSIS' AND e.observed_at>=? AND o.horizon_sessions=? ORDER BY e.observed_at ASC,e.id ASC`)
    .bind(Number(startedAt)||SHADOW_ROLLOUT_AT,normalizeHorizon(horizon)).all();
  return result.results||[];
}

function normalizeHorizon(v){const n=Number(v);return[1,3,5,10,20].includes(n)?n:10;}
function parseJson(value,fallback){try{return JSON.parse(value||'');}catch{return fallback;}}
