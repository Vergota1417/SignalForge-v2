import { analyze, assessIntradayConfirmation } from './analysis.js';
import { DEFAULT_WATCHLIST, TIMEFRAMES } from './constants.js';
import { authorizePushTest, countPushSubscriptions, deletePortfolioPosition, deletePushSubscription, ensureSchema, listAlerts, listPortfolioPositions, listSignals, recordSignal, upsertPortfolioPosition, upsertPushSubscription } from './db.js';
import { getMarketData, searchSymbols } from './market.js';
import { broadcastSignalPush, pushConfigured, sendTestPush } from './push.js';
import { getRadarSnapshot, getRadarSymbols, runRadarDiscovery } from './radar.js';
import { evaluateStrategy, rankOpportunities } from './strategy.js';

export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      await ensureSchema(env);

      if (url.pathname==='/api/push/subscribe' && request.method==='POST') {
        if(!pushConfigured(env)) return json({error:'Push notifications are not configured yet.'},503);
        const body=await readJson(request);
        const subscription=body?.subscription;
        const testToken=String(body?.testToken||'').trim();
        if(!validSubscription(subscription)) return json({error:'Invalid push subscription.'},400);
        if(testToken && !validTestToken(testToken)) return json({error:'Invalid push test token.'},400);
        await upsertPushSubscription(env,subscription,request.headers.get('user-agent')||'',testToken);
        return json({ok:true});
      }
      if (url.pathname==='/api/push/subscribe' && request.method==='DELETE') {
        const body=await readJson(request);
        if(!body?.endpoint) return json({error:'Push endpoint is required.'},400);
        await deletePushSubscription(env,body.endpoint);
        return json({ok:true});
      }
      if (url.pathname==='/api/push/test' && request.method==='POST') {
        if(!pushConfigured(env)) return json({error:'Push notifications are not configured yet.'},503);
        const body=await readJson(request);
        const endpoint=String(body?.endpoint||'').trim(), testToken=String(body?.testToken||'').trim();
        if(!endpoint.startsWith('https://') || !validTestToken(testToken)) return json({error:'Invalid push test request.'},400);
        const auth=await authorizePushTest(env,endpoint,testToken,60_000);
        if(!auth.authorized) return json({error:'This phone is not authorized for a push test. Re-enable alerts first.'},403);
        if(auth.rateLimited) return json({error:'Test notification cooldown is active.',retryAfterMs:auth.retryAfterMs},429);
        await sendTestPush(env,auth.subscription);
        return json({ok:true,sent:true});
      }
      if (url.pathname==='/api/portfolio' && request.method==='POST') {
        const body=await readJson(request);
        const symbol=sanitizeSymbol(body?.symbol), entryPrice=Number(body?.entryPrice), shares=Number(body?.shares);
        const boughtAt=Number(body?.boughtAt)||Date.now();
        if(!symbol || !(entryPrice>0) || !(shares>0)) return json({error:'Symbol, entry price, and shares are required.'},400);
        await upsertPortfolioPosition(env,{symbol,entryPrice,shares,boughtAt,notes:String(body?.notes||'')});
        return json({ok:true,position:{symbol,entryPrice,shares,boughtAt}});
      }
      if (url.pathname==='/api/portfolio' && request.method==='DELETE') {
        const body=await readJson(request);
        const symbol=sanitizeSymbol(body?.symbol);
        if(!symbol) return json({error:'Valid symbol is required.'},400);
        await deletePortfolioPosition(env,symbol);
        return json({ok:true,symbol});
      }
      if (request.method!=='GET') return json({error:'Method not allowed.'},405);

      if (url.pathname==='/api/health') return json({ok:true,service:'SignalForge-v2',marketDataConfigured:Boolean(env.TWELVE_DATA_API_KEY),databaseConfigured:Boolean(env.DB),watchlist:watchlist(env),phase2SelectiveConfirmation:true,symbolSearch:true,opportunityRadar:true,portfolioStrategy:true,pushConfigured:pushConfigured(env),pushSubscribers:await countPushSubscriptions(env),pushTest:true});
      if (url.pathname==='/api/push/config') return json({configured:pushConfigured(env),publicKey:pushConfigured(env)?env.VAPID_PUBLIC_KEY:null,subscribers:await countPushSubscriptions(env),statuses:pushStatuses(env),testEnabled:true});
      if (url.pathname==='/api/opportunity-radar') return json({radar:await getRadarSnapshot(env)});
      if (url.pathname==='/api/portfolio') {
        const [positions,signals]=await Promise.all([listPortfolioPositions(env),listSignals(env)]);
        const signalMap=new Map(signals.map(row=>[row.symbol,row.analysis]));
        return json({positions:positions.map(position=>({...position,strategy:evaluateStrategy(signalMap.get(position.symbol),position)}))});
      }
      if (url.pathname==='/api/strategy') {
        const [positions,signals]=await Promise.all([listPortfolioPositions(env),listSignals(env)]);
        return json({ranked:rankOpportunities(signals,positions),positions});
      }
      if (url.pathname==='/api/symbol-search') {
        const query=String(url.searchParams.get('q')||'').trim();
        if (!query) return json({results:[],cached:true});
        if (query.length>80) return json({error:'Search query is too long.'},400);
        return json(await searchSymbols(env,query));
      }
      if (url.pathname==='/api/market-data') {
        const symbol=sanitizeSymbol(url.searchParams.get('symbol')), timeframe=sanitizeTimeframe(url.searchParams.get('timeframe'));
        if (!symbol) return json({error:'Invalid symbol.'},400);
        const market=await getMarketData(env,symbol,timeframe,false);
        let benchmarkCandles=null;
        if (symbol!=='SPY' && timeframe==='6M') {
          try { benchmarkCandles=(await getMarketData(env,'SPY','6M',false)).candles; }
          catch(error) { console.error(JSON.stringify({event:'benchmark_fetch_error',message:error?.message||String(error)})); }
        }
        const analysis=analyze(market.candles,symbol,{benchmarkCandles});
        const holding=(await listPortfolioPositions(env)).find(row=>row.symbol===symbol)||null;
        const strategy=evaluateStrategy(analysis,holding);
        return json({symbol,timeframe,candles:market.candles,analysis,strategy,holding,source:market.source,cached:market.cached,fetchedAt:market.fetchedAt});
      }
      if (url.pathname==='/api/alerts') return json({alerts:await listAlerts(env,clampInt(url.searchParams.get('limit'),1,50,12))});
      if (url.pathname==='/api/signals') return json({signals:await listSignals(env)});
      return json({error:'Not found.'},404);
    } catch(error) {
      console.error(JSON.stringify({event:'request_error',message:error?.message||String(error)}));
      return json({error:safeError(error)},500);
    }
  },
  scheduled(controller,env,ctx) { ctx.waitUntil(runScheduledCycle(env,controller.scheduledTime)); }
};

