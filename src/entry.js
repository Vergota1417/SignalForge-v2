import app from './index.js';
import { authorizeDevice, ensureSchema } from './db.js';
import { getOperationsStatus, recordOperation } from './operations.js';
import { runRadarDiscovery } from './radar.js';
import { runScreenerPromotion } from './screener.js';
import { runBackendSelfTest } from './self-test.js';

const SELF_TEST_COOLDOWN_MS=60_000;
const OPENING_SCAN_MINUTES=new Set([570,575,580]);

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname!=='/api/backend-self-test')return app.fetch(request,env,ctx);
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    try{
      const body=await readJson(request),endpoint=String(request.headers.get('x-sf-endpoint')||body?.deviceEndpoint||'').trim(),token=String(request.headers.get('x-sf-token')||body?.deviceToken||'').trim();
      if(!endpoint.startsWith('https://')||!/^[A-Za-z0-9_-]{32,128}$/.test(token)||!await authorizeDevice(env,endpoint,token))return json({error:'Backend self-test requires an authorized SignalForge phone. Enable alerts on this phone first.'},403);
      const operations=await getOperationsStatus(env),lastRun=Number(operations.operations?.['backend-self-test']?.lastRunAt)||0,retryAfterMs=Math.max(0,SELF_TEST_COOLDOWN_MS-(Date.now()-lastRun));
      if(retryAfterMs>0)return json({error:'Backend self-test cooldown is active.',retryAfterMs},429);
      const symbol=sanitizeSymbol(body?.symbol)||'XOM',selfTest=await runBackendSelfTest(env,{symbol,now:Date.now()});
      return json({selfTest});
    }catch(error){console.error(JSON.stringify({event:'backend_self_test_request_error',message:error?.message||String(error)}));return json({error:String(error?.message||'Backend self-test failed.')},500);}
  },
  scheduled(controller,env,ctx){
    const scheduledTime=Number(controller.scheduledTime)||Date.now(),now=new Date(scheduledTime),parts=easternParts(now),minutes=Number(parts.hour)*60+Number(parts.minute),weekday=parts.weekday;
    if(isWeekday(weekday)&&OPENING_SCAN_MINUTES.has(minutes)){
      ctx.waitUntil(runOpeningCycle(env,{now:scheduledTime,weekday,minutes}));
      return;
    }
    return app.scheduled(controller,env,ctx);
  }
};

async function runOpeningCycle(env,{now,weekday,minutes}){
  try{
    await ensureSchema(env);
    await recordOperation(env,'cron-heartbeat',{status:'OK',at:now,detail:{weekday,minutes,marketDataConfigured:Boolean(env.TWELVE_DATA_API_KEY),phase:'OPENING'}});
    if(!env.TWELVE_DATA_API_KEY){await recordOperation(env,'opening-pipeline',{status:'ERROR',at:now,detail:{phase:openingLabel(minutes),message:'Market-data provider is not configured.'}});return;}
    const radar=await runRadarDiscovery(env,{batchSize:5,now}),promotion=await runScreenerPromotion(env,{maxPromotions:1,now});
    const detail={phase:openingLabel(minutes),requested:radar.selected||null,scanned:(radar.scanned||[]).map(x=>x.symbol),leaders:(radar.leaders||[]).map(x=>x.symbol),promoted:(promotion.promoted||[]).map(x=>({symbol:x.symbol,status:x.status,readiness:x.readiness})),candidates:promotion.candidates||[],universeSize:Number(radar.universeSize)||0};
    await recordOperation(env,'opening-pipeline',{status:detail.scanned.length?'OK':'IDLE',at:now,detail});
    console.log(JSON.stringify({event:'opening_market_cycle',...detail}));
  }catch(error){await recordOperation(env,'opening-pipeline',{status:'ERROR',at:now,detail:{phase:openingLabel(minutes),message:error?.message||String(error)}}).catch(()=>{});console.error(JSON.stringify({event:'opening_market_cycle_error',message:error?.message||String(error)}));}
}

function openingLabel(minutes){return minutes===570?'OPEN':'OPEN +5M';}
function isWeekday(day){return day==='Mon'||day==='Tue'||day==='Wed'||day==='Thu'||day==='Fri';}
function easternParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
async function readJson(request){const text=await request.text();if(text.length>10_000)throw new Error('Self-test request is too large.');try{return text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON payload.');}}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
