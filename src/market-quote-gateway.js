import { configuredProviders, normalizeProvider } from './market-data-gateway.js';
import { reserveProviderPurpose } from './provider-usage.js';
import { fallbackDetail, quoteFreshness } from './data-freshness.js';

const MAX_BATCH=12;
const HISTORY_DAYS=45;
const RVOL_LOOKBACK=20;

export async function getMarketQuotes(env,symbols,options={}){
  const requested=normalizeSymbols(symbols).slice(0,MAX_BATCH);if(!requested.length)return[];
  const provider=normalizeProvider(options.provider||env.MARKET_DATA_PROVIDER||'auto'),providers=configuredProviders(env);
  if(provider==='alpaca')return getAlpacaQuotes(env,requested,options);
  if(provider==='twelve-data')return getTwelveDataQuotes(env,requested,options);

  let primaryError=null;
  if(providers.alpaca){
    try{
      const alpaca=await getAlpacaQuotes(env,requested,options),bySymbol=new Map(alpaca.map(row=>[row.symbol,row])),missing=requested.filter(symbol=>!bySymbol.has(symbol));
      if(missing.length&&providers.twelveData){for(const row of await getTwelveDataQuotes(env,missing,options))bySymbol.set(row.symbol,{...row,fallback:fallbackDetail('alpaca','primary batch returned no usable quote for this symbol')});}
      return requested.map(symbol=>bySymbol.get(symbol)).filter(Boolean);
    }catch(error){primaryError=error;if(!providers.twelveData)throw error;}
  }
  if(providers.twelveData){const rows=await getTwelveDataQuotes(env,requested,options);return primaryError?rows.map(row=>({...row,fallback:fallbackDetail('alpaca',primaryError?.message||String(primaryError))})):rows;}
  throw new Error('No market quote provider is configured.');
}

export async function getAlpacaQuotes(env,symbols,options={}){
  assertAlpaca(env);const feed=String(options.feed||env.ALPACA_DATA_FEED||'iex').toLowerCase(),symbolCsv=symbols.join(','),now=Number(options.now)||Date.now();
  const snapshotUrl=new URL('https://data.alpaca.markets/v2/stocks/snapshots');snapshotUrl.searchParams.set('symbols',symbolCsv);snapshotUrl.searchParams.set('feed',feed);
  const historyUrl=new URL('https://data.alpaca.markets/v2/stocks/bars');historyUrl.searchParams.set('symbols',symbolCsv);historyUrl.searchParams.set('timeframe','1Day');historyUrl.searchParams.set('start',new Date(now-HISTORY_DAYS*86_400_000).toISOString());historyUrl.searchParams.set('limit',String(Math.max(100,symbols.length*35)));historyUrl.searchParams.set('adjustment','raw');historyUrl.searchParams.set('feed',feed);historyUrl.searchParams.set('sort','asc');
  const[snapshotsPayload,barsPayload]=await Promise.all([fetchAlpacaJson(env,snapshotUrl),fetchAllAlpacaBars(env,historyUrl)]),snapshots=snapshotsPayload?.snapshots&&typeof snapshotsPayload.snapshots==='object'?snapshotsPayload.snapshots:snapshotsPayload,barsBySymbol=barsPayload?.bars||{};
  return symbols.map(symbol=>buildAlpacaQuote(symbol,snapshots?.[symbol],barsBySymbol?.[symbol]||[],{feed,now})).filter(Boolean);
}