async function runScheduledCycle(env,scheduledTime) {
  try {
    await ensureSchema(env);
    const now=new Date(scheduledTime||Date.now());
    if (!env.TWELVE_DATA_API_KEY || !isUsMarketWindow(now)) return;
    const minute=easternMinute(now);
    if (minute===0 || minute===30) {
      const result=await runRadarDiscovery(env,{batchSize:7});
      console.log(JSON.stringify({event:'radar_discovery',scanned:result.scanned.map(x=>x.symbol),leaders:result.leaders.map(x=>x.symbol),cursor:result.cursor}));
      return;
    }
    await runDeepScan(env);
  } catch(error) {
    console.error(JSON.stringify({event:'scheduled_cycle_error',message:error?.message||String(error)}));
  }
}

async function runDeepScan(env) {
  let benchmarkCandles=null;
  try { benchmarkCandles=(await getMarketData(env,'SPY','6M',false)).candles; }
  catch(error) { console.error(JSON.stringify({event:'benchmark_fetch_error',message:error?.message||String(error)})); }

  const symbols=await selectDeepScanSymbols(env);
  const scans=[];
  for (const symbol of symbols) {
    try {
      const market=await getMarketData(env,symbol,'6M',false);
      const analysis=analyze(market.candles,symbol,{benchmarkCandles});
      scans.push({symbol,market,analysis});
    } catch(error) {
      console.error(JSON.stringify({event:'scan_symbol_error',symbol,message:error?.message||String(error)}));
    }
  }

  const candidate=selectConfirmationCandidate(scans);
  if (candidate) {
    try {
      const intradayMarket=await getMarketData(env,candidate.symbol,'5D',false);
      const intradayConfirmation=assessIntradayConfirmation(intradayMarket.candles);
      candidate.analysis=analyze(candidate.market.candles,candidate.symbol,{benchmarkCandles,intradayConfirmation});
      console.log(JSON.stringify({event:'intraday_confirmation',symbol:candidate.symbol,state:intradayConfirmation.state,passes:intradayConfirmation.passes,total:intradayConfirmation.total,status:candidate.analysis.status}));
    } catch(error) {
      console.error(JSON.stringify({event:'intraday_confirmation_error',symbol:candidate.symbol,message:error?.message||String(error)}));
    }
  }

  for (const scan of scans) {
    try {
      const event=await recordSignal(env,scan.analysis);
      if (event.changed) {
        const [webhookResult,pushResult]=await Promise.allSettled([
          sendWebhook(env,scan.analysis,event.previousStatus,event.now),
          broadcastSignalPush(env,scan.analysis,event.previousStatus,event.now)
        ]);
        if(pushResult.status==='fulfilled') console.log(JSON.stringify({event:'push_alert_result',symbol:scan.symbol,status:scan.analysis.status,...pushResult.value}));
        else console.error(JSON.stringify({event:'push_alert_error',symbol:scan.symbol,message:pushResult.reason?.message||String(pushResult.reason)}));
        if(webhookResult.status==='rejected') console.error(JSON.stringify({event:'alert_webhook_exception',symbol:scan.symbol,message:webhookResult.reason?.message||String(webhookResult.reason)}));
      }
    } catch(error) {
      console.error(JSON.stringify({event:'record_signal_error',symbol:scan.symbol,message:error?.message||String(error)}));
    }
  }
  console.log(JSON.stringify({event:'radar_deep_scan',symbols,statuses:scans.map(x=>({symbol:x.symbol,status:x.analysis.status,readiness:x.analysis.readiness}))}));
}

