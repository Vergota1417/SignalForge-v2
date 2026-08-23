import { analyze } from './analysis.js';
import { DEFAULT_WATCHLIST, TIMEFRAMES } from './constants.js';
import { authorizeDevice, authorizePushTest, countPushSubscriptions, deletePortfolioPosition, deletePushSubscription, ensureSchema, getCachedMarket, listAlerts, listPortfolioPositions, listSignals, upsertPortfolioPosition, upsertPushSubscription } from './db.js';
import { getMarketData, searchSymbols } from './market.js';
import { broadcastBackgroundSummaryPush, broadcastPortfolioStrategyPush, broadcastWeeklyOpportunityPush, pushConfigured, sendTestPush } from './push.js';
import { getRadarSnapshot, runRadarDiscovery } from './radar.js';
import { getSmartScreenerSnapshot, runScreenerPromotion } from './screener.js';
import { getAfterHoursResearchStatus, runAfterHoursResearch } from './research.js';
import { addSimulationContribution, setStartingCapital } from './simulation.js';
import { evaluateStrategy, rankOpportunities, rankPortfolioActions } from './strategy.js';
import { getWeeklyStrategySnapshot, runPortfolioCloseReview, runWeeklyResearchBatch } from './weekly.js';

export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);await ensureSchema(env);
      if(url.pathname==='/api/push/subscribe'&&request.method==='POST'){
        if(!pushConfigured(env))return json({error:'Push notifications are not configured yet.'},503);
        const body=await readJson(request),subscription=body?.subscription,testToken=String(body?.testToken||'').trim();if(!validSubscription(subscription))return json({error:'Invalid push subscription.'},400);if(testToken&&!validTestToken(testToken))return json({error:'Invalid push test token.'},400);await upsertPushSubscription(env,subscription,request.headers.get('user-agent')||'',testToken);return json({ok:true});
      }
      if(url.pathname==='/api/push/subscribe'&&request.method==='DELETE'){const body=await readJson(request);if(!body?.endpoint)return json({error:'Push endpoint is required.'},400);await deletePushSubscription(env,body.endpoint);return json({ok:true});}
      if(url.pathname==='/api/push/test'&&request.method==='POST'){
        if(!pushConfigured(env))return json({error:'Push notifications are not configured yet.'},503);
        const body=await readJson(request),endpoint=String(body?.endpoint||'').trim(),testToken=String(body?.testToken||'').trim();if(!endpoint.startsWith('https://')||!validTestToken(testToken))return json({error:'Invalid push test request.'},400);
        const auth=await authorizePushTest(env,endpoint,testToken,60_000);if(!auth.authorized)return json({error:'This phone is not authorized for a push test. Re-enable alerts first.'},403);if(auth.rateLimited)return json({error:'Test notification cooldown is active.',retryAfterMs:auth.retryAfterMs},429);await sendTestPush(env,auth.subscription);return json({ok:true,sent:true});
      }
      if(url.pathname==='/api/portfolio'&&request.method==='POST'){
        const body=await readJson(request);if(!await portfolioAuthorized(request,env,body))return json({error:'Portfolio access requires an authorized SignalForge phone.'},403);
        const symbol=sanitizeSymbol(body?.symbol),entryPrice=Number(body?.entryPrice),shares=Number(body?.shares),boughtAt=Number(body?.boughtAt)||Date.now();if(!symbol||!(entryPrice>0)||!(shares>0))return json({error:'Symbol, entry price, and shares are required.'},400);await upsertPortfolioPosition(env,{symbol,entryPrice,shares,boughtAt,notes:String(body?.notes||'')});return json({ok:true,position:{symbol,entryPrice,shares,boughtAt}});
      }
      if(url.pathname==='/api/portfolio'&&request.method==='DELETE'){const body=await readJson(request);if(!await portfolioAuthorized(request,env,body))return json({error:'Portfolio access requires an authorized SignalForge phone.'},403);const symbol=sanitizeSymbol(body?.symbol);if(!symbol)return json({error:'Valid symbol is required.'},400);await deletePortfolioPosition(env,symbol);return json({ok:true,symbol});}
      if(url.pathname==='/api/simulation/start'&&request.method==='POST'){
        const body=await readJson(request);if(!await portfolioAuthorized(request,env,body))return json({error:'Simulation capital changes require an authorized SignalForge phone.'},403);
        return json({simulation:await setStartingCapital(env,body?.amount)});
      }
      if(url.pathname==='/api/simulation/contribution'&&request.method==='POST'){
        const body=await readJson(request);if(!await portfolioAuthorized(request,env,body))return json({error:'Simulation contributions require an authorized SignalForge phone.'},403);
        return json({simulation:await addSimulationContribution(env,body?.amount,{note:String(body?.note||'')})});
      }
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);

      if(url.pathname==='/api/health')return json({ok:true,service:'SignalForge-v2',marketDataConfigured:Boolean(env.TWELVE_DATA_API_KEY),databaseConfigured:Boolean(env.DB),watchlist:watchlist(env),weeklyInvestmentEngine:true,dynamicDiscovery:true,discoveryPoolSize:120,weeklyResearchTarget:36,intradayTimingOnly:true,symbolSearch:true,opportunityRadar:true,smartMarketScreener:true,screenerPromotion:true,afterHoursResearch:true,weekendResearch:true,dailyBackgroundSummary:true,portfolioStrategy:true,paperSimulation:true,simulationContributions:true,calibratedScoring:true,fractionalSizing:true,pushConfigured:pushConfigured(env),pushSubscribers:await countPushSubscriptions(env),pushTest:true});
      if(url.pathname==='/api/push/config')return json({configured:pushConfigured(env),publicKey:pushConfigured(env)?env.VAPID_PUBLIC_KEY:null,subscribers:await countPushSubscriptions(env),statuses:pushStatuses(env),backgroundSummary:true,testEnabled:true});
      if(url.pathname==='/api/opportunity-radar')return json({radar:await getRadarSnapshot(env)});
      if(url.pathname==='/api/screener')return json({screener:await getSmartScreenerSnapshot(env,{limit:clampInt(url.searchParams.get('limit'),5,50,30)})});
      if(url.pathname==='/api/research-status')return json({research:await getAfterHoursResearchStatus(env)});
      if(url.pathname==='/api/portfolio'){
        if(!await portfolioAuthorized(request,env))return json({error:'Portfolio access requires an authorized SignalForge phone.'},403);
        const[positions,signals,stateRows]=await Promise.all([listPortfolioPositions(env),listSignals(env),env.DB.prepare(`SELECT symbol,strategy_json AS strategyJson FROM portfolio_strategy_state`).all()]);
        const signalMap=new Map(signals.map(row=>[row.symbol,row.analysis])),strategyMap=new Map((stateRows.results||[]).map(row=>{try{return[row.symbol,JSON.parse(row.strategyJson)];}catch{return[row.symbol,null];}})),rows=positions.map(position=>({...position,strategy:strategyMap.get(position.symbol)||evaluateStrategy(signalMap.get(position.symbol),position)}));return json({positions:rankPortfolioActions(rows)});
      }
      if(url.pathname==='/api/strategy'){
        if(!await portfolioAuthorized(request,env))return json({error:'Strategy ranking requires an authorized SignalForge phone.'},403);
        const[positions,weekly]=await Promise.all([listPortfolioPositions(env),getWeeklyStrategySnapshot(env)]),ranked=rankOpportunities(weekly.ranked,positions);return json({ranked,weekly:{weekKey:weekly.weekKey,complete:weekly.complete,progress:weekly.progress,scanned:weekly.scanned,universeSize:weekly.universeSize,completedAt:weekly.completedAt||null,updatedAt:weekly.updatedAt||null}});
      }
      if(url.pathname==='/api/symbol-search'){const query=String(url.searchParams.get('q')||'').trim();if(!query)return json({results:[],cached:true});if(query.length>80)return json({error:'Search query is too long.'},400);return json(await searchSymbols(env,query));}
      if(url.pathname==='/api/market-data'){
        const symbol=sanitizeSymbol(url.searchParams.get('symbol')),timeframe=sanitizeTimeframe(url.searchParams.get('timeframe'));if(!symbol)return json({error:'Invalid symbol.'},400);
        if(url.searchParams.get('cacheOnly')==='1'){
          const market=await getCachedMarket(env,symbol,timeframe,30*86_400_000);if(!market)return json({error:'Cached detail unavailable.',cacheMiss:true,symbol,timeframe},404);return json({symbol,timeframe,candles:market.candles,source:market.source,cached:true,fetchedAt:market.fetchedAt,cacheOnly:true});
        }
        const market=await getMarketData(env,symbol,timeframe,false);let benchmarkCandles=null;if(symbol!=='SPY'&&(timeframe==='6M'||timeframe==='1Y')){try{benchmarkCandles=(await getMarketData(env,'SPY',timeframe,false)).candles;}catch(error){console.error(JSON.stringify({event:'benchmark_fetch_error',message:error?.message||String(error)}));}}
        const analysis=analyze(market.candles,symbol,{benchmarkCandles}),strategy=evaluateStrategy(analysis,null);return json({symbol,timeframe,candles:market.candles,analysis,strategy,source:market.source,cached:market.cached,fetchedAt:market.fetchedAt});
      }
      if(url.pathname==='/api/alerts')return json({alerts:await listAlerts(env,clampInt(url.searchParams.get('limit'),1,50,12))});
      if(url.pathname==='/api/signals')return json({signals:await listSignals(env)});
      return json({error:'Not found.'},404);
    }catch(error){console.error(JSON.stringify({event:'request_error',message:error?.message||String(error)}));return json({error:safeError(error)},500);}
  },
  scheduled(controller,env,ctx){ctx.waitUntil(runScheduledCycle(env,controller.scheduledTime));}
};

