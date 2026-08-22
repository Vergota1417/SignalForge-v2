import { getRadarState, listRadarQuotes, putRadarQuote, putRadarState, reserveProviderRequest } from './db.js';
import { CORE_DISCOVERY_SYMBOLS, getDiscoveryPool, getDiscoveryStatus, recordDiscoveryObservation } from './discovery.js';

// Compatibility fallback for synchronous callers. Active Radar and weekly research use
// the persistent async discovery/shortlist functions instead.
export function radarUniverse(env){
  const raw=String(env.RADAR_UNIVERSE||'').trim();
  const pinned=raw?raw.split(',').map(sanitizeSymbol).filter(Boolean):[];
  return [...new Set([...pinned,...CORE_DISCOVERY_SYMBOLS])].slice(0,120);
}

export async function runRadarDiscovery(env,{batchSize=5}={}){
  const universe=await getDiscoveryPool(env,{limit:120});
  if(!universe.length)return{mode:'discovery',scanned:[],leaders:[],cursor:0,universeSize:0};
  const previous=await getRadarState(env),start=(Number(previous?.cursor)||0)%universe.length;
  const count=Math.max(1,Math.min(5,Number(batchSize)||5,universe.length)),symbols=[];
  for(let i=0;i<count;i++)symbols.push(universe[(start+i)%universe.length]);

  const scanned=[];
  for(const symbol of symbols){
    try{
      const quote=await fetchQuote(env,symbol);
      const observation=await recordDiscoveryObservation(env,quote);
      const enriched={...quote,rollingDiscoveryScore:observation?.rollingScore??quote.discoveryScore,scoreVelocity:observation?.scoreVelocity??0,dollarVolume:observation?.dollarVolume??quote.price*quote.volume};
      await putRadarQuote(env,enriched);
      scanned.push(enriched);
    }catch(error){
      console.error(JSON.stringify({event:'radar_quote_error',symbol,message:error?.message||String(error)}));
    }
  }
  const leaders=rankQuotes(await listRadarQuotes(env,14_400_000,40)).slice(0,6);
  const nextCursor=(start+symbols.length)%universe.length;
  const updatedAt=await putRadarState(env,nextCursor,leaders.map(q=>q.symbol));
  return{mode:'discovery',scanned,leaders,cursor:nextCursor,updatedAt,universeSize:universe.length};
}

export async function getRadarSnapshot(env){
  const [state,quotes,status,pool]=await Promise.all([getRadarState(env),listRadarQuotes(env,14_400_000,40),getDiscoveryStatus(env),getDiscoveryPool(env,{limit:120})]);
  const ranked=rankQuotes(quotes),bySymbol=new Map(ranked.map(q=>[q.symbol,q]));
  const leaders=(state?.symbols||[]).map(s=>bySymbol.get(s)).filter(Boolean),fallback=ranked.filter(q=>!leaders.some(x=>x.symbol===q.symbol));
  return{symbols:[...leaders,...fallback].slice(0,6),updatedAt:state?.updatedAt||0,cursor:state?.cursor||0,universeSize:pool.length,catalogSize:status.catalogSize,scannedSymbols:status.scannedSymbols,catalogUpdatedAt:status.catalogUpdatedAt};
}

export async function getRadarSymbols(env){const snapshot=await getRadarSnapshot(env);return snapshot.symbols.map(x=>x.symbol).filter(Boolean);}

async function fetchQuote(env,symbol){
  if(!env.TWELVE_DATA_API_KEY)throw new Error('Twelve Data API key is not configured.');
  await reserveProviderRequest(env);
  const url=new URL('https://api.twelvedata.com/quote');url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
  const response=await fetch(url,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`Twelve Data HTTP ${response.status}`);
  const payload=await response.json();if(payload?.status==='error')throw new Error(`Twelve Data: ${payload.message||'provider error'}`);
  const price=number(payload.close??payload.price),changePct=number(payload.percent_change),volume=number(payload.volume),averageVolume=number(payload.average_volume??payload.average_volume_10d??payload.average_volume_30d),relativeVolume=averageVolume>0?volume/averageVolume:0;
  const discoveryScore=scoreQuote({price,changePct,volume,averageVolume,relativeVolume});
  return{symbol,name:String(payload.name||symbol),exchange:String(payload.exchange||''),price,changePct,volume,averageVolume,relativeVolume,score:discoveryScore,discoveryScore};
}

export function scoreQuote(q){
  if(!(q.price>=5)||q.volume<=0)return-999;
  const move=q.changePct,moveScore=move>=.5&&move<=8?32-Math.abs(move-3.2)*4:move>0&&move<12?12-Math.abs(move-3.2):-18;
  const rv=Math.min(Math.max(q.relativeVolume,0),4),volumeScore=rv*18,liquidity=Math.min(Math.log10(Math.max(q.volume*q.price,1))*4,32),chasePenalty=move>8?(move-8)*7:0;
  return Math.round((moveScore+volumeScore+liquidity-chasePenalty)*10)/10;
}

function rankQuotes(quotes){return quotes.filter(q=>Number.isFinite(Number(q.discoveryScore??q.score))&&Number(q.discoveryScore??q.score)>-100).sort((a,b)=>Number(b.rollingDiscoveryScore??b.discoveryScore??b.score)-Number(a.rollingDiscoveryScore??a.discoveryScore??a.score)||Number(b.scoreVelocity||0)-Number(a.scoreVelocity||0));}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
