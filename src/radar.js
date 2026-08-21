import { getRadarState, listRadarQuotes, putRadarQuote, putRadarState, reserveProviderRequest } from './db.js';

const DEFAULT_RADAR_UNIVERSE=[
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','AVGO','TSLA','AMD','NFLX','CRM','ORCL','ADBE','QCOM','INTC','MU','AMAT','ARM','PLTR','CRWD',
  'JPM','BAC','GS','V','MA','XOM','CVX','COP','LLY','UNH','COST','WMT','HD','CAT','GE','UBER','DIS','KO','PEP','BA'
];

export function radarUniverse(env){
  const raw=String(env.RADAR_UNIVERSE||'').trim();
  const source=raw?raw.split(','):DEFAULT_RADAR_UNIVERSE;
  return [...new Set(source.map(sanitizeSymbol).filter(Boolean))].slice(0,120);
}

export async function runRadarDiscovery(env,{batchSize=7}={}){
  const universe=radarUniverse(env);
  if(!universe.length) return {mode:'discovery',scanned:[],leaders:[],cursor:0};
  const previous=await getRadarState(env);
  const start=previous.cursor%universe.length;
  const symbols=[];
  for(let i=0;i<Math.min(batchSize,universe.length);i++) symbols.push(universe[(start+i)%universe.length]);
  const scanned=[];
  for(const symbol of symbols){
    try{
      const quote=await fetchQuote(env,symbol);
      await putRadarQuote(env,quote);
      scanned.push(quote);
    }catch(error){
      console.error(JSON.stringify({event:'radar_quote_error',symbol,message:error?.message||String(error)}));
    }
  }
  const leaders=rankQuotes(await listRadarQuotes(env,14_400_000,30)).slice(0,6);
  const nextCursor=(start+symbols.length)%universe.length;
  const updatedAt=await putRadarState(env,nextCursor,leaders.map(q=>q.symbol));
  return {mode:'discovery',scanned,leaders,cursor:nextCursor,updatedAt,universeSize:universe.length};
}

export async function getRadarSnapshot(env){
  const state=await getRadarState(env);
  const quotes=rankQuotes(await listRadarQuotes(env,14_400_000,30));
  const bySymbol=new Map(quotes.map(q=>[q.symbol,q]));
  const leaders=(state.symbols||[]).map(s=>bySymbol.get(s)).filter(Boolean);
  const fallback=quotes.filter(q=>!leaders.some(x=>x.symbol===q.symbol));
  return {symbols:[...leaders,...fallback].slice(0,6),updatedAt:state.updatedAt,cursor:state.cursor,universeSize:radarUniverse(env).length};
}

export async function getRadarSymbols(env){
  const snapshot=await getRadarSnapshot(env);
  return snapshot.symbols.map(x=>x.symbol).filter(Boolean);
}

async function fetchQuote(env,symbol){
  if(!env.TWELVE_DATA_API_KEY) throw new Error('Twelve Data API key is not configured.');
  await reserveProviderRequest(env);
  const url=new URL('https://api.twelvedata.com/quote');
  url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok) throw new Error(`Twelve Data HTTP ${response.status}`);
  const payload=await response.json();
  if(payload?.status==='error') throw new Error(`Twelve Data: ${payload.message||'provider error'}`);
  const price=number(payload.close??payload.price);
  const changePct=normalizePercent(payload.percent_change);
  const volume=number(payload.volume);
  const averageVolume=number(payload.average_volume??payload.average_volume_10d??payload.average_volume_30d);
  const relativeVolume=averageVolume>0?volume/averageVolume:0;
  const score=scoreQuote({price,changePct,volume,averageVolume,relativeVolume});
  return {symbol,name:String(payload.name||symbol),exchange:String(payload.exchange||''),price,changePct,volume,averageVolume,relativeVolume,score};
}

function scoreQuote(q){
  if(!(q.price>=5) || q.volume<=0) return -999;
  const move=q.changePct;
  const moveScore=move>=0.5&&move<=8?32-Math.abs(move-3.2)*4:move>0&&move<12?12-Math.abs(move-3.2): -18;
  const rv=Math.min(Math.max(q.relativeVolume,0),4);
  const volumeScore=rv*18;
  const liquidity=Math.min(Math.log10(Math.max(q.volume*q.price,1))*4,32);
  const chasePenalty=move>8?(move-8)*7:0;
  return Math.round((moveScore+volumeScore+liquidity-chasePenalty)*10)/10;
}

function rankQuotes(quotes){return quotes.filter(q=>Number.isFinite(q.score)&&q.score>-100).sort((a,b)=>b.score-a.score);}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function normalizePercent(v){const n=number(v);return Math.abs(n)<=1?n*100:n;}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