export function buildAlpacaQuote(symbol,snapshot,bars=[],{feed='iex',now=Date.now()}={}){
  if(!snapshot)return null;
  const tradePrice=finite(snapshot?.latestTrade?.p),minutePrice=finite(snapshot?.minuteBar?.c),dailyPrice=finite(snapshot?.dailyBar?.c),price=tradePrice||minutePrice||dailyPrice,priceTimestamp=tradePrice?timestampMs(snapshot?.latestTrade?.t):minutePrice?timestampMs(snapshot?.minuteBar?.t):timestampMs(snapshot?.dailyBar?.t),previousClose=finite(snapshot?.prevDailyBar?.c),changePct=price>0&&previousClose>0?(price/previousClose-1)*100:0,currentVolume=Math.max(0,finite(snapshot?.dailyBar?.v));
  const currentDay=isoDay(snapshot?.dailyBar?.t),historical=(Array.isArray(bars)?bars:[]).filter(row=>finite(row?.v)>0&&(!currentDay||isoDay(row?.t)!==currentDay)).slice(-RVOL_LOOKBACK),averageVolume=historical.length?historical.reduce((sum,row)=>sum+finite(row.v),0)/historical.length:0,relativeVolume=averageVolume>0?currentVolume/averageVolume:0;
  if(!(price>0))return null;
  const freshness=quoteFreshness({dataTimestamp:priceTimestamp,feed,now});
  return{symbol:String(symbol).toUpperCase(),name:String(symbol).toUpperCase(),exchange:'',price,changePct,volume:currentVolume,averageVolume,relativeVolume,source:'Alpaca',provider:'alpaca',feed,dataTimestamp:priceTimestamp,dataAgeMs:freshness.dataAgeMs,freshness};
}

async function getTwelveDataQuotes(env,symbols,options={}){
  if(!env.TWELVE_DATA_API_KEY)throw new Error('Twelve Data API key is not configured.');const rows=[],now=Number(options.now)||Date.now();
  for(const symbol of symbols){
    await reserveProviderPurpose(env,'radar-quote');const url=new URL('https://api.twelvedata.com/quote');url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);const response=await fetch(url,{headers:{accept:'application/json'}});
    if(!response.ok){const error=new Error(`Twelve Data HTTP ${response.status}`);error.status=response.status;throw error;}
    const payload=await response.json();if(payload?.status==='error'){const error=new Error(`Twelve Data: ${payload.message||'provider error'}`);error.status=Number(payload?.code)||0;throw error;}
    const price=finite(payload.close??payload.price),changePct=finite(payload.percent_change),volume=finite(payload.volume),averageVolume=finite(payload.average_volume??payload.average_volume_10d??payload.average_volume_30d),relativeVolume=averageVolume>0?volume/averageVolume:0,dataTimestamp=epochMs(payload.timestamp),feed='quote',freshness=quoteFreshness({dataTimestamp,feed,now});if(price>0)rows.push({symbol,name:String(payload.name||symbol),exchange:String(payload.exchange||''),price,changePct,volume,averageVolume,relativeVolume,source:'Twelve Data',provider:'twelve-data',feed,dataTimestamp,dataAgeMs:freshness.dataAgeMs,freshness});
  }
  return rows;
}

async function fetchAllAlpacaBars(env,url){
  const merged={bars:{}},working=new URL(url);let pageToken='';
  for(let page=0;page<4;page++){
    if(pageToken)working.searchParams.set('page_token',pageToken);else working.searchParams.delete('page_token');
    const payload=await fetchAlpacaJson(env,working);for(const[symbol,bars]of Object.entries(payload?.bars||{}))merged.bars[symbol]=[...(merged.bars[symbol]||[]),...(Array.isArray(bars)?bars:[])];pageToken=String(payload?.next_page_token||'');if(!pageToken)break;
  }
  return merged;
}
function normalizeSymbols(values){return[...new Set((Array.isArray(values)?values:[]).map(v=>String(v||'').trim().toUpperCase()).filter(v=>/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(v)))];}
function isoDay(value){const time=Date.parse(String(value||''));return Number.isFinite(time)?new Date(time).toISOString().slice(0,10):'';}
function timestampMs(value){const time=Date.parse(String(value||''));return Number.isFinite(time)?time:0;}
function epochMs(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)return 0;return n>10_000_000_000?Math.round(n):Math.round(n*1000);}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function assertAlpaca(env){if(!env.ALPACA_API_KEY_ID||!env.ALPACA_API_SECRET_KEY)throw new Error('Alpaca API credentials are not configured.');}
async function fetchAlpacaJson(env,url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);try{const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json','APCA-API-KEY-ID':env.ALPACA_API_KEY_ID,'APCA-API-SECRET-KEY':env.ALPACA_API_SECRET_KEY}});if(!response.ok){const error=new Error(`Alpaca HTTP ${response.status}`);error.status=response.status;throw error;}return await response.json();}catch(error){if(error?.name==='AbortError')throw new Error('Alpaca request timed out.');throw error;}finally{clearTimeout(timer);}}
