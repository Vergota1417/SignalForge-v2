import app from './index.js';
import { authorizeDevice, ensureSchema, getSignalAnalysis } from './db.js';
import { getOperationsStatus, recordOperation } from './operations.js';
import { runRadarDiscovery } from './radar.js';
import { runScreenerPromotion } from './screener.js';
import { runBackendSelfTest } from './self-test.js';
import { buildTradePlan } from './trade-plan.js';
import { runPortfolioPricePulse } from './weekly.js';
import { broadcastPortfolioStrategyPush } from './push.js';

const SELF_TEST_COOLDOWN_MS=60_000;
const OPENING_SCAN_MINUTES=new Set([570,575,580]);

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/trade-plan'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{
        await ensureSchema(env);const symbol=sanitizeSymbol(url.searchParams.get('symbol'));if(!symbol)return json({error:'Valid symbol is required.'},400);
        const saved=await getSignalAnalysis(env,symbol);if(!saved?.analysis)return json({error:'No saved SignalForge analysis exists for this symbol yet.'},404);
        const plan=buildTradePlan(saved.analysis);return json({symbol,updatedAt:saved.updatedAt,status:saved.analysis.status,readiness:saved.analysis.readiness,plan});
      }catch(error){console.error(JSON.stringify({event:'trade_plan_request_error',message:error?.message||String(error)}));return json({error:'Trade plan is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/portfolio'&&request.method==='GET'){
      const response=await app.fetch(request,env,ctx);if(!response.ok)return response;const body=await response.json();if(Array.isArray(body.positions))body.positions.sort(managedPositionSort);return json(body);
    }
    if(url.pathname==='/api/health'&&request.method==='GET'){
      const response=await app.fetch(request,env,ctx);if(!response.ok)return response;const body=await response.json();return json({...body,tradePlan:true,postBuyManager:true,portfolioPricePulseMinutes:5,partialProfitManagement:true});
    }
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
      ctx.waitUntil(runMarketScanCycle(env,{now:scheduledTime,weekday,minutes,phase:openingLabel(minutes)}));
      return;
    }
    if(weekday==='Fri'&&minutes>=585&&minutes<840&&minutes%15===0){
      ctx.waitUntil(runMarketScanCycle(env,{now:scheduledTime,weekday,minutes,phase:'FRIDAY REGULAR'}));
      return;
    }
    const prioritySlot=isWeekday(weekday)&&minutes>=590&&minutes<=955&&minutes%5===0&&minutes%15!==0;
    if(prioritySlot){
      app.scheduled(controller,env,ctx);
      ctx.waitUntil(runPortfolioPulseCycle(env,{now:scheduledTime,weekday,minutes}));
      return;
    }
    return app.scheduled(controller,env,ctx);
  }
};

async function runPortfolioPulseCycle(env,{now,weekday,minutes}){
  try{
    await ensureSchema(env);if(!env.TWELVE_DATA_API_KEY)return;
    const pulse=await runPortfolioPricePulse(env,{maxPositions:1,now});
    for(const row of pulse.reviewed||[]){if(!row?.event?.changed||!row.strategy)continue;try{const push=await broadcastPortfolioStrategyPush(env,{symbol:row.symbol,strategy:row.strategy,previousState:row.event.previousState,occurredAt:row.event.now});console.log(JSON.stringify({event:'portfolio_price_pulse_push',symbol:row.symbol,state:row.strategy.state,...push}));}catch(error){console.error(JSON.stringify({event:'portfolio_price_pulse_push_error',symbol:row.symbol,message:error?.message||String(error)}));}}
    await recordOperation(env,'portfolio-price-pulse',{status:(pulse.reviewed||[]).length?'OK':'IDLE',at:now,detail:{weekday,minutes,candidates:pulse.candidates||[],reviewed:(pulse.reviewed||[]).map(row=>({symbol:row.symbol,state:row.strategy?.state||null,price:row.price||null,changed:Boolean(row.event?.changed),skipped:row.skipped||null,error:row.error||null}))}});
    console.log(JSON.stringify({event:'portfolio_price_pulse_cycle',...pulse}));
  }catch(error){await recordOperation(env,'portfolio-price-pulse',{status:'ERROR',at:now,detail:{weekday,minutes,message:error?.message||String(error)}}).catch(()=>{});console.error(JSON.stringify({event:'portfolio_price_pulse_cycle_error',message:error?.message||String(error)}));}
}

async function runMarketScanCycle(env,{now,weekday,minutes,phase}){
  const operationKey=OPENING_SCAN_MINUTES.has(minutes)?'opening-pipeline':'radar-scan-cycle';
  try{
    await ensureSchema(env);
    await recordOperation(env,'cron-heartbeat',{status:'OK',at:now,detail:{weekday,minutes,marketDataConfigured:Boolean(env.TWELVE_DATA_API_KEY),phase}});
    if(!env.TWELVE_DATA_API_KEY){await recordOperation(env,operationKey,{status:'ERROR',at:now,detail:{phase,message:'Market-data provider is not configured.'}});return;}
    const radar=await runRadarDiscovery(env,{batchSize:5,now}),promotion=await runScreenerPromotion(env,{maxPromotions:1,now});
    const detail={phase,requested:radar.selected||null,scanned:(radar.scanned||[]).map(x=>x.symbol),leaders:(radar.leaders||[]).map(x=>x.symbol),promoted:(promotion.promoted||[]).map(x=>({symbol:x.symbol,status:x.status,readiness:x.readiness})),candidates:promotion.candidates||[],universeSize:Number(radar.universeSize)||0};
    await recordOperation(env,operationKey,{status:detail.scanned.length?'OK':'IDLE',at:now,detail});
    console.log(JSON.stringify({event:'scheduled_market_scan_cycle',...detail}));
  }catch(error){await recordOperation(env,operationKey,{status:'ERROR',at:now,detail:{phase,message:error?.message||String(error)}}).catch(()=>{});console.error(JSON.stringify({event:'scheduled_market_scan_cycle_error',phase,message:error?.message||String(error)}));}
}

function managedPositionSort(a,b){const order={'SELL / EXIT':5,'TAKE PARTIAL PROFIT':4,'REDUCE':3,'PROTECT PROFIT':2,'HOLD':1};const d=(order[b?.strategy?.state]||0)-(order[a?.strategy?.state]||0);if(d)return d;return(Number(b?.strategy?.continuationWeakness)||0)-(Number(a?.strategy?.continuationWeakness)||0);}
function openingLabel(minutes){return minutes===570?'OPENING SWEEP 1':minutes===575?'OPENING SWEEP 2':'OPENING SWEEP 3';}
function isWeekday(day){return day==='Mon'||day==='Tue'||day==='Wed'||day==='Thu'||day==='Fri';}
function easternParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
async function readJson(request){const text=await request.text();if(text.length>10_000)throw new Error('Self-test request is too large.');try{return text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON payload.');}}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
