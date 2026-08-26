import { TIMEFRAMES } from './constants.js';
import { getCachedMarket, putCachedMarket, getCachedSymbolSearch, putCachedSymbolSearch } from './db.js';
import { getMarketData as getTwelveDataMarketData, searchSymbols as searchTwelveDataSymbols } from './twelve-data-provider.js';

const DEFAULT_PROVIDER='auto';
const ASSET_CACHE_TTL_MS=6*60*60*1000;
let alpacaAssetCache={fetchedAt:0,rows:[]};

export async function getCandles(env,symbol,timeframe,options={}){
  const cfg=TIMEFRAMES[timeframe];if(!cfg)throw new Error('Unsupported timeframe.');
  const forceRefresh=Boolean(options.forceRefresh),completedOnly=Boolean(options.completedOnly);
  if(!forceRefresh){
    const cached=await getCachedMarket(env,symbol,timeframe,cfg.cacheSeconds*1000);
    if(cached){
      const candles=completedOnly?removeIncompleteHigherTimeframeBar(cached.candles,timeframe,Date.now()):cached.candles;
      validateMinimumHistory(candles,timeframe);
      return{...cached,candles,quality:qualitySummary({rawBars:cached.candles.length,acceptedBars:candles.length,formingBarsRemoved:cached.candles.length-candles.length,historyRequired:minimumHistory(timeframe),cacheDerived:true})};
    }
  }

  const provider=normalizeProvider(options.provider||env.MARKET_DATA_PROVIDER||DEFAULT_PROVIDER),ordered=providerOrder(provider,env);let lastError=null;
  if(!ordered.length)throw new Error('No market-data provider is configured.');
  for(const candidate of ordered){
    try{
      if(candidate==='alpaca')return await getAlpacaCandles(env,symbol,timeframe,{...options,completedOnly});
      if(candidate==='twelve-data')return await getTwelveDataMarketData(env,symbol,timeframe,forceRefresh,{...options,completedOnly});
    }catch(error){lastError=error;if(provider!=='auto')throw error;}
  }
  throw lastError||new Error('No configured market-data provider could return candle data.');
}

export async function searchMarketSymbols(env,query,options={}){
  const normalized=String(query||'').trim().replace(/\s+/g,' ').slice(0,80);if(!normalized)return{results:[],cached:true,fetchedAt:Date.now()};
  const cacheKey=`GATEWAY:${normalized.toUpperCase()}`,cached=await getCachedSymbolSearch(env,cacheKey,86_400_000);if(cached)return cached;
  const provider=normalizeProvider(options.provider||env.MARKET_DATA_PROVIDER||DEFAULT_PROVIDER);let result;
  if(provider==='twelve-data')result=await searchTwelveDataSymbols(env,normalized);
  else if(provider==='alpaca')result=await searchAlpacaAssets(env,normalized);
  else if(configuredProviders(env).alpaca){try{result=await searchAlpacaAssets(env,normalized);}catch{result=await searchTwelveDataSymbols(env,normalized);}}
  else result=await searchTwelveDataSymbols(env,normalized);
  const results=Array.isArray(result?.results)?result.results:[];const fetchedAt=await putCachedSymbolSearch(env,cacheKey,results);return{...result,results,cached:false,fetchedAt};
}

export async function listUsMarketAssets(env,{force=false}={}){
  if(configuredProviders(env).alpaca){
    const rows=await getAlpacaAssets(env,{force});
    return rows.filter(isEligibleAlpacaAsset).map(a=>({symbol:String(a.symbol).toUpperCase(),name:String(a.name||a.symbol),exchange:String(a.exchange||''),country:'United States',securityType:assetSecurityType(a),source:'alpaca'}));
  }
  return[];
}

