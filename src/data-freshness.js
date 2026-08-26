import { TIMEFRAMES } from './constants.js';

const REGULAR_QUOTE_FRESH_MS=2*60*1000;
const EXTENDED_QUOTE_FRESH_MS=5*60*1000;
const CACHE_TAG_VERSION='MP1';

export function normalizeProviderId(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='alpaca'||raw.includes('alpaca'))return'alpaca';
  if(raw==='twelve-data'||raw==='twelve data'||raw.includes('twelve'))return'twelve-data';
  return'unknown';
}

export function providerLabel(provider){const id=normalizeProviderId(provider);return id==='alpaca'?'Alpaca':id==='twelve-data'?'Twelve Data':'Unknown';}

export function cacheSourceTag({provider,feed='unknown',dataTimestamp=0}={}){
  const id=normalizeProviderId(provider),safeFeed=String(feed||'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,32)||'unknown',ts=Math.max(0,Math.round(Number(dataTimestamp)||0));
  return`${CACHE_TAG_VERSION}|${id}|${safeFeed}|${ts}`;
}

export function parseCacheSource(source){
  const raw=String(source||'').trim();
  if(raw.startsWith(`${CACHE_TAG_VERSION}|`)){
    const[,provider,feed,timestamp]=raw.split('|');
    return{provider:normalizeProviderId(provider),providerLabel:providerLabel(provider),feed:String(feed||'unknown'),dataTimestamp:Math.max(0,Number(timestamp)||0),legacy:false};
  }
  const provider=normalizeProviderId(raw);return{provider,providerLabel:providerLabel(provider),feed:'unknown',dataTimestamp:0,legacy:true};
}

export function cachePolicyFor(timeframe,{purpose=''}={}){
  const cfg=TIMEFRAMES[timeframe];if(!cfg)throw new Error('Unsupported timeframe.');
  const ttlMs=Math.max(1,Number(cfg.cacheSeconds)||1)*1000,executionSensitive=isExecutionSensitivePurpose(purpose),staleIfErrorMs=executionSensitive?0:Math.min(6*60*60*1000,Math.max(ttlMs*4,15*60*1000));
  return{ttlMs,staleIfErrorMs,executionSensitive,purpose:String(purpose||'')};
}

export function isExecutionSensitivePurpose(purpose){return/(execution|priority|promotion|trade-plan|portfolio|buy|entry)/i.test(String(purpose||''));}

export function cacheProviderMatches(requestedProvider,source){
  const requested=String(requestedProvider||'auto').toLowerCase();if(requested==='auto')return true;
  return normalizeProviderId(requested)===parseCacheSource(source).provider;
}

export function candleFreshness({fetchedAt=0,dataTimestamp=0,cached=false,ttlMs=0,now=Date.now(),staleFallback=false}={}){
  const cacheAgeMs=ageMs(fetchedAt,now),dataAgeMs=ageMs(dataTimestamp,now),ttl=Math.max(0,Number(ttlMs)||0);
  const state=staleFallback?'STALE':cached?(ttl&&cacheAgeMs>ttl?'STALE':'CACHED'):'FRESH';
  return{state,cached:Boolean(cached),staleFallback:Boolean(staleFallback),fetchedAt:Number(fetchedAt)||0,dataTimestamp:Number(dataTimestamp)||0,cacheAgeMs,dataAgeMs,ttlMs:ttl};
}

export function quoteFreshness({dataTimestamp=0,feed='unknown',now=Date.now()}={}){
  const session=usEquitySession(now),dataAgeMs=ageMs(dataTimestamp,now),normalizedFeed=String(feed||'unknown').toLowerCase();
  if(!Number(dataTimestamp))return{state:'UNKNOWN',session,dataAgeMs:null,dataTimestamp:0};
  if(normalizedFeed==='delayed_sip')return{state:'DELAYED',session,dataAgeMs,dataTimestamp:Number(dataTimestamp)};
  if(session==='CLOSED')return{state:'CLOSED',session,dataAgeMs,dataTimestamp:Number(dataTimestamp)};
  const threshold=session==='REGULAR'?REGULAR_QUOTE_FRESH_MS:EXTENDED_QUOTE_FRESH_MS;
  const state=dataAgeMs<=threshold?'FRESH':dataAgeMs<=threshold*3?'LAGGING':'STALE';
  return{state,session,dataAgeMs,dataTimestamp:Number(dataTimestamp)};
}

export function quoteUsableForDiscovery(meta){const state=String(meta?.state||meta?.freshness?.state||'UNKNOWN').toUpperCase();return state!=='STALE';}

export function usEquitySession(now=Date.now()){
  const p=easternParts(now);if(p.weekday==='Sat'||p.weekday==='Sun')return'CLOSED';const minutes=Number(p.hour)*60+Number(p.minute);
  if(minutes>=570&&minutes<960)return'REGULAR';
  if(minutes>=240&&minutes<570)return'PREMARKET';
  if(minutes>=960&&minutes<1200)return'AFTERHOURS';
  return'CLOSED';
}

export function fallbackDetail(from,reason){return{used:true,from:normalizeProviderId(from),reason:String(reason||'primary provider unavailable').slice(0,180)};}

export function summarizeFeedHealth(rows=[],now=Date.now()){
  const normalized=(rows||[]).filter(Boolean),byProvider={},byFeed={};let latestDataTimestamp=0,stale=0,delayed=0;
  for(const row of normalized){const provider=normalizeProviderId(row.provider||row.source),feed=String(row.feed||'unknown').toLowerCase(),state=String(row.freshness?.state||row.dataFreshness||'UNKNOWN').toUpperCase();byProvider[provider]=(byProvider[provider]||0)+1;byFeed[`${provider}:${feed}`]=(byFeed[`${provider}:${feed}`]||0)+1;latestDataTimestamp=Math.max(latestDataTimestamp,Number(row.dataTimestamp)||0);if(state==='STALE')stale++;if(state==='DELAYED')delayed++;}
  return{sampleSize:normalized.length,byProvider,byFeed,latestDataTimestamp,latestDataAgeMs:latestDataTimestamp?ageMs(latestDataTimestamp,now):null,staleQuotes:stale,delayedQuotes:delayed};
}

function ageMs(timestamp,now){const ts=Number(timestamp)||0;if(!ts)return null;return Math.max(0,(Number(now)||Date.now())-ts);}
function easternParts(now){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Number(now)||Date.now()));return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