async function runScheduledCycle(env,scheduledTime){
  try{
    await ensureSchema(env);const now=new Date(scheduledTime||Date.now());if(!env.TWELVE_DATA_API_KEY)return;
    const p=easternParts(now),minutes=Number(p.hour)*60+Number(p.minute),weekday=p.weekday;
    if(weekday==='Sat'||weekday==='Sun'){
      if(minutes!==675)return;let weekendResearch=null;if(weekday==='Sat'){weekendResearch=await runAfterHoursResearch(env,{now:now.getTime(),maxPerRun:6,expandUniverse:true});console.log(JSON.stringify({event:'weekend_research_cycle',weekday,...weekendResearch}));}
      const[screener,research]=await Promise.all([getSmartScreenerSnapshot(env,{limit:10}),getAfterHoursResearchStatus(env)]),top=bestSummaryCandidate(screener?.rows||[]),push=await broadcastBackgroundSummaryPush(env,{dayLabel:weekday==='Sat'?'Saturday':'Sunday',top,research,weekend:true,occurredAt:now.getTime()});console.log(JSON.stringify({event:'weekend_background_summary',weekday,symbol:top?.symbol||null,researchRan:Boolean(weekendResearch),...push}));return;
    }
    if(weekday==='Fri'&&minutes>=840&&minutes<=930&&minutes%15===0){
      const result=await runWeeklyResearchBatch(env,{batchSize:6,now});console.log(JSON.stringify({event:'weekly_research_batch',weekKey:result.weekKey,scanned:result.scanned,cursor:result.cursor,universeSize:result.universeSize,completed:result.completed}));
      if(result.completed&&result.scanned.length){const[snapshot,positions]=await Promise.all([getWeeklyStrategySnapshot(env),listPortfolioPositions(env)]),top=rankOpportunities(snapshot.ranked,positions)[0];if(top){try{const push=await broadcastWeeklyOpportunityPush(env,{weekKey:snapshot.weekKey,row:top,occurredAt:Date.now()});console.log(JSON.stringify({event:'weekly_opportunity_push',symbol:top.symbol,state:top.strategy?.state,...push}));}catch(error){console.error(JSON.stringify({event:'weekly_opportunity_push_error',message:error?.message||String(error)}));}}}return;
    }
    const discoveryDay=weekday!=='Fri',discoverySlot=minutes>=615&&minutes<=915&&minutes%60===15;
    if(discoveryDay&&discoverySlot){const radar=await runRadarDiscovery(env,{batchSize:5}),promotion=await runScreenerPromotion(env,{maxPromotions:2,now:now.getTime()});console.log(JSON.stringify({event:'discovery_promotion_cycle',scanned:radar.scanned.map(x=>x.symbol),leaders:radar.leaders.map(x=>x.symbol),promoted:promotion.promoted,candidates:promotion.candidates,cursor:radar.cursor,universeSize:radar.universeSize}));return;}
    if(minutes===945){const result=await runPortfolioCloseReview(env,{maxPositions:6});for(const row of result.reviewed){if(!row.event?.changed)continue;try{const push=await broadcastPortfolioStrategyPush(env,{symbol:row.symbol,strategy:row.strategy,previousState:row.event.previousState,occurredAt:row.event.now});console.log(JSON.stringify({event:'portfolio_strategy_push',symbol:row.symbol,state:row.strategy.state,...push}));}catch(error){console.error(JSON.stringify({event:'portfolio_strategy_push_error',symbol:row.symbol,message:error?.message||String(error)}));}}console.log(JSON.stringify({event:'portfolio_close_review',reviewed:result.reviewed.map(x=>({symbol:x.symbol,state:x.strategy.state})),skipped:result.skipped}));return;}
    const afterHoursSlot=minutes>=975&&minutes<=1125&&minutes%30===15;
    if(afterHoursSlot){const result=await runAfterHoursResearch(env,{now:now.getTime(),maxPerRun:6});console.log(JSON.stringify({event:'after_hours_research_cycle',...result}));if(minutes===1125){const[screener,research]=await Promise.all([getSmartScreenerSnapshot(env,{limit:10}),getAfterHoursResearchStatus(env)]),top=bestSummaryCandidate(screener?.rows||[]),push=await broadcastBackgroundSummaryPush(env,{dayLabel:weekday,top,research,weekend:false,occurredAt:now.getTime()});console.log(JSON.stringify({event:'daily_background_summary',weekday,symbol:top?.symbol||null,...push}));}}
  }catch(error){console.error(JSON.stringify({event:'scheduled_cycle_error',message:error?.message||String(error)}));}
}