export function configuredProviders(env){return{alpaca:Boolean(env.ALPACA_API_KEY_ID&&env.ALPACA_API_SECRET_KEY),twelveData:Boolean(env.TWELVE_DATA_API_KEY),preferred:normalizeProvider(env.MARKET_DATA_PROVIDER||DEFAULT_PROVIDER)};}
export function providerOrder(provider,env){if(provider!=='auto')return[provider];const order=[];if(env.ALPACA_API_KEY_ID&&env.ALPACA_API_SECRET_KEY)order.push('alpaca');if(env.TWELVE_DATA_API_KEY)order.push('twelve-data');return order;}
export function normalizeProvider(value){const p=String(value||'').trim().toLowerCase();if(['alpaca','twelve-data','auto'].includes(p))return p;if(p==='twelve'||p==='twelvedata')return'twelve-data';return DEFAULT_PROVIDER;}
export function minimumHistory(timeframe){return({'1D':1,'5D':60,'1M':60,'3M':60,'6M':100,'1Y':120,'2Y':80})[timeframe]??60;}

async function getAlpacaCandles(env,symbol,timeframe,options={}){
  assertAlpaca(env);const tf=alpacaTimeframe(timeframe),url=new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
  url.searchParams.set('timeframe',tf.timeframe);url.searchParams.set('limit',String(tf.limit));url.searchParams.set('adjustment','raw');url.searchParams.set('feed',String(options.feed||env.ALPACA_DATA_FEED||'iex'));url.searchParams.set('sort','asc');
  if(tf.startDaysAgo)url.searchParams.set('start',new Date(Date.now()-tf.startDaysAgo*86_400_000).toISOString());
  const payload=await fetchAlpacaJson(env,url),bars=Array.isArray(payload?.bars)?payload.bars:[];if(!bars.length)throw new Error('Alpaca returned no bars.');
  const parsed=bars.map(b=>({time:Date.parse(b.t),open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c),volume:Number(b.v||0)})).filter(validCandle),deduped=dedupeAndSortCandles(parsed);let candles=options.completedOnly?removeIncompleteHigherTimeframeBar(deduped,timeframe,Date.now()):deduped;validateMinimumHistory(candles,timeframe);
  const fetchedAt=await putCachedMarket(env,symbol,timeframe,'Alpaca',deduped);
  return{candles,source:'Alpaca',cached:false,fetchedAt,quality:qualitySummary({rawBars:bars.length,acceptedBars:candles.length,rejectedBars:bars.length-parsed.length,duplicatesRemoved:parsed.length-deduped.length,formingBarsRemoved:deduped.length-candles.length,historyRequired:minimumHistory(timeframe),cacheDerived:false})};
}

async function searchAlpacaAssets(env,query){const q=String(query||'').trim().toUpperCase(),rows=await getAlpacaAssets(env),results=rows.filter(isEligibleAlpacaAsset).filter(a=>!q||String(a.symbol).toUpperCase().includes(q)||String(a.name||'').toUpperCase().includes(q)).slice(0,12).map(a=>({symbol:String(a.symbol).toUpperCase(),name:String(a.name||a.symbol),exchange:String(a.exchange||''),micCode:'',type:assetSecurityType(a),country:'United States',currency:'USD',plan:'alpaca'}));return{results,cached:false,fetchedAt:Date.now(),source:'Alpaca'};}
async function getAlpacaAssets(env,{force=false}={}){assertAlpaca(env);if(!force&&alpacaAssetCache.rows.length&&Date.now()-alpacaAssetCache.fetchedAt<ASSET_CACHE_TTL_MS)return alpacaAssetCache.rows;const payload=await fetchAlpacaJson(env,new URL('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity'));const rows=Array.isArray(payload)?payload:[];alpacaAssetCache={fetchedAt:Date.now(),rows};return rows;}

