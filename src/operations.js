import { getEvidenceStatus } from './evidence.js';
import { getOutcomeStatus } from './outcomes.js';
import { getProviderUsageBreakdown } from './provider-usage.js';

const operationsSchemaReadyByDb=new WeakMap();

export async function ensureOperationsSchema(env){
  if(!env.DB)throw new Error('D1 binding DB is not configured.');
  let ready=operationsSchemaReadyByDb.get(env.DB);
  if(!ready){
    ready=env.DB.prepare(`CREATE TABLE IF NOT EXISTS operation_status(
      operation_key TEXT PRIMARY KEY,
      last_run_at INTEGER NOT NULL DEFAULT 0,
      last_success_at INTEGER NOT NULL DEFAULT 0,
      last_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      run_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      detail_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT 0
    )`).run().catch(error=>{operationsSchemaReadyByDb.delete(env.DB);throw error;});
    operationsSchemaReadyByDb.set(env.DB,ready);
  }
  return ready;
}

export async function recordOperation(env,key,{status='OK',at=Date.now(),detail={}}={}){
  await ensureOperationsSchema(env);
  const operationKey=String(key||'unknown').trim().slice(0,64),runAt=Number(at)||Date.now(),ok=status==='OK'||status==='IDLE';
  await env.DB.prepare(`INSERT INTO operation_status(operation_key,last_run_at,last_success_at,last_status,run_count,error_count,detail_json,updated_at)
    VALUES(?,?,?,?,1,?,?,?)
    ON CONFLICT(operation_key) DO UPDATE SET
      last_run_at=excluded.last_run_at,
      last_success_at=CASE WHEN excluded.last_status IN ('OK','IDLE') THEN excluded.last_run_at ELSE operation_status.last_success_at END,
      last_status=excluded.last_status,
      run_count=operation_status.run_count+1,
      error_count=operation_status.error_count+CASE WHEN excluded.last_status='ERROR' THEN 1 ELSE 0 END,
      detail_json=excluded.detail_json,
      updated_at=excluded.updated_at`).bind(operationKey,runAt,ok?runAt:0,String(status||'UNKNOWN'),status==='ERROR'?1:0,JSON.stringify(detail||{}),Date.now()).run();
}

export async function getOperationsStatus(env){
  await ensureOperationsSchema(env);
  const [ops,evidence,outcomes,provider]=await Promise.all([
    env.DB.prepare(`SELECT operation_key AS operationKey,last_run_at AS lastRunAt,last_success_at AS lastSuccessAt,last_status AS lastStatus,run_count AS runCount,error_count AS errorCount,detail_json AS detailJson FROM operation_status ORDER BY operation_key`).all(),
    getEvidenceStatus(env),
    getOutcomeStatus(env),
    getProviderUsageBreakdown(env)
  ]);
  const operations={};
  for(const row of ops.results||[]){let detail={};try{detail=JSON.parse(row.detailJson||'{}');}catch{}operations[row.operationKey]={lastRunAt:Number(row.lastRunAt)||0,lastSuccessAt:Number(row.lastSuccessAt)||0,lastStatus:String(row.lastStatus||'UNKNOWN'),runCount:Number(row.runCount)||0,errorCount:Number(row.errorCount)||0,detail};}
  const heartbeat=operations['cron-heartbeat']||null,lastHeartbeat=Number(heartbeat?.lastRunAt)||0,ageMs=lastHeartbeat?Date.now()-lastHeartbeat:null;
  return{generatedAt:Date.now(),scheduler:{lastHeartbeat,ageMs,healthy:ageMs!=null&&ageMs<=45*60*1000,status:heartbeat?.lastStatus||'NEVER_SEEN'},operations,evidence,outcomes,provider};
}
