import app from './index.js';
import { authorizeDevice, ensureSchema, getSignalAnalysis } from './db.js';
import { getOperationsStatus } from './operations.js';
import { runBackendSelfTest } from './self-test.js';
import { buildTradePlan } from './trade-plan.js';
import { MIN_BUY_REWARD_RISK } from './hard-guardrails.js';
import { runScheduledCycle, scheduledCoverage } from './scheduler.js';
import { configuredProviders } from './market.js';

const SELF_TEST_COOLDOWN_MS=60_000;

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
      const response=await app.fetch(request,env,ctx);if(!response.ok)return response;const body=await response.json(),marketDataProviders=configuredProviders(env),marketDataConfigured=Boolean(marketDataProviders.alpaca||marketDataProviders.twelveData);
      const providerDailyCap=Number(env.MAX_PROVIDER_REQUESTS_PER_DAY)||700;
      return json({...body,marketDataConfigured,marketDataProviders,scheduler:scheduledCoverage(),tradePlan:true,postBuyManager:true,portfolioPricePulseMinutes:5,partialProfitManagement:true,guardrails:{hardBuyAuthorization:true,minBuyRewardRisk:MIN_BUY_REWARD_RISK,participationRequired:true,thesisMustRemainIntact:true,overextensionHardBlock:true,backgroundUiReadMinutes:5,cacheOnlyChartReadMinutes:30,patternNetworkUiEnabled:false,providerDailyCap,reliabilityCiWorkflow:true}});
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
  scheduled(controller,env,ctx){ctx.waitUntil(runScheduledCycle(env,Number(controller.scheduledTime)||Date.now()));}
};

function managedPositionSort(a,b){const order={'SELL / EXIT':5,'TAKE PARTIAL PROFIT':4,'REDUCE':3,'PROTECT PROFIT':2,'HOLD':1};const d=(order[b?.strategy?.state]||0)-(order[a?.strategy?.state]||0);if(d)return d;return(Number(b?.strategy?.continuationWeakness)||0)-(Number(a?.strategy?.continuationWeakness)||0);}
async function readJson(request){const text=await request.text();if(text.length>10_000)throw new Error('Self-test request is too large.');try{return text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON payload.');}}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
