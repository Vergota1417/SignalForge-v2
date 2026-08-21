import { TIMEFRAMES } from './constants.js';
import { getCachedMarket, putCachedMarket, reserveProviderRequest } from './db.js';

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
  url.searchParams.set('timezone','America/New_York'); url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if (!response.ok) throw new Error(`Twelve Data HTTP ${response.status}`);
  const payload=await response.json();
  if (payload?.status==='error') throw new Error(`Twelve Data: ${payload.message||'provider error'}`);
  if (!Array.isArray(payload?.values)||payload.values.length<60) throw new Error('Twelve Data returned insufficient candle history.');

  const candles=payload.values.map(row=>({
    time:parseProviderTime(row.datetime), open:Number(row.open), high:Number(row.high), low:Number(row.low), close:Number(row.close), volume:Number(row.volume||0)
  })).filter(c=>Number.isFinite(c.time)&&c.open>0&&c.high>0&&c.low>0&&c.close>0);
  if (candles.length<60) throw new Error('Twelve Data candle payload failed validation.');
  const fetchedAt=await putCachedMarket(env,symbol,timeframe,'Twelve Data',candles);
  return { candles, source:'Twelve Data', cached:false, fetchedAt };
}

function parseProviderTime(value) {
  const normalized=String(value||'').trim().replace(' ','T');
  const parsed=Date.parse(`${normalized}Z`);
  return Number.isFinite(parsed)?parsed:Date.now();
}
