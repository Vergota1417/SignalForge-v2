import { getCandles, searchMarketSymbols, configuredProviders, listUsMarketAssets, dedupeAndSortCandles, minimumHistory, validCandle } from './market-data-gateway.js';
import { parseProviderTime } from './twelve-data-provider.js';

export async function getMarketData(env,symbol,timeframe,forceRefresh=false,options={}){
  try{
    return await getCandles(env,symbol,timeframe,{...options,forceRefresh});
  }catch(error){
    if(!shouldUsePreviewFallback(env,error))throw error;
    return getPreviewProductionMarket(env,symbol,timeframe);
  }
}

export async function searchSymbols(env,query,options={}){
  return searchMarketSymbols(env,query,options);
}

function shouldUsePreviewFallback(env,error){
  const message=String(error?.message||error||'');
  if(!message.includes('No market-data provider is configured.'))return false;
  try{
    const url=new URL(String(env?.VAPID_SUBJECT||''));
    return url.protocol==='https:'&&url.hostname.endsWith('.workers.dev');
  }catch{return false;}
}

async function getPreviewProductionMarket(env,symbol,timeframe){
  const origin=new URL(String(env.VAPID_SUBJECT)).origin;
  const base=`${origin}/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;
  let payload=await fetchPreviewJson(`${base}&cacheOnly=1`,true);
  if(!payload)payload=await fetchPreviewJson(base,false);
  const candles=Array.isArray(payload?.candles)?payload.candles:[];
  if(candles.length<minimumHistory(timeframe))throw new Error(`Preview production fallback returned insufficient history for ${symbol} ${timeframe}.`);
  return{
    candles,
    source:`${payload?.source||'SignalForge production'} · preview proxy`,
    cached:Boolean(payload?.cached),
    fetchedAt:Number(payload?.fetchedAt)||Date.now(),
    previewProxy:true,
    provenance:{mode:'PREVIEW_PROXY',provider:payload?.source||null,providerKey:'production-signalforge',role:'PREVIEW_ONLY',upstreamRequest:!payload?.cached,fallbackFrom:'LOCAL_NO_PROVIDER'}
  };
}

async function fetchPreviewJson(url,allowMiss){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/json','x-sf-preview-proxy':'1'}});
    if(allowMiss&&response.status===404)return null;
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body?.error||`SignalForge production preview proxy HTTP ${response.status}`);
    return body;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('SignalForge production preview proxy timed out.');
    throw error;
  }finally{clearTimeout(timer);}
}

export { configuredProviders, listUsMarketAssets, dedupeAndSortCandles, minimumHistory, parseProviderTime, validCandle };
