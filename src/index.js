import { analyze } from './analysis.js';
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

      if (url.pathname==='/api/health') return json({ok:true,service:'SignalForge-v2',marketDataConfigured:Boolean(env.TWELVE_DATA_API_KEY),databaseConfigured:Boolean(env.DB),watchlist:watchlist(env)});
      if (url.pathname==='/api/market-data') {
        const symbol=sanitizeSymbol(url.searchParams.get('symbol')), timeframe=sanitizeTimeframe(url.searchParams.get('timeframe'));
        if (!symbol) return json({error:'Invalid symbol.'},400);
        const market=await getMarketData(env,symbol,timeframe,false), analysis=analyze(market.candles,symbol);
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
    for (const symbol of watchlist(env)) {
      try {
        const market=await getMarketData(env,symbol,'6M',false), analysis=analyze(market.candles,symbol);
        const event=await recordSignal(env,analysis);
        if (event.changed) await sendWebhook(env,analysis,event.previousStatus,event.now);
      } catch(error) { console.error(JSON.stringify({event:'scan_symbol_error',symbol,message:error?.message||String(error)})); }
    }
  } catch(error) { console.error(JSON.stringify({event:'scheduled_scan_error',message:error?.message||String(error)})); }
}

async function sendWebhook(env,analysis,previousStatus,now) {
  if (!env.ALERT_WEBHOOK_URL) return;
  const allowed=new Set(String(env.ALERT_STATUSES||'').split('|').map(s=>s.trim()).filter(Boolean));
  if (allowed.size&&!allowed.has(analysis.status)) return;
  const response=await fetch(env.ALERT_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app:'SignalForge-v2',symbol:analysis.symbol,previousStatus,status:analysis.status,readiness:analysis.readiness,price:analysis.latest.close,reason:analysis.reason,occurredAt:new Date(now).toISOString()})});
  if (!response.ok) console.error(JSON.stringify({event:'alert_webhook_error',status:response.status}));
}

function watchlist(env){const raw=String(env.WATCHLIST||'').trim();const list=raw?raw.split(',').map(sanitizeSymbol).filter(Boolean):DEFAULT_WATCHLIST;return [...new Set(list)].slice(0,20);}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function sanitizeTimeframe(v){const t=String(v||'6M').toUpperCase();return TIMEFRAMES[t]?t:'6M';}
function clampInt(v,min,max,fallback){const n=Number.parseInt(v,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function safeError(error){const m=String(error?.message||'');if(/API key/i.test(m))return'Market-data service is not configured yet.';if(/quota/i.test(m))return'Market-data daily safety limit reached.';if(/Twelve Data/i.test(m))return m.slice(0,180);return'SignalForge API request failed.';}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function isUsMarketWindow(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));if(p.weekday==='Sat'||p.weekday==='Sun')return false;const minutes=Number(p.hour)*60+Number(p.minute);return minutes>=570&&minutes<=960;}
