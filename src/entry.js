import app from './index.js';
import { authorizeDevice, ensureSchema, getCachedMarket, getSignalAnalysis } from './db.js';
import { getOperationsStatus } from './operations.js';
import { runBackendSelfTest } from './self-test.js';
import { buildTradePlan } from './trade-plan.js';
import { MIN_BUY_REWARD_RISK } from './hard-guardrails.js';
import { runScheduledCycle, scheduledCoverage } from './scheduler.js';
import { configuredProviders, getMarketData } from './market.js';
import { getDiscoveryStatus } from './discovery.js';
import { getOpportunityValidation, OPPORTUNITY_EPISODE_START_SCORE, OPPORTUNITY_REVIEW_MIN_SAMPLE } from './opportunity-validation.js';
import { assessAuctionContext } from './auction-context.js';
import { getProviderHealthSnapshot } from './provider-usage.js';
import { getExecutionTrace } from './execution-trace.js';
import { analyze, assessIntradayConfirmation } from './analysis.js';
import { assessSessionRange } from './session-range.js';
import { buildFiveStageAlpha } from './method/five-stage-alpha.js';
import { evaluateEnvironment } from './method/environment/environment-engine.js';

const SELF_TEST_COOLDOWN_MS=60_000;
const EXECUTION_SHADOW_CACHE_MAX_AGE_MS=7*86_400_000;

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/trade-plan'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{await ensureSchema(env);const symbol=sanitizeSymbol(url.searchParams.get('symbol'));if(!symbol)return json({error:'Valid symbol is required.'},400);const saved=await getSignalAnalysis(env,symbol);if(!saved?.analysis)return json({error:'No saved SignalForge analysis exists for this symbol yet.'},404);const plan=buildTradePlan(saved.analysis);return json({symbol,updatedAt:saved.updatedAt,status:saved.analysis.status,readiness:saved.analysis.readiness,plan});}
      catch(error){console.error(JSON.stringify({event:'trade_plan_request_error',message:error?.message||String(error)}));return json({error:'Trade plan is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/symbol-master'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{
        await ensureSchema(env);const symbol=sanitizeSymbol(url.searchParams.get('symbol'));if(!symbol)return json({error:'Valid symbol is required.'},400);
        const analysisMarket=await getMarketData(env,symbol,'6M',false,{completedOnly:true,purpose:'symbol-master-analysis'});
        const executionMarket=await getMarketData(env,symbol,'5D',false,{completedOnly:false,purpose:'symbol-master-execution'});
        const benchmarkMarket=symbol==='SPY'?analysisMarket:await getMarketData(env,'SPY','6M',false,{completedOnly:true,purpose:'symbol-master-benchmark'});
        const confirmation=assessIntradayConfirmation(executionMarket.candles);
        const analysis=analyze(analysisMarket.candles,symbol,{benchmarkCandles:benchmarkMarket?.candles||null,intradayConfirmation:confirmation});
        const environmentState=evaluateEnvironment({symbol,stockCandles:analysisMarket.candles,benchmarkCandles:benchmarkMarket?.candles||[],sectorContext:null,asOf:Math.min(Number(analysisMarket.fetchedAt)||Date.now(),Number(benchmarkMarket?.fetchedAt)||Date.now())});
        const method=buildFiveStageAlpha(analysis,{environment:environmentState}),snapshotId=['sf-alpha',symbol,analysisMarket.fetchedAt||0,executionMarket.fetchedAt||0,benchmarkMarket?.fetchedAt||0].join(':');
        return json({
          symbol,
          snapshotId,
          method,
          environment:environmentState,
          analysis,
          candles:analysisMarket.candles,
          datasets:{
            analysis:{role:'ANALYSIS',timeframe:'6M',source:analysisMarket.source,cached:Boolean(analysisMarket.cached),fetchedAt:analysisMarket.fetchedAt,completedOnly:true},
            execution:{role:'EXECUTION',timeframe:'5D',source:executionMarket.source,cached:Boolean(executionMarket.cached),fetchedAt:executionMarket.fetchedAt,completedOnly:false},
            benchmark:{role:'BENCHMARK',symbol:'SPY',timeframe:'6M',source:benchmarkMarket?.source||analysisMarket.source,cached:Boolean(benchmarkMarket?.cached),fetchedAt:benchmarkMarket?.fetchedAt||analysisMarket.fetchedAt,completedOnly:true},
            chart:{role:'CHART',timeframe:'6M',visualizationOnly:true}
          },
          unsupported:{sectorContext:true,investmentQuality:true,portfolioAllocation:true,portfolioRisk:true,nativeFootprint:true,executedDelta:true,absorption:true,gex:true,l2:true,mbo:true},
          release:{alpha:true,releaseEligible:false,reason:'Visible tactical alpha. Dedicated Environment is shadow-only until validated. Full release remains blocked until the remaining method engines plus Investment Quality, Portfolio Allocation, Portfolio Risk, validation, and QA are complete.'}
        });
      }
      catch(error){console.error(JSON.stringify({event:'symbol_master_request_error',message:error?.message||String(error)}));return json({error:'Selected-symbol master state is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/opportunity-validation'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{return json({validation:await getOpportunityValidation(env,{horizon:normalizeOpportunityHorizon(url.searchParams.get('horizon')),minSample:clampInt(url.searchParams.get('minSample'),OPPORTUNITY_REVIEW_MIN_SAMPLE,100,OPPORTUNITY_REVIEW_MIN_SAMPLE)})});}
      catch(error){console.error(JSON.stringify({event:'opportunity_validation_request_error',message:error?.message||String(error)}));return json({error:'Opportunity Score validation is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/auction-context'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{const symbol=sanitizeSymbol(url.searchParams.get('symbol'));if(!symbol)return json({error:'Valid symbol is required.'},400);const market=await getMarketData(env,symbol,'5D',false,{completedOnly:false,purpose:'auction-context'});const auction=assessAuctionContext(market.candles,{symbol,currentPrice:market.candles.at(-1)?.close});return json({symbol,source:market.source,cached:Boolean(market.cached),fetchedAt:market.fetchedAt,auction});}
      catch(error){console.error(JSON.stringify({event:'auction_context_request_error',message:error?.message||String(error)}));return json({error:'Auction context is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/execution-shadow'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{
        await ensureSchema(env);const symbol=sanitizeSymbol(url.searchParams.get('symbol'));if(!symbol)return json({error:'Valid symbol is required.'},400);
        const [saved,market]=await Promise.all([getSignalAnalysis(env,symbol),getCachedMarket(env,symbol,'5D',EXECUTION_SHADOW_CACHE_MAX_AGE_MS)]);
        if(!market?.candles?.length)return json({error:'No cached 5D market data is available yet. Load/analyze the symbol first; this shadow endpoint will not create a provider request.',cacheMiss:true,symbol},404);
        const confirmation=assessIntradayConfirmation(market.candles),currentPrice=Number(confirmation?.latestPrice)||Number(market.candles.at(-1)?.close)||null,roomToRun=assessSessionRange(market.candles,{atr:saved?.analysis?.atr,currentPrice});
        return json({symbol,source:market.source,cached:true,fetchedAt:market.fetchedAt,providerRequest:false,shadowOnly:true,affectsBuyNow:false,confirmation,roomToRun,openingStructure:roomToRun?.openingRangeShadow||null});
      }
      catch(error){console.error(JSON.stringify({event:'execution_shadow_request_error',message:error?.message||String(error)}));return json({error:'Execution shadow is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/provider-health'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{await ensureSchema(env);const providers=configuredProviders(env);return json({health:await getProviderHealthSnapshot(env,{configured:providers})});}
      catch(error){console.error(JSON.stringify({event:'provider_health_request_error',message:error?.message||String(error)}));return json({error:'Provider API health is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/execution-trace'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      try{await ensureSchema(env);const symbol=sanitizeSymbol(url.searchParams.get('symbol'));if(!symbol)return json({error:'Valid symbol is required.'},400);return json({trace:await getExecutionTrace(env,{symbol,now:Date.now()})});}
      catch(error){console.error(JSON.stringify({event:'execution_trace_request_error',message:error?.message||String(error)}));return json({error:'Execution trace is temporarily unavailable.'},500);}
    }
    if(url.pathname==='/api/portfolio'&&request.method==='GET'){
      const response=await app.fetch(request,env,ctx);if(!response.ok)return response;const body=await response.json();if(Array.isArray(body.positions))body.positions.sort(managedPositionSort);return json(body);
    }
    if(url.pathname==='/api/health'&&request.method==='GET'){
      const response=await app.fetch(request,env,ctx);if(!response.ok)return response;
      const body=await response.json(),marketDataProviders=configuredProviders(env),marketDataConfigured=Boolean(marketDataProviders.alpaca||marketDataProviders.twelveData),discovery=await getDiscoveryStatus(env),providerDailyCap=Number(env.MAX_PROVIDER_REQUESTS_PER_DAY)||700;
      return json({...body,marketDataConfigured,marketDataProviders,symbolMasterEndpoint:'/api/symbol-master',providerHealthEndpoint:'/api/provider-health',executionTraceEndpoint:'/api/execution-trace',executionShadowEndpoint:'/api/execution-shadow',discoveryPoolSize:discovery.configuredPoolSize,discoveryCoverage:{weekKey:discovery.weekKey,configuredPoolSize:discovery.configuredPoolSize,currentWeeklyPoolSize:discovery.currentWeeklyPoolSize,poolFillPct:discovery.poolFillPct,catalogSize:discovery.catalogSize,scannedSymbols:discovery.scannedSymbols,lastScanned:discovery.lastScanned,catalogUpdatedAt:discovery.catalogUpdatedAt},scheduler:scheduledCoverage(),tradePlan:true,auctionMethod:{version:'marketpulse-auction-v0',enabled:true,shadowOnly:true,affectsBuyNow:false,endpoint:'/api/auction-context'},postBuyManager:true,portfolioPricePulseMinutes:5,partialProfitManagement:true,opportunityScoreValidation:{enabled:true,shadowOnly:true,affectsBuyNow:false,episodeStartScore:OPPORTUNITY_EPISODE_START_SCORE,reviewMinSample:OPPORTUNITY_REVIEW_MIN_SAMPLE,endpoint:'/api/opportunity-validation'},guardrails:{hardBuyAuthorization:true,minBuyRewardRisk:MIN_BUY_REWARD_RISK,participationRequired:true,thesisMustRemainIntact:true,overextensionHardBlock:true,backgroundUiReadMinutes:5,cacheOnlyChartReadMinutes:30,patternNetworkUiEnabled:false,opportunityScoreAffectsBuyNow:false,auctionMethodAffectsBuyNow:false,executionTraceAffectsBuyNow:false,executionShadowAffectsBuyNow:false,executionShadowProviderFree:true,providerDailyCap,reliabilityCiWorkflow:true}});
    }
    if(url.pathname!=='/api/backend-self-test')return app.fetch(request,env,ctx);
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    try{const body=await readJson(request),endpoint=String(request.headers.get('x-sf-endpoint')||body?.deviceEndpoint||'').trim(),token=String(request.headers.get('x-sf-token')||body?.deviceToken||'').trim();if(!endpoint.startsWith('https://')||!/^[A-Za-z0-9_-]{32,128}$/.test(token)||!await authorizeDevice(env,endpoint,token))return json({error:'Backend self-test requires an authorized SignalForge phone. Enable alerts on this phone first.'},403);const operations=await getOperationsStatus(env),lastRun=Number(operations.operations?.['backend-self-test']?.lastRunAt)||0,retryAfterMs=Math.max(0,SELF_TEST_COOLDOWN_MS-(Date.now()-lastRun));if(retryAfterMs>0)return json({error:'Backend self-test cooldown is active.',retryAfterMs},429);const symbol=sanitizeSymbol(body?.symbol)||'XOM',selfTest=await runBackendSelfTest(env,{symbol,now:Date.now()});return json({selfTest});}
    catch(error){console.error(JSON.stringify({event:'backend_self_test_request_error',message:error?.message||String(error)}));return json({error:String(error?.message||'Backend self-test failed.')},500);}
  },
  scheduled(controller,env,ctx){ctx.waitUntil(runScheduledCycle(env,Number(controller.scheduledTime)||Date.now()));}
};

function managedPositionSort(a,b){const order={'SELL / EXIT':5,'TAKE PARTIAL PROFIT':4,'REDUCE':3,'PROTECT PROFIT':2,'HOLD':1};const d=(order[b?.strategy?.state]||0)-(order[a?.strategy?.state]||0);if(d)return d;return(Number(b?.strategy?.continuationWeakness)||0)-(Number(a?.strategy?.continuationWeakness)||0);}
async function readJson(request){const text=await request.text();if(text.length>10_000)throw new Error('Self-test request is too large.');try{return text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON payload.');}}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function normalizeOpportunityHorizon(value){const n=Number(value);return[1,3,5].includes(n)?n:5;}
function clampInt(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
