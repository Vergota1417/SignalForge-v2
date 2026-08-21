import { analyze, assessIntradayConfirmation } from './analysis.js';
import { DEFAULT_WATCHLIST, TIMEFRAMES } from './constants.js';
import { ensureSchema, listAlerts, listSignals, recordSignal } from './db.js';
import { getMarketData } from './market.js';

export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      await ensureSchema(env);
      if (request.method!=='GET') return json({error:'Method not allowed.'},405);

      if (url.pathname==='/api/health') return json({ok:true,service:'SignalForge-v2',marketDataConfigured:Boolean(env.TWELVE_DATA_API_KEY),databaseConfigured:Boolean(env.DB),watchlist:watchlist(env),phase2SelectiveConfirmation:true});
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
        return json({symbol,timeframe,candles:market.candles,analysis,source:market.source,cached:market.cached,fetchedAt:market.fetchedAt});
      }
      if (url.pathname==='/api/alerts') return json({alerts:await listAlerts(env,clampInt(url.searchParams.get('limit'),1,50,12))});
      if (url.pathname==='/api/signals') return json({signals:await listSignals(env)});
      return json({error:'Not found.'},404);
    } catch(error) {
      console.error(JSON.stringify({event:'request_error',message:error?.message||String(error)}));
      return json({error:safeError(error)},500);
    }
  },
  scheduled(controller,env,ctx) { ctx.waitUntil(runScheduledScan(env,controller.scheduledTime)); }
};

async function runScheduledScan(env,scheduledTime) {
  try {
    await ensureSchema(env);
    if (!env.TWELVE_DATA_API_KEY || !isUsMarketWindow(new Date(scheduledTime||Date.now()))) return;

    let benchmarkCandles=null;
    try { benchmarkCandles=(await getMarketData(env,'SPY','6M',false)).candles; }
    catch(error) { console.error(JSON.stringify({event:'benchmark_fetch_error',message:error?.message||String(error)})); }

    const scans=[];
    for (const symbol of watchlist(env)) {
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
        if (event.changed) await sendWebhook(env,scan.analysis,event.previousStatus,event.now);
      } catch(error) {
        console.error(JSON.stringify({event:'record_signal_error',symbol:scan.symbol,message:error?.message||String(error)}));
      }
    }
  } catch(error) {
    console.error(JSON.stringify({event:'scheduled_scan_error',message:error?.message||String(error)}));
  }
}

function selectConfirmationCandidate(scans) {
  const eligible=scans.filter(({analysis}) =>
    analysis && analysis.engines?.trend?.ready && !['AVOID','SELL / EXIT','WAIT FOR PULLBACK'].includes(analysis.status)
  );
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

function watchlist(env){const raw=String(env.WATCHLIST||'').trim();const list=raw?raw.split(',').map(sanitizeSymbol).filter(Boolean):DEFAULT_WATCHLIST;return [...new Set(list.filter(symbol=>symbol!=='SPY'))].slice(0,20);}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function sanitizeTimeframe(v){const t=String(v||'6M').toUpperCase();return TIMEFRAMES[t]?t:'6M';}
function clampInt(v,min,max,fallback){const n=Number.parseInt(v,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function safeError(error){const m=String(error?.message||'');if(/API key/i.test(m))return'Market-data service is not configured yet.';if(/quota/i.test(m))return'Market-data daily safety limit reached.';if(/Twelve Data/i.test(m))return m.slice(0,180);return'SignalForge API request failed.';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function isUsMarketWindow(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));if(p.weekday==='Sat'||p.weekday==='Sun')return false;const minutes=Number(p.hour)*60+Number(p.minute);return minutes>=570&&minutes<=960;}