async function selectDeepScanSymbols(env) {
  const radar=[...new Set((await getRadarSymbols(env)).filter(symbol=>symbol&&symbol!=='SPY'))];
  const fixed=watchlist(env);
  const saved=await listSignals(env);
  const updatedAt=new Map(saved.map(row=>[row.symbol,Number(row.updatedAt)||0]));
  const maintenance=[...fixed].sort((a,b)=>(updatedAt.get(a)||0)-(updatedAt.get(b)||0));
  const selected=[];
  const add=symbol=>{if(symbol&&symbol!=='SPY'&&!selected.includes(symbol)&&selected.length<5)selected.push(symbol);};

  radar.slice(0,3).forEach(add);
  maintenance.filter(symbol=>!selected.includes(symbol)).slice(0,2).forEach(add);
  radar.forEach(add);
  maintenance.forEach(add);

  console.log(JSON.stringify({event:'deep_scan_selection',radarSlots:selected.filter(symbol=>radar.slice(0,3).includes(symbol)),maintenancePriority:maintenance.slice(0,Math.min(5,maintenance.length)),selected}));
  return selected;
}

function selectConfirmationCandidate(scans) {
  const eligible=scans.filter(({analysis}) => analysis && analysis.engines?.trend?.ready && !['AVOID','SELL / EXIT','WAIT FOR PULLBACK'].includes(analysis.status));
  if (!eligible.length) return null;
  return eligible.sort((a,b)=>confirmationPriority(b.analysis)-confirmationPriority(a.analysis))[0];
}

