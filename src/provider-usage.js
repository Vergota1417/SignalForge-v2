import { reserveProviderRequest } from './db.js';

const detailSchemaReadyByDb=new WeakMap();
const TWELVE_DATA_SAFE_MAX_PER_MINUTE=7;
const TWELVE_DATA_MIN_SPACING_MS=9_000;

export async function reserveProviderPurpose(env,purpose='general',provider='twelve-data'){
  await ensureProviderUsageDetailSchema(env);
  const now=Date.now(),dayKey=new Date(now).toISOString().slice(0,10),key=sanitizePurpose(purpose),p=sanitizeProvider(provider);
  const rateLimit=p==='twelve-data'?await reserveTwelveDataRateSlot(env,key):null;
  await reserveProviderRequest(env);
  const startedAt=Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO provider_usage_detail(day_key,purpose,requests,updated_at) VALUES(?,?,1,?) ON CONFLICT(day_key,purpose) DO UPDATE SET requests=requests+1,updated_at=excluded.updated_at`).bind(dayKey,key,startedAt),
    env.DB.prepare(`INSERT INTO provider_api_daily(day_key,provider,requests,successes,errors,updated_at) VALUES(?,?,1,0,0,?) ON CONFLICT(day_key,provider) DO UPDATE SET requests=requests+1,updated_at=excluded.updated_at`).bind(dayKey,p,startedAt),
    env.DB.prepare(`INSERT INTO provider_api_health(provider,last_status,last_success_at,last_failure_at,last_latency_ms,last_symbol,last_bars,last_purpose,last_cached,last_source,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET last_status='PENDING',last_latency_ms=0,last_symbol='',last_bars=0,last_purpose=excluded.last_purpose,last_cached=0,last_source='',last_error='',updated_at=excluded.updated_at`).bind(p,'PENDING',0,0,0,'',0,key,0,'','',startedAt)
  ]);
  return{dayKey,purpose:key,provider:p,startedAt,rateLimit};
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
  await ensureProviderUsageDetailSchema(env);const dayKey=new Date().toISOString().slice(0,10),rateConfig=twelveDataRateConfig(env);
  const [health,daily,usage,canonical,rateRows]=await Promise.all([
    env.DB.prepare(`SELECT provider,last_status AS lastStatus,last_success_at AS lastSuccessAt,last_failure_at AS lastFailureAt,last_latency_ms AS lastLatencyMs,last_symbol AS lastSymbol,last_bars AS lastBars,last_purpose AS lastPurpose,last_cached AS lastCached,last_source AS lastSource,last_error AS lastError,updated_at AS updatedAt FROM provider_api_health ORDER BY provider`).all(),
    env.DB.prepare(`SELECT provider,requests,successes,errors,updated_at AS updatedAt FROM provider_api_daily WHERE day_key=? ORDER BY provider`).bind(dayKey).all(),
    getProviderUsageBreakdown(env,{dayKey,canonical:false}),
    env.DB.prepare(`SELECT requests,updated_at AS updatedAt FROM provider_usage WHERE day_key=?`).bind(dayKey).first(),
    env.DB.prepare(`SELECT provider,next_allowed_at AS nextAvailableAt,last_reserved_at AS lastReservedAt,delayed_requests AS delayedRequests,throttled_requests AS throttledRequests,updated_at AS updatedAt FROM provider_rate_limit ORDER BY provider`).all()
  ]);
  const hm=new Map((health.results||[]).map(r=>[r.provider,r])),dm=new Map((daily.results||[]).map(r=>[r.provider,r])),rm=new Map((rateRows.results||[]).map(r=>[r.provider,r]));
  const providers=['alpaca','twelve-data'].map(provider=>{
    const h=hm.get(provider)||{},d=dm.get(provider)||{},requests=Number(d.requests)||0,successes=Number(d.successes)||0,errors=Number(d.errors)||0,pending=Math.max(0,requests-successes-errors),lastError=String(h.lastError||''),requestStatus=h.lastStatus||'NEVER',rate=rm.get(provider)||{};
    const classification=classifyStoredProviderError(lastError,{provider,lastSymbol:String(h.lastSymbol||''),lastPurpose:String(h.lastPurpose||''),lastBars:Number(h.lastBars)||0}),errorKind=classification.kind,healthState=providerHealthState({requestStatus,errorKind,lastSuccessAt:Number(h.lastSuccessAt)||0,lastFailureAt:Number(h.lastFailureAt)||0});
    const localRateLimit=provider==='twelve-data'?{enabled:true,maxPerMinute:rateConfig.maxPerMinute,minSpacingMs:rateConfig.minSpacingMs,maxLocalWaitMs:rateConfig.maxLocalWaitMs,nextAvailableAt:Number(rate.nextAvailableAt)||0,lastReservedAt:Number(rate.lastReservedAt)||0,delayedRequests:Number(rate.delayedRequests)||0,throttledRequests:Number(rate.throttledRequests)||0}:null;
    return{provider,configured:provider==='alpaca'?Boolean(configured.alpaca):Boolean(configured.twelveData),lastStatus:healthState,lastRequestStatus:requestStatus,errorKind,errorInferred:Boolean(classification.inferred),lastSuccessAt:Number(h.lastSuccessAt)||0,lastFailureAt:Number(h.lastFailureAt)||0,lastLatencyMs:Number(h.lastLatencyMs)||0,lastSymbol:h.lastSymbol||'',lastBars:Number(h.lastBars)||0,lastPurpose:h.lastPurpose||'',lastCached:Boolean(Number(h.lastCached)||0),lastSource:h.lastSource||'',lastError,requestsToday:requests,successesToday:successes,errorsToday:errors,pendingToday:pending,updatedAt:Number(h.updatedAt)||0,localRateLimit};
  });
  const attributedRequestsToday=providers.reduce((sum,p)=>sum+p.requestsToday,0),canonicalTotal=Math.max(Number(canonical?.requests)||0,attributedRequestsToday),purposeTrackedRequestsToday=Number(usage.purposeTrackedTotal)||0,unattributedRequestsToday=Math.max(0,canonicalTotal-attributedRequestsToday);
  return{dayKey,preferred:configured.preferred||'auto',totalRequestsToday:canonicalTotal,canonicalRequestsToday:canonicalTotal,purposeTrackedRequestsToday,attributedRequestsToday,unattributedRequestsToday,providers,byPurpose:usage.byPurpose,twelveDataMinuteGuard:{enabled:true,...rateConfig}};
}

export async function getProviderUsageBreakdown(env,{dayKey=new Date().toISOString().slice(0,10),canonical=true}={}){
  await ensureProviderUsageDetailSchema(env);
  const [rows,totalRow]=await Promise.all([
    env.DB.prepare(`SELECT purpose,requests,updated_at AS updatedAt FROM provider_usage_detail WHERE day_key=? ORDER BY requests DESC,purpose`).bind(dayKey).all(),
    canonical?env.DB.prepare(`SELECT requests,updated_at AS updatedAt FROM provider_usage WHERE day_key=?`).bind(dayKey).first():Promise.resolve(null)
  ]);
  const byPurpose=Object.fromEntries((rows.results||[]).map(r=>[r.purpose,Number(r.requests)||0])),purposeTrackedTotal=Object.values(byPurpose).reduce((a,b)=>a+b,0),total=canonical?Math.max(Number(totalRow?.requests)||0,purposeTrackedTotal):purposeTrackedTotal;
  return{dayKey,total,purposeTrackedTotal,unattributedMathOnly:Math.max(0,total-purposeTrackedTotal),byPurpose,rows:(rows.results||[]).map(r=>({...r,requests:Number(r.requests)||0,updatedAt:Number(r.updatedAt)||0}))};
}

export function twelveDataRateConfig(env={}){
  const requested=clampInt(env.TWELVE_DATA_MAX_REQUESTS_PER_MINUTE,1,TWELVE_DATA_SAFE_MAX_PER_MINUTE,TWELVE_DATA_SAFE_MAX_PER_MINUTE),maxPerMinute=Math.min(TWELVE_DATA_SAFE_MAX_PER_MINUTE,requested);
  const minSpacingMs=Math.max(TWELVE_DATA_MIN_SPACING_MS,Math.ceil(60_000/maxPerMinute)+250),maxLocalWaitMs=clampInt(env.TWELVE_DATA_MAX_LOCAL_WAIT_MS,0,Math.min(30_000,minSpacingMs),minSpacingMs);
  return{maxPerMinute,minSpacingMs,maxLocalWaitMs};
}

async function reserveTwelveDataRateSlot(env,purpose){
  const config=twelveDataRateConfig(env),now=Date.now(),provider='twelve-data';
  const row=await env.DB.prepare(`INSERT INTO provider_rate_limit(provider,next_allowed_at,last_reserved_at,delayed_requests,throttled_requests,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET next_allowed_at=MAX(provider_rate_limit.next_allowed_at,excluded.last_reserved_at)+?,last_reserved_at=MAX(provider_rate_limit.next_allowed_at,excluded.last_reserved_at),delayed_requests=provider_rate_limit.delayed_requests+CASE WHEN MAX(provider_rate_limit.next_allowed_at,excluded.last_reserved_at)>excluded.last_reserved_at THEN 1 ELSE 0 END,updated_at=excluded.updated_at WHERE MAX(provider_rate_limit.next_allowed_at,excluded.last_reserved_at)-excluded.last_reserved_at<=? RETURNING next_allowed_at AS nextAvailableAt,last_reserved_at AS scheduledAt,delayed_requests AS delayedRequests,throttled_requests AS throttledRequests,updated_at AS updatedAt`).bind(provider,now+config.minSpacingMs,now,0,0,now,config.minSpacingMs,config.maxLocalWaitMs).first();
  if(!row){
    await env.DB.prepare(`UPDATE provider_rate_limit SET throttled_requests=throttled_requests+1,updated_at=? WHERE provider=?`).bind(now,provider).run();
    const current=await env.DB.prepare(`SELECT next_allowed_at AS nextAvailableAt FROM provider_rate_limit WHERE provider=?`).bind(provider).first(),retryAfterMs=Math.max(1_000,(Number(current?.nextAvailableAt)||now+config.minSpacingMs)-now);
    const error=new Error(`Twelve Data [LOCAL_RATE_LIMIT]: SignalForge ${config.maxPerMinute}/min safety guard is full; retry after ${Math.ceil(retryAfterMs/1000)}s.`);
    error.kind='LOCAL_RATE_LIMIT';error.provider=provider;error.providerRequestStarted=false;error.retryAfterMs=retryAfterMs;error.purpose=purpose;throw error;
  }
  const scheduledAt=Number(row.scheduledAt)||now,waitMs=Math.max(0,scheduledAt-now);
  if(waitMs>0)await sleep(waitMs);
  return{...config,scheduledAt,waitMs,nextAvailableAt:Number(row.nextAvailableAt)||scheduledAt+config.minSpacingMs};
}

async function ensureProviderUsageDetailSchema(env){
  if(!env.DB)throw new Error('D1 binding DB is not configured.');
  let ready=detailSchemaReadyByDb.get(env.DB);
  if(!ready){
    ready=env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_usage_detail(day_key TEXT NOT NULL,purpose TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(day_key,purpose))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_api_daily(day_key TEXT NOT NULL,provider TEXT NOT NULL,requests INTEGER NOT NULL DEFAULT 0,successes INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(day_key,provider))`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_api_health(provider TEXT PRIMARY KEY,last_status TEXT NOT NULL DEFAULT 'NEVER',last_success_at INTEGER NOT NULL DEFAULT 0,last_failure_at INTEGER NOT NULL DEFAULT 0,last_latency_ms INTEGER NOT NULL DEFAULT 0,last_symbol TEXT NOT NULL DEFAULT '',last_bars INTEGER NOT NULL DEFAULT 0,last_purpose TEXT NOT NULL DEFAULT '',last_cached INTEGER NOT NULL DEFAULT 0,last_source TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT 0)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_rate_limit(provider TEXT PRIMARY KEY,next_allowed_at INTEGER NOT NULL DEFAULT 0,last_reserved_at INTEGER NOT NULL DEFAULT 0,delayed_requests INTEGER NOT NULL DEFAULT 0,throttled_requests INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)`)
    ]).catch(error=>{detailSchemaReadyByDb.delete(env.DB);throw error;});
    detailSchemaReadyByDb.set(env.DB,ready);
  }
  return ready;
}
function classifyStoredProviderError(message,{provider='',lastSymbol='',lastPurpose='',lastBars=0}={}){
  const m=String(message||'').toUpperCase();if(!m)return{kind:'',inferred:false};
  if(m.includes('[SYMBOL_NOT_FOUND]')||m.includes('INVALID SYMBOL')||m.includes('SYMBOL NOT FOUND'))return{kind:'SYMBOL_NOT_FOUND',inferred:false};
  if(m.includes('[AUTH]')||m.includes('API KEY')||m.includes('AUTHENTICATION'))return{kind:'AUTH',inferred:false};
  if(m.includes('[RATE_LIMIT]')||m.includes('429')||m.includes('RATE LIMIT'))return{kind:'RATE_LIMIT',inferred:false};
  if(m.includes('[NETWORK]')||m.includes('TIMED OUT'))return{kind:'NETWORK',inferred:false};
  if(m.includes('[PROVIDER]')||/HTTP 5\d\d/.test(m))return{kind:'PROVIDER',inferred:false};
  const legacySymbol404=/HTTP 404/.test(m)&&provider==='twelve-data'&&Boolean(lastSymbol)&&/^time-series-/.test(lastPurpose)&&Number(lastBars)===0;
  if(legacySymbol404)return{kind:'SYMBOL_NOT_FOUND',inferred:true};
  return{kind:'REQUEST',inferred:false};
}
function providerHealthState({requestStatus,errorKind,lastSuccessAt,lastFailureAt}){if(requestStatus==='PENDING')return'PENDING';if(requestStatus==='PASS')return'PASS';if(requestStatus==='FAIL'&&errorKind==='SYMBOL_NOT_FOUND')return'SYMBOL_REJECTED';if(lastSuccessAt>lastFailureAt&&lastSuccessAt>0)return'PASS';return requestStatus||'NEVER';}
function sanitizePurpose(value){const text=String(value||'general').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');return(text||'general').slice(0,48);}
function sanitizeProvider(value){const p=String(value||'unknown').trim().toLowerCase();return p==='alpaca'?'alpaca':p.includes('twelve')?'twelve-data':p.slice(0,32)||'unknown';}
function sanitizeSymbol(value){return String(value||'').trim().toUpperCase().replace(/[^A-Z0-9.:-]/g,'').slice(0,16);}
function clampInt(value,min,max,fallback){const n=Math.trunc(Number(value));return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Math.round(ms))));}
