import { TIMEFRAMES } from './constants.js';
import { getCachedMarket, putCachedMarket, getCachedSymbolSearch, putCachedSymbolSearch } from './db.js';
import { reserveProviderPurpose } from './provider-usage.js';

const MINIMUM_HISTORY={ '1D':1,'5D':60,'1M':60,'3M':60,'6M':100,'1Y':120,'2Y':80 };
const US_EXCHANGES=new Set(['NASDAQ','NYSE','NYSE AMERICAN','NYSE ARCA','CBOE','BATS']);

export async function getMarketData(env,symbol,timeframe,forceRefresh=false,options={}){
  const cfg=TIMEFRAMES[timeframe];if(!cfg)throw new Error('Unsupported timeframe.');
  const completedOnly=Boolean(options?.completedOnly),purpose=String(options?.purpose||`time-series-${String(timeframe).toLowerCase()}`);
  if(!forceRefresh){
    const cached=await getCachedMarket(env,symbol,timeframe,cfg.cacheSeconds*1000);
    if(cached){
      const processed=completedOnly?removeFormingHigherTimeframeBar(cached.candles,timeframe,Date.now()):cached.candles;
      validateMinimumHistory(processed,timeframe);
      return{...cached,candles:processed,quality:qualitySummary({rawBars:cached.candles.length,acceptedBars:processed.length,formingBarsRemoved:cached.candles.length-processed.length,historyRequired:minimumHistory(timeframe),cacheDerived:true})};
    }
  }
  if(!env.TWELVE_DATA_API_KEY)throw new Error('Twelve Data API key is not configured.');
  await reserveProviderPurpose(env,purpose);

  const url=new URL('https://api.twelvedata.com/time_series');
  url.searchParams.set('symbol',symbol);url.searchParams.set('interval',cfg.interval);url.searchParams.set('outputsize',String(cfg.outputsize));url.searchParams.set('order','asc');url.searchParams.set('timezone','UTC');url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const payload=await fetchProviderJson(url,'Twelve Data');
  if(payload?.status==='error')throw new Error(`Twelve Data: ${payload.message||'provider error'}`);
  if(!Array.isArray(payload?.values)||payload.values.length<10)throw new Error('Twelve Data returned insufficient candle history.');

  const rawBars=payload.values.length,parsed=[];
  for(const row of payload.values){
    const candle={time:parseProviderTime(row.datetime),open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:Number(row.volume||0)};
    if(validCandle(candle))parsed.push(candle);
  }
  const rejectedBars=rawBars-parsed.length;
  let candles=dedupeAndSortCandles(parsed),duplicatesRemoved=parsed.length-candles.length;
  if(cfg.regularSessions)candles=trimToRegularSessions(candles,cfg.regularSessions);
  const beforeCompletedFilter=candles.length;
  if(completedOnly)candles=removeFormingHigherTimeframeBar(candles,timeframe,Date.now());
  const formingBarsRemoved=beforeCompletedFilter-candles.length;
  validateMinimumHistory(candles,timeframe);

  const fetchedAt=await putCachedMarket(env,symbol,timeframe,'Twelve Data',completedOnly?mergeForCache(parsed,cfg):candles);
  return{candles,source:'Twelve Data',cached:false,fetchedAt,quality:qualitySummary({rawBars,acceptedBars:candles.length,rejectedBars,duplicatesRemoved,formingBarsRemoved,historyRequired:minimumHistory(timeframe),cacheDerived:false})};
}

export async function searchSymbols(env,query){
  const normalized=String(query||'').trim().replace(/\s+/g,' ').slice(0,80);if(normalized.length<1)return{results:[],cached:true,fetchedAt:Date.now()};
  const cacheKey=normalized.toUpperCase(),cached=await getCachedSymbolSearch(env,cacheKey,86_400_000);if(cached)return cached;
  if(!env.TWELVE_DATA_API_KEY)throw new Error('Twelve Data API key is not configured.');await reserveProviderPurpose(env,'symbol-search');
  const url=new URL('https://api.twelvedata.com/symbol_search');url.searchParams.set('symbol',normalized);url.searchParams.set('outputsize','12');url.searchParams.set('show_plan','true');url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const payload=await fetchProviderJson(url,'Twelve Data symbol search');if(payload?.status==='error')throw new Error(`Twelve Data: ${payload.message||'symbol search error'}`);
  const results=(Array.isArray(payload?.data)?payload.data:[]).filter(row=>row?.symbol&&row?.instrument_name).map(row=>({symbol:String(row.symbol).toUpperCase(),name:String(row.instrument_name),exchange:String(row.exchange||''),micCode:String(row.mic_code||''),type:String(row.instrument_type||''),country:String(row.country||''),currency:String(row.currency||''),plan:String(row.access?.plan||'')})).filter(isSupportedSearchResult).slice(0,8);
  const fetchedAt=await putCachedSymbolSearch(env,cacheKey,results);return{results,cached:false,fetchedAt};
}