function confirmationPriority(analysis) {
  const statusBoost=analysis.status==='SETUP — READY SOON' ? 3000 : analysis.status==='WAIT — SETUP NOT READY' ? 1000 : 0;
  const gateBoost=analysis.dailyGatesReady ? 10000 : 0;
  const rrBoost=Math.min(Math.max(Number(analysis.rr)||0,0),5)*50;
  const relativeStrengthBoost=Math.max(-.10,Math.min(.10,Number(analysis.relativeStrength20)||0))*1000;
  return gateBoost+statusBoost+(Number(analysis.readiness)||0)*10+rrBoost+relativeStrengthBoost;
}

async function sendWebhook(env,analysis,previousStatus,now) {
  if (!env.ALERT_WEBHOOK_URL) return;
  const allowed=new Set(String(env.ALERT_STATUSES||'').split('|').map(s=>s.trim()).filter(Boolean));
  if (allowed.size&&!allowed.has(analysis.status)) return;
  const response=await fetch(env.ALERT_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:'SignalForge-v2',symbol:analysis.symbol,previousStatus,status:analysis.status,readiness:analysis.readiness,price:analysis.latest.close,reason:analysis.reason,intradayConfirmation:analysis.intradayConfirmation||null,occurredAt:new Date(now).toISOString()})});
  if (!response.ok) console.error(JSON.stringify({event:'alert_webhook_error',status:response.status}));
}

async function readJson(request){
  const text=await request.text();
  if(text.length>20_000) throw new Error('Request payload is too large.');
  try{return text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON payload.');}
}
function validSubscription(subscription){
  const endpoint=String(subscription?.endpoint||'');
  return endpoint.startsWith('https://') && endpoint.length<4096 && typeof subscription?.keys?.p256dh==='string' && typeof subscription?.keys?.auth==='string';
}
function validTestToken(value){return /^[A-Za-z0-9_-]{32,128}$/.test(String(value||''));}
function pushStatuses(env){return String(env.PUSH_ALERT_STATUSES||'SETUP — READY SOON|BUY NOW|SELL / EXIT').split('|').map(s=>s.trim()).filter(Boolean);}
function watchlist(env){const raw=String(env.WATCHLIST||'').trim();const list=raw?raw.split(',').map(sanitizeSymbol).filter(Boolean):DEFAULT_WATCHLIST;return [...new Set(list.filter(symbol=>symbol!=='SPY'))].slice(0,20);}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function sanitizeTimeframe(v){const t=String(v||'6M').toUpperCase();return TIMEFRAMES[t]?t:'6M';}
function clampInt(v,min,max,fallback){const n=Number.parseInt(v,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function safeError(error){const m=String(error?.message||'');if(/API key/i.test(m))return'Market-data service is not configured yet.';if(/quota/i.test(m))return'Market-data daily safety limit reached.';if(/429|too many requests/i.test(m))return'Market-data minute limit reached. Try again shortly.';if(/Push notifications are not configured/i.test(m))return m;if(/Invalid JSON|payload is too large|push test/i.test(m))return m;if(/Symbol, entry price|Valid symbol/i.test(m))return m;if(/Twelve Data/i.test(m))return m.slice(0,180);return'SignalForge API request failed.';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function easternParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
function easternMinute(date){return Number(easternParts(date).minute)||0;}
function isUsMarketWindow(date){const p=easternParts(date);if(p.weekday==='Sat'||p.weekday==='Sun')return false;const minutes=Number(p.hour)*60+Number(p.minute);return minutes>=570&&minutes<960;}