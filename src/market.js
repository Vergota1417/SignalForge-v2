import { TIMEFRAMES } from './constants.js';
import { getCachedMarket, putCachedMarket, reserveProviderRequest, getCachedSymbolSearch, putCachedSymbolSearch } from './db.js';

export async function getMarketData(env, symbol, timeframe, forceRefresh=false) {
  const cfg=TIMEFRAMES[timeframe];
  if (!forceRefresh) {
    const cached=await getCachedMarket(env,symbol,timeframe,cfg.cacheSeconds*1000);
    if (cached) return cached;
  }
  if (!env.TWELVE_DATA_API_KEY) throw new Error('Twelve Data API key is not configured.');
  await reserveProviderRequest(env);

  const url=new URL('https://api.twelvedata.com/time_series');
  url.searchParams.set('symbol',symbol); url.searchParams.set('interval',cfg.interval);
  url.searchParams.set('outputsize',String(cfg.outputsize)); url.searchParams.set('order','asc');
  url.searchParams.set('timezone','UTC'); url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if (!response.ok) throw new Error(`Twelve Data HTTP ${response.status}`);
  const payload=await response.json();
  if (payload?.status==='error') throw new Error(`Twelve Data: ${payload.message||'provider error'}`);
  if (!Array.isArray(payload?.values)||payload.values.length<60) throw new Error('Twelve Data returned insufficient candle history.');

  let candles=payload.values.map(row=>({
    time:parseProviderTime(row.datetime), open:Number(row.open), high:Number(row.high), low:Number(row.low), close:Number(row.close), volume:Number(row.volume||0)
  })).filter(c=>Number.isFinite(c.time)&&c.open>0&&c.high>0&&c.low>0&&c.close>0);

  if(cfg.regularSessions) candles=trimToRegularSessions(candles,cfg.regularSessions);
  if (candles.length<Math.min(20,cfg.outputsize)) throw new Error('Twelve Data candle payload failed validation.');
  const fetchedAt=await putCachedMarket(env,symbol,timeframe,'Twelve Data',candles);
  return { candles, source:'Twelve Data', cached:false, fetchedAt };
}

export async function searchSymbols(env, query) {
  const normalized=String(query||'').trim().replace(/\s+/g,' ').slice(0,80);
  if (normalized.length<1) return {results:[],cached:true,fetchedAt:Date.now()};

  const cacheKey=normalized.toUpperCase();
  const cached=await getCachedSymbolSearch(env,cacheKey,86_400_000);
  if (cached) return cached;
  if (!env.TWELVE_DATA_API_KEY) throw new Error('Twelve Data API key is not configured.');
  await reserveProviderRequest(env);

  const url=new URL('https://api.twelvedata.com/symbol_search');
  url.searchParams.set('symbol',normalized);
  url.searchParams.set('outputsize','12');
  url.searchParams.set('show_plan','true');
  url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if (!response.ok) throw new Error(`Twelve Data symbol search HTTP ${response.status}`);
  const payload=await response.json();
  if (payload?.status==='error') throw new Error(`Twelve Data: ${payload.message||'symbol search error'}`);

  const results=(Array.isArray(payload?.data)?payload.data:[])
    .filter(row=>row?.symbol && row?.instrument_name)
    .map(row=>({
      symbol:String(row.symbol).toUpperCase(),
      name:String(row.instrument_name),
      exchange:String(row.exchange||''),
      micCode:String(row.mic_code||''),
      type:String(row.instrument_type||''),
      country:String(row.country||''),
      currency:String(row.currency||''),
      plan:String(row.access?.plan||'')
    }))
    .filter(row=>row.country==='United States' || row.currency==='USD')
    .slice(0,8);

  const fetchedAt=await putCachedSymbolSearch(env,cacheKey,results);
  return {results,cached:false,fetchedAt};
}

function trimToRegularSessions(candles,sessionCount){
  const regular=candles.map(c=>({c,session:marketSession(c.time)})).filter(x=>x.session?.regular);
  const keys=[];
  for(let i=regular.length-1;i>=0;i--){
    const key=regular[i].session.key;
    if(!keys.includes(key)) keys.push(key);
    if(keys.length>=sessionCount) break;
  }
  const allowed=new Set(keys);
  return regular.filter(x=>allowed.has(x.session.key)).map(x=>x.c);
}

function marketSession(time){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(time));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  if(p.weekday==='Sat'||p.weekday==='Sun') return {regular:false,key:''};
  const minutes=Number(p.hour)*60+Number(p.minute);
  return {regular:minutes>=570&&minutes<960,key:`${p.year}-${p.month}-${p.day}`};
}

function parseProviderTime(value) {
  const normalized=String(value||'').trim().replace(' ','T');
  const parsed=Date.parse(`${normalized}Z`);
  return Number.isFinite(parsed)?parsed:Date.now();
}