export function parseProviderTime(value){
  const raw=String(value||'').trim();if(!raw)return NaN;
  const normalized=raw.replace(' ','T'),hasZone=/Z$/i.test(normalized)||/[+-]\d{2}:?\d{2}$/.test(normalized),parsed=Date.parse(hasZone?normalized:`${normalized}Z`);
  return Number.isFinite(parsed)?parsed:NaN;
}
export function validCandle(c){return Number.isFinite(c?.time)&&Number.isFinite(c?.open)&&Number.isFinite(c?.high)&&Number.isFinite(c?.low)&&Number.isFinite(c?.close)&&Number.isFinite(c?.volume)&&c.open>0&&c.high>0&&c.low>0&&c.close>0&&c.volume>=0&&c.high>=c.low&&c.high>=c.open&&c.high>=c.close&&c.low<=c.open&&c.low<=c.close;}
export function dedupeAndSortCandles(candles){const byTime=new Map();for(const candle of candles||[])if(validCandle(candle))byTime.set(Number(candle.time),candle);return[...byTime.values()].sort((a,b)=>a.time-b.time);}
export function minimumHistory(timeframe){return MINIMUM_HISTORY[timeframe]??60;}

function validateMinimumHistory(candles,timeframe){const required=minimumHistory(timeframe);if(candles.length<required)throw new Error(`Twelve Data candle payload failed validation: ${candles.length}/${required} usable bars for ${timeframe}.`);}
function qualitySummary({rawBars=0,acceptedBars=0,rejectedBars=0,duplicatesRemoved=0,formingBarsRemoved=0,historyRequired=0,cacheDerived=false}={}){return{rawBars,acceptedBars,rejectedBars,duplicatesRemoved,formingBarsRemoved,historyRequired,historyReady:acceptedBars>=historyRequired,cacheDerived};}
function mergeForCache(parsed,cfg){let rows=dedupeAndSortCandles(parsed);if(cfg.regularSessions)rows=trimToRegularSessions(rows,cfg.regularSessions);return rows;}

function removeFormingHigherTimeframeBar(candles,timeframe,now=Date.now()){
  if(!candles.length)return candles;
  if(!['3M','6M','1Y','2Y'].includes(timeframe))return candles;
  const latest=candles[candles.length-1],p=easternParts(new Date(now)),minutes=Number(p.hour)*60+Number(p.minute),weekday=weekdayIndex(p.weekday);
  if(timeframe==='2Y'){
    const currentWeek=weekKeyFromEasternParts(p),latestWeek=weekKeyFromUtcTimestamp(latest.time);
    const weeklyComplete=weekday>5||(weekday===5&&minutes>=965);
    return latestWeek===currentWeek&&!weeklyComplete?candles.slice(0,-1):candles;
  }
  const providerDay=new Date(latest.time).toISOString().slice(0,10),today=`${p.year}-${p.month}-${p.day}`,dailyComplete=weekday>=1&&weekday<=5&&minutes>=965;
  return providerDay===today&&!dailyComplete?candles.slice(0,-1):candles;
}
function trimToRegularSessions(candles,sessionCount){const regular=candles.map(c=>({c,session:marketSession(c.time)})).filter(x=>x.session?.regular),keys=[];for(let i=regular.length-1;i>=0;i--){const key=regular[i].session.key;if(!keys.includes(key))keys.push(key);if(keys.length>=sessionCount)break;}const allowed=new Set(keys);return regular.filter(x=>allowed.has(x.session.key)).map(x=>x.c);}
function marketSession(time){const p=easternParts(new Date(time));if(p.weekday==='Sat'||p.weekday==='Sun')return{regular:false,key:''};const minutes=Number(p.hour)*60+Number(p.minute);return{regular:minutes>=570&&minutes<960,key:`${p.year}-${p.month}-${p.day}`};}
function easternParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
function weekdayIndex(v){return{Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[v]??0;}
function weekKeyFromEasternParts(p){const base=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))),weekday=(base.getUTCDay()+6)%7;base.setUTCDate(base.getUTCDate()-weekday);return base.toISOString().slice(0,10);}
function weekKeyFromUtcTimestamp(time){const d=new Date(time),base=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())),weekday=(base.getUTCDay()+6)%7;base.setUTCDate(base.getUTCDate()-weekday);return base.toISOString().slice(0,10);}
function isSupportedSearchResult(row){const exchange=String(row.exchange||'').toUpperCase(),country=String(row.country||'').toLowerCase(),currency=String(row.currency||'').toUpperCase(),type=String(row.type||'').toLowerCase();const usVenue=US_EXCHANGES.has(exchange)||country==='united states';const supportedType=!type||type.includes('stock')||type.includes('common')||type.includes('etf');return usVenue&&currency==='USD'&&supportedType;}
async function fetchProviderJson(url,label){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);try{const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});if(!response.ok)throw new Error(`${label} HTTP ${response.status}`);return await response.json();}catch(error){if(error?.name==='AbortError')throw new Error(`${label} request timed out.`);throw error;}finally{clearTimeout(timer);}}
