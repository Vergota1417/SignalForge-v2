import { reserveProviderRequest } from './db.js';

const detailSchemaReadyByDb=new WeakMap();

export async function reserveProviderPurpose(env,purpose='general',provider='twelve-data'){
  await ensureProviderUsageDetailSchema(env);
  await reserveProviderRequest(env);
  const now=Date.now(),dayKey=new Date(now).toISOString().slice(0,10),key=sanitizePurpose(purpose),p=sanitizeProvider(provider);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO provider_usage_detail(day_key,purpose,requests,updated_at) VALUES(?,?,1,?) ON CONFLICT(day_key,purpose) DO UPDATE SET requests=requests+1,updated_at=excluded.updated_at`).bind(dayKey,key,now),
    env.DB.prepare(`INSERT INTO provider_api_daily(day_key,provider,requests,successes,errors,updated_at) VALUES(?,?,1,0,0,?) ON CONFLICT(day_key,provider) DO UPDATE SET requests=requests+1,updated_at=excluded.updated_at`).bind(dayKey,p,now),
    env.DB.prepare(`INSERT INTO provider_api_health(provider,last_status,last_success_at,last_failure_at,last_latency_ms,last_symbol,last_bars,last_purpose,last_cached,last_source,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET last_status='PENDING',last_latency_ms=0,last_symbol='',last_bars=0,last_purpose=excluded.last_purpose,last_cached=0,last_source='',last_error='',updated_at=excluded.updated_at`).bind(p,'PENDING',0,0,0,'',0,key,0,'','',now)
  ]);
  return{dayKey,purpose:key,provider:p,startedAt:now};
}

export async function recordProviderSuccess(env,{provider,purpose='general',symbol='',bars=0,latencyMs=0,cached=false,source=''}={}){
  await ensureProviderUsageDetailSchema(env);const now=Date.now(),dayKey=new Date(now).toISOString().slice(0,10),p=sanitizeProvider(provider),key=sanitizePurpose(purpose);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO provider_api_daily(day_key,provider,requests,successes,errors,updated_at) VALUES(?,?,0,1,0,?) ON CONFLICT(day_key,provider) DO UPDATE SET successes=successes+1,updated_at=excluded.updated_at`).bind(dayKey,p,now),
    env.DB.prepare(`INSERT INTO provider_api_health(provider,last_status,last_success_at,last_failure_at,last_latency_ms,last_symbol,last_bars,last_purpose,last_cached,last_source,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET last_status=excluded.last_status,last_success_at=excluded.last_success_at,last_latency_ms=excluded.last_latency_ms,last_symbol=excluded.last_symbol,last_bars=excluded.last_bars,last_purpose=excluded.last_purpose,last_cached=excluded.last_cached,last_source=excluded.last_source,last_error='',updated_at=excluded.updated_at`).bind(p,'PASS',now,0,Math.max(0,Math.round(Number(latencyMs)||0)),sanitizeSymbol(symbol),Math.max(0,Math.round(Number(bars)||0)),key,cached?1:0,String(source||p).slice(0,60),'',now)
  ]);
}

export async function recordProviderFailure(env,{provider,purpose='general',symbol='',latencyMs=0,error=''}={}){
  await ensureProviderUsageDetailSchema(env);const now=Date.now(),dayKey=new Date(now).toISOString().slice(0,10),p=sanitizeProvider(provider),key=sanitizePurpose(purpose),message=String(error||'provider request failed').slice(0,240);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO provider_api_daily(day_key,provider,requests,successes,errors,updated_at) VALUES(?,?,0,0,1,?) ON CONFLICT(day_key,provider) DO UPDATE SET errors=errors+1,updated_at=excluded.updated_at`).bind(dayKey,p,now),
    env.DB.prepare(`INSERT INTO provider_api_health(provider,last_status,last_success_at,last_failure_at,last_latency_ms,last_symbol,last_bars,last_purpose,last_cached,last_source,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET last_status=excluded.last_status,last_failure_at=excluded.last_failure_at,last_latency_ms=excluded.last_latency_ms,last_symbol=excluded.last_symbol,last_bars=0,last_purpose=excluded.last_purpose,last_cached=0,last_source=excluded.last_source,last_error=excluded.last_error,updated_at=excluded.updated_at`).bind(p,'FAIL',0,now,Math.max(0,Math.round(Number(latencyMs)||0)),sanitizeSymbol(symbol),0,key,0,p,message,now)
  ]);
}

export async function getProviderHealthSnapshot(env,{configured={}}={}){
  await ensureProviderUsageDetailSchema(env);const dayKey=new Date().toISOString().slice(0,10);
  const [health,daily,usage]=await Promise.all([
    env.DB.prepare(`SELECT provider,last_status AS lastStatus,last_success_at AS lastSuccessAt,last_failure_at AS lastFailureAt,last_latency_ms AS lastLatencyMs,last_symbol AS lastSymbol,last_bars AS lastBars,last_purpose AS lastPurpose,last_cached AS lastCached,last_source AS lastSource,last_error AS lastError,updated_at AS updatedAt FROM provider_api_health ORDER BY provider`).all(),
    env.DB.prepare(`SELECT provider,requests,successes,errors,updated_at AS updatedAt FROM provider_api_daily WHERE day_key=? ORDER BY provider`).bind(dayKey).all(),
    getProviderUsageBreakdown(env,{dayKey})
  ]);
  const hm=new Map((health.results||[]).map(r=>[r.provider,r])),dm=new Map((daily.results||[]).map(r=>[r.provider,r]));
  const providers=['alpaca','twelve-data'].map(provider=>{const h=hm.get(provider)||{},d=dm.get(provider)||{},requests=Number(d.requests)||0,successes=Number(d.successes)||0,errors=Number(d.errors)||0,pending=Math.max(0,requests-successes-errors);return{provider,configured:provider==='alpaca'?Boolean(configured.alpaca):Boolean(configured.twelveData),lastStatus:h.lastStatus||'NEVER',lastSuccessAt:Number(h.lastSuccessAt)||0,lastFailureAt:Number(h.lastFailureAt)||0,lastLatencyMs:Number(h.lastLatencyMs)||0,lastSymbol:h.lastSymbol||'',lastBars:Number(h.lastBars)||0,lastPurpose:h.lastPurpose||'',lastCached:Boolean(Number(h.lastCached)||0),lastSource:h.lastSource||'',lastError:h.lastError||'',requestsToday:requests,successesToday:successes,errorsToday:errors,pendingToday:pending,updatedAt:Number(h.updatedAt)||0};});
  const attributedRequestsToday=providers.reduce((sum,p)=>sum+p.requestsToday,0),unattributedRequestsToday=Math.max(0,usage.total-attributedRequestsToday);
  return{dayKey,preferred:configured.preferred||'auto',totalRequestsToday:usage.total,attributedRequestsToday,unattributedRequestsToday,providers,byPurpose:usage.byPurpose};
}

export async function getProviderUsageBreakdown(env,{dayKey=new Date().toISOString().slice(0,10)}={}){
  await ensureProviderUsageDetailSchema(env);
  const rows=await env.DB.prepare(`SELECT purpose,requests,updated_at AS updatedAt FROM provider_usage_detail WHERE day_key=? ORDER BY requests DESC,purpose`).bind(dayKey).all();
  const byPurpose=Object.fromEntries((rows.results||[]).map(r=>[r.purpose,Number(r.requests)||0]));
  return{dayKey,total:Object.values(byPurpose).reduce((a,b)=>a+b,0),byPurpose,rows:(rows.results||[]).map(r=>({...r,requests:Number(r.requests)||0,updatedAt:Number(r.updatedAt)||0}))};
}

async function ensureProviderUsageDetailSchema(env){
  if(!env.DB)throw new Error('D1 binding DB is not configured.');
  let ready=detailSchemaReadyByDb.get(env.DB);
  if(!ready){
    ready=env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_usage_detail(day_key TEXT NOT NULL,purpose TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(day_key,purpose))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_api_daily(day_key TEXT NOT NULL,provider TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,successes INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(day_key,provider))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_api_health(provider TEXT PRIMARY KEY,last_status TEXT NOT NULL DEFAULT 'NEVER',last_success_at INTEGER NOT NULL DEFAULT 0,last_failure_at INTEGER NOT NULL DEFAULT 0,last_latency_ms INTEGER NOT NULL DEFAULT 0,last_symbol TEXT NOT NULL DEFAULT '',last_bars INTEGER NOT NULL DEFAULT 0,last_purpose TEXT NOT NULL DEFAULT '',last_cached INTEGER NOT NULL DEFAULT 0,last_source TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT 0)`)
    ]).catch(error=>{detailSchemaReadyByDb.delete(env.DB);throw error;});
    detailSchemaReadyByDb.set(env.DB,ready);
  }
  return ready;
}
function sanitizePurpose(value){const text=String(value||'general').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');return(text||'general').slice(0,48);}
function sanitizeProvider(value){const p=String(value||'unknown').trim().toLowerCase();return p==='alpaca'?'alpaca':p.includes('twelve')?'twelve-data':p.slice(0,32)||'unknown';}
function sanitizeSymbol(value){return String(value||'').trim().toUpperCase().replace(/[^A-Z0-9.:-]/g,'').slice(0,16);}