function bestSummaryCandidate(rows){return(rows||[]).find(row=>row?.bucket&&row.bucket!=='AVOID')||(rows||[])[0]||null;}
async function portfolioAuthorized(request,env,body=null){const endpoint=String(request.headers.get('x-sf-endpoint')||body?.deviceEndpoint||'').trim(),token=String(request.headers.get('x-sf-token')||body?.deviceToken||'').trim();if(!endpoint.startsWith('https://')||!validTestToken(token))return false;return authorizeDevice(env,endpoint,token);}
async function readJson(request){const text=await request.text();if(text.length>20_000)throw new Error('Request payload is too large.');try{return text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON payload.');}}
function validSubscription(subscription){const endpoint=String(subscription?.endpoint||'');return endpoint.startsWith('https://')&&endpoint.length<4096&&typeof subscription?.keys?.p256dh==='string'&&typeof subscription?.keys?.auth==='string';}
function validTestToken(value){return/^[A-Za-z0-9_-]{32,128}$/.test(String(value||''));}
function pushStatuses(env){return String(env.PUSH_ALERT_STATUSES||'SETUP — READY SOON|BUY NOW|SELL / EXIT').split('|').map(s=>s.trim()).filter(Boolean);}
function watchlist(env){const raw=String(env.WATCHLIST||'').trim(),list=raw?raw.split(',').map(sanitizeSymbol).filter(Boolean):DEFAULT_WATCHLIST;return[...new Set(list.filter(symbol=>symbol!=='SPY'))].slice(0,20);}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function sanitizeTimeframe(v){const t=String(v||'6M').toUpperCase();return TIMEFRAMES[t]?t:'6M';}
function clampInt(v,min,max,fallback){const n=Number.parseInt(v,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function safeError(error){const m=String(error?.message||'');if(/Starting capital is locked|Amount must be between/i.test(m))return m;if(/API key/i.test(m))return'Market-data service is not configured yet.';if(/quota/i.test(m))return'Market-data daily safety limit reached.';if(/429|too many requests/i.test(m))return'Market-data minute limit reached. Try again shortly.';if(/Weekly research|Portfolio review/i.test(m))return m;if(/Push notifications are not configured/i.test(m))return m;if(/Invalid JSON|payload is too large|push test/i.test(m))return m;if(/Twelve Data/i.test(m))return m.slice(0,180);return'SignalForge API request failed.';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function easternParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
