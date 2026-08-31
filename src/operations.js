import { getEvidenceStatus } from './evidence.js';
import { getOutcomeStatus } from './outcomes.js';
import { getProviderUsageBreakdown } from './provider-usage.js';

const operationsSchemaReadyByDb=new WeakMap();

export async function ensureOperationsSchema(env){
  if(!env.DB)throw new Error('D1 binding DB is not configured.');
  let ready=operationsSchemaReadyByDb.get(env.DB);
  if(!ready){
    ready=env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS operation_status(
        operation_key TEXT PRIMARY KEY,
        last_run_at INTEGER NOT NULL DEFAULT 0,
        last_success_at INTEGER NOT NULL DEFAULT 0,
        last_status TEXT NOT NULL DEFAULT 'UNKNOWN',
        run_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        detail_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL DEFAULT 0
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS operation_error_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_key TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_operation_error_events_time ON operation_error_events(occurred_at DESC)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_operation_error_events_key_time ON operation_error_events(operation_key,occurred_at DESC)`)
    ]).catch(error=>{operationsSchemaReadyByDb.delete(env.DB);throw error;});
    operationsSchemaReadyByDb.set(env.DB,ready);
  }
  return ready;
}

export async function recordOperation(env,key,{status='OK',at=Date.now(),detail={}}={}){
  await ensureOperationsSchema(env);
  const operationKey=String(key||'unknown').trim().slice(0,64),runAt=Number(at)||Date.now(),ok=status==='OK'||status==='IDLE',normalizedStatus=String(status||'UNKNOWN'),payload=JSON.stringify(detail||{}),statements=[
    env.DB.prepare(`INSERT INTO operation_status(operation_key,last_run_at,last_success_at,last_status,run_count,error_count,detail_json,updated_at)
      VALUES(?,?,?,?,1,?,?,?)
      ON CONFLICT(operation_key) DO UPDATE SET
        last_run_at=excluded.last_run_at,
        last_success_at=CASE WHEN excluded.last_status IN ('OK','IDLE') THEN excluded.last_run_at ELSE operation_status.last_success_at END,
        last_status=excluded.last_status,
        run_count=operation_status.run_count+1,
        error_count=operation_status.error_count+CASE WHEN excluded.last_status='ERROR' THEN 1 ELSE 0 END,
        detail_json=excluded.detail_json,
        updated_at=excluded.updated_at`).bind(operationKey,runAt,ok?runAt:0,normalizedStatus,normalizedStatus==='ERROR'?1:0,payload,Date.now())
  ];
  if(normalizedStatus==='ERROR')statements.push(env.DB.prepare(`INSERT INTO operation_error_events(operation_key,occurred_at,message,detail_json,created_at) VALUES(?,?,?,?,?)`).bind(operationKey,runAt,errorMessage(detail),payload,Date.now()));
  await env.DB.batch(statements);
}

export async function getOperationsStatus(env){
  await ensureOperationsSchema(env);const now=Date.now(),dayAgo=now-86_400_000,weekAgo=now-7*86_400_000;
  const [ops,evidence,outcomes,provider,recent24,recent7,latestErrors]=await Promise.all([
    env.DB.prepare(`SELECT operation_key AS operationKey,last_run_at AS lastRunAt,last_success_at AS lastSuccessAt,last_status AS lastStatus,run_count AS runCount,error_count AS errorCount,detail_json AS detailJson FROM operation_status ORDER BY operation_key`).all(),
    getEvidenceStatus(env),
    getOutcomeStatus(env),
    getProviderUsageBreakdown(env),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM operation_error_events WHERE occurred_at>=?`).bind(dayAgo).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM operation_error_events WHERE occurred_at>=?`).bind(weekAgo).first(),
    env.DB.prepare(`SELECT operation_key AS operationKey,occurred_at AS occurredAt,message FROM operation_error_events ORDER BY occurred_at DESC,id DESC LIMIT 8`).all()
  ]);
  const operations={},byOperation=[];
  for(const row of ops.results||[]){let detail={};try{detail=JSON.parse(row.detailJson||'{}');}catch{}const item={lastRunAt:Number(row.lastRunAt)||0,lastSuccessAt:Number(row.lastSuccessAt)||0,lastStatus:String(row.lastStatus||'UNKNOWN'),runCount:Number(row.runCount)||0,errorCount:Number(row.errorCount)||0,detail};operations[row.operationKey]=item;if(item.errorCount>0)byOperation.push({operationKey:row.operationKey,errorCount:item.errorCount,lastStatus:item.lastStatus,lastRunAt:item.lastRunAt});}
  byOperation.sort((a,b)=>b.errorCount-a.errorCount||b.lastRunAt-a.lastRunAt);
  const heartbeat=operations['cron-heartbeat']||null,lastHeartbeat=Number(heartbeat?.lastRunAt)||0,ageMs=lastHeartbeat?now-lastHeartbeat:null,historicalTotal=byOperation.reduce((sum,row)=>sum+row.errorCount,0);
  return{generatedAt:now,scheduler:{lastHeartbeat,ageMs,healthy:ageMs!=null&&ageMs<=45*60*1000,status:heartbeat?.lastStatus||'NEVER_SEEN'},operations,evidence,outcomes,provider,errorSummary:{historicalTotal,recent24h:Number(recent24?.count)||0,recent7d:Number(recent7?.count)||0,recentTrackingOnly:true,byOperation:byOperation.slice(0,12),latest:(latestErrors.results||[]).map(row=>({operationKey:row.operationKey,occurredAt:Number(row.occurredAt)||0,message:String(row.message||'')}))}};
}
function errorMessage(detail){if(!detail||typeof detail!=='object')return'';if(detail.message)return String(detail.message).slice(0,240);const first=Array.isArray(detail.errors)?detail.errors[0]:null;return String(first?.message||'').slice(0,240);}