export function alpacaTimeframe(timeframe){const map={'1D':{timeframe:'5Min',limit:120,startDaysAgo:2},'5D':{timeframe:'15Min',limit:500,startDaysAgo:10},'1M':{timeframe:'1Hour',limit:500,startDaysAgo:45},'3M':{timeframe:'1Day',limit:120,startDaysAgo:150},'6M':{timeframe:'1Day',limit:180,startDaysAgo:260},'1Y':{timeframe:'1Day',limit:260,startDaysAgo:420},'2Y':{timeframe:'1Week',limit:130,startDaysAgo:900}};const cfg=map[timeframe];if(!cfg)throw new Error('Unsupported timeframe.');return{...cfg,minimum:minimumHistory(timeframe)};}
export function validCandle(c){return Number.isFinite(c?.time)&&Number.isFinite(c?.open)&&Number.isFinite(c?.high)&&Number.isFinite(c?.low)&&Number.isFinite(c?.close)&&Number.isFinite(c?.volume)&&c.open>0&&c.high>0&&c.low>0&&c.close>0&&c.volume>=0&&c.high>=c.low&&c.high>=c.open&&c.high>=c.close&&c.low<=c.open&&c.low<=c.close;}
export function dedupeAndSortCandles(candles){const byTime=new Map();for(const candle of candles||[])if(validCandle(candle))byTime.set(Number(candle.time),candle);return[...byTime.values()].sort((a,b)=>a.time-b.time);}
function validateMinimumHistory(candles,timeframe){const required=minimumHistory(timeframe);if((candles||[]).length<required)throw new Error(`Market-data payload failed validation: ${(candles||[]).length}/${required} usable bars for ${timeframe}.`);}
function qualitySummary({rawBars=0,acceptedBars=0,rejectedBars=0,duplicatesRemoved=0,formingBarsRemoved=0,historyRequired=0,cacheDerived=false}={}){return{rawBars,acceptedBars,rejectedBars,duplicatesRemoved,formingBarsRemoved,historyRequired,historyReady:acceptedBars>=historyRequired,cacheDerived};}
function removeIncompleteHigherTimeframeBar(candles,timeframe,now){if(!Array.isArray(candles)||!candles.length||!['3M','6M','1Y','2Y'].includes(timeframe))return candles;const latest=candles[candles.length-1],latestDate=new Date(latest.time),current=new Date(now);if(timeframe==='2Y'){const latestWeek=weekKey(latestDate),currentWeek=weekKey(current),day=current.getUTCDay(),complete=day===0||day===6||day===5&&current.getUTCHours()>=21;return latestWeek===currentWeek&&!complete?candles.slice(0,-1):candles;}const sameUtcDay=latestDate.toISOString().slice(0,10)===current.toISOString().slice(0,10),complete=current.getUTCHours()>=21;return sameUtcDay&&!complete?candles.slice(0,-1):candles;}
function weekKey(date){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())),weekday=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-weekday);return d.toISOString().slice(0,10);}
function isEligibleAlpacaAsset(a){if(!a?.symbol||!a?.tradable)return false;const exchange=String(a.exchange||'').toUpperCase();return['NASDAQ','NYSE','AMEX','ARCA','BATS'].includes(exchange)&&!String(a.symbol).includes('/');}
function assetSecurityType(a){const cls=String(a?.class||a?.asset_class||'').toLowerCase();return cls.includes('us_equity')?'Stock/ETF':'US Equity';}
function assertAlpaca(env){if(!env.ALPACA_API_KEY_ID||!env.ALPACA_API_SECRET_KEY)throw new Error('Alpaca API credentials are not configured.');}
async function fetchAlpacaJson(env,url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);try{const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json','APCA-API-KEY-ID':env.ALPACA_API_KEY_ID,'APCA-API-SECRET-KEY':env.ALPACA_API_SECRET_KEY}});if(!response.ok){const error=new Error(`Alpaca HTTP ${response.status}`);error.status=response.status;throw error;}return await response.json();}catch(error){if(error?.name==='AbortError')throw new Error('Alpaca request timed out.');throw error;}finally{clearTimeout(timer);}}
