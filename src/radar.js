import { getRadarState, listRadarQuotes, listSignals, putRadarQuote, putRadarState } from './db.js';
import { CORE_DISCOVERY_SYMBOLS, getDiscoveryPool, getDiscoveryStatus, recordDiscoveryObservation } from './discovery.js';
import { quarantineDiscoverySymbol, isPermanentProviderSymbolError } from './discovery-quarantine.js';
import { buildAnalysisExpectations } from './analysis-expectation.js';
import { recordRadarEvidence } from './evidence.js';
import { getTieredScannerBatch } from './scanner-budget.js';
import { reserveProviderPurpose } from './provider-usage.js';
import { earlyMovementSignal } from './early-movement.js';
import { unifiedActionState } from './unified-action.js';
import { recordOperation } from './operations.js';

const PERMANENT_PROVIDER_RETIRE_MS=10*365*86_400_000;

export function radarUniverse(env){const raw=String(env.RADAR_UNIVERSE||'').trim(),pinned=raw?raw.split(',').map(sanitizeSymbol).filter(Boolean):[];return[...new Set([...pinned,...CORE_DISCOVERY_SYMBOLS])].slice(0,120);}

export async function runRadarDiscovery(env,{batchSize=6,now=Date.now()}={}){
  try{
    await hardenPreviousProviderRejects(env,now);
    const previous=await getRadarState(env),batch=await getTieredScannerBatch(env,{limit:batchSize,exploreCursor:Number(previous?.cursor)||0,now});
    if(!batch.symbols.length){const result={mode:'discovery',scanned:[],leaders:[],cursor:batch.nextExploreCursor,universeSize:batch.universeSize,tiers:batch.tiers,selected:batch.selected,cooldownCount:batch.cooldownCount||0};await recordOperation(env,'radar-scan',{status:'IDLE',at:now,detail:{reason:'no-due-symbols',universeSize:batch.universeSize,cooldownCount:batch.cooldownCount||0}});return result;}
    const scanned=[],errors=[],retired=[];
    for(const symbol of batch.symbols){
      try{
        const quote=await fetchQuote(env,symbol),observation=await recordDiscoveryObservation(env,quote,{now}),enriched={...quote,scannerTier:tierFor(symbol,batch.selected),rollingDiscoveryScore:observation?.rollingScore??quote.discoveryScore,scoreVelocity:observation?.scoreVelocity??0,dollarVolume:observation?.dollarVolume??quote.price*quote.volume};
        enriched.earlyMovement=earlyMovementSignal(enriched);await putRadarQuote(env,enriched);await recordRadarEvidence(env,enriched,{source:'scheduled-radar',now});scanned.push(enriched);
      }catch(error){
        if(isPermanentProviderSymbolError(error)){
          const quarantine=await quarantineDiscoverySymbol(env,symbol,{now,cooldownMs:PERMANENT_PROVIDER_RETIRE_MS,reason:'twelve-data-symbol-permanently-rejected'}).catch(()=>null);
          const row={symbol,status:Number(error?.status)||null,message:error?.message||String(error),retired:Boolean(quarantine),cooldownUntil:quarantine?.cooldownUntil||null};retired.push(row);console.warn(JSON.stringify({event:'radar_symbol_retired',...row}));continue;
        }
        const row={symbol,status:Number(error?.status)||null,message:error?.message||String(error)};errors.push(row);console.error(JSON.stringify({event:'radar_quote_error',...row}));
      }
    }
    const leaders=rankQuotes(await listRadarQuotes(env,14_400_000,40)).slice(0,6),updatedAt=await putRadarState(env,batch.nextExploreCursor,leaders.map(q=>q.symbol)),result={mode:'discovery',scanned,leaders,cursor:batch.nextExploreCursor,updatedAt,universeSize:batch.universeSize,tiers:batch.tiers,selected:batch.selected,cooldownCount:batch.cooldownCount||0,retired};
    await recordOperation(env,'radar-scan',{status:scanned.length||retired.length?'OK':errors.length?'ERROR':'IDLE',at:now,detail:{requested:batch.symbols,scanned:scanned.map(x=>x.symbol),leaders:leaders.map(x=>x.symbol),retired,errors,cooldownCount:batch.cooldownCount||0}});return result;
  }catch(error){await recordOperation(env,'radar-scan',{status:'ERROR',at:now,detail:{message:error?.message||String(error)}}).catch(()=>{});throw error;}
}

export async function getRadarSnapshot(env){
  const pool=await getDiscoveryPool(env,{limit:120});
  const[state,quotes,status,signals]=await Promise.all([getRadarState(env),listRadarQuotes(env,14_400_000,40),getDiscoveryStatus(env),listSignals(env)]),ranked=rankQuotes(quotes),bySymbol=new Map(ranked.map(q=>[q.symbol,q])),signalMap=new Map((signals||[]).map(s=>[s.symbol,s])),leaders=(state?.symbols||[]).map(s=>bySymbol.get(s)).filter(Boolean),fallback=ranked.filter(q=>!leaders.some(x=>x.symbol===q.symbol)),symbols=[...leaders,...fallback].slice(0,6);
  const expectations=await buildAnalysisExpectations(env,{symbols:symbols.map(x=>x.symbol),pool,cursor:state?.cursor||0,now:Date.now()});
  return{symbols:symbols.map(row=>{const earlyMovement=earlyMovementSignal(row),signal=signalMap.get(row.symbol)||null;return{...row,earlyMovement,unifiedAction:unifiedActionState({signal,earlyMovement}),expectation:expectations[row.symbol]||null};}),updatedAt:state?.updatedAt||0,cursor:state?.cursor||0,universeSize:pool.length,catalogSize:status.catalogSize,scannedSymbols:status.scannedSymbols,catalogUpdatedAt:status.catalogUpdatedAt,marketTimezone:'America/New_York'};
}
export async function getRadarSymbols(env){const snapshot=await getRadarSnapshot(env);return snapshot.symbols.map(x=>x.symbol).filter(Boolean);}

async function hardenPreviousProviderRejects(env,now){
  if(!env?.DB)return;
  try{
    const row=await env.DB.prepare(`SELECT detail_json AS detailJson FROM operation_status WHERE operation_key='radar-scan'`).first();if(!row?.detailJson)return;
    const detail=JSON.parse(row.detailJson||'{}'),candidates=[...(Array.isArray(detail.errors)?detail.errors:[]),...(Array.isArray(detail.retired)?detail.retired:[])];
    for(const item of candidates){if(!item?.symbol)continue;const permanent=Boolean(item.quarantined||item.retired||Number(item.status)===404||String(item.message||'').toLowerCase().includes('symbol'));if(!permanent)continue;await quarantineDiscoverySymbol(env,item.symbol,{now,cooldownMs:PERMANENT_PROVIDER_RETIRE_MS,reason:'provider-reject-hardening'}).catch(()=>{});}
  }catch{}
}

async function fetchQuote(env,symbol){
  if(!env.TWELVE_DATA_API_KEY)throw new Error('Twelve Data API key is not configured.');await reserveProviderPurpose(env,'radar-quote');
  const url=new URL('https://api.twelvedata.com/quote');url.searchParams.set('symbol',symbol);url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok){const error=new Error(`Twelve Data HTTP ${response.status}`);error.status=response.status;throw error;}
  const payload=await response.json();if(payload?.status==='error'){const error=new Error(`Twelve Data: ${payload.message||'provider error'}`);error.status=Number(payload?.code)||0;throw error;}
  const price=number(payload.close??payload.price),changePct=number(payload.percent_change),volume=number(payload.volume),averageVolume=number(payload.average_volume??payload.average_volume_10d??payload.average_volume_30d),relativeVolume=averageVolume>0?volume/averageVolume:0,discoveryScore=scoreQuote({price,changePct,volume,averageVolume,relativeVolume});return{symbol,name:String(payload.name||symbol),exchange:String(payload.exchange||''),price,changePct,volume,averageVolume,relativeVolume,score:discoveryScore,discoveryScore};
}
export function scoreQuote(q){if(!(q.price>=5)||q.volume<=0)return-999;const move=q.changePct,moveScore=move>=.5&&move<=8?32-Math.abs(move-3.2)*4:move>0&&move<12?12-Math.abs(move-3.2):-18,rv=Math.min(Math.max(q.relativeVolume,0),4),volumeScore=rv*18,liquidity=Math.min(Math.log10(Math.max(q.volume*q.price,1))*4,32),chasePenalty=move>8?(move-8)*7:0;return Math.round((moveScore+volumeScore+liquidity-chasePenalty)*10)/10;}
function rankQuotes(quotes){return quotes.filter(q=>Number.isFinite(Number(q.discoveryScore??q.score))&&Number(q.discoveryScore??q.score)>-100).sort((a,b)=>Number(b.rollingDiscoveryScore??b.discoveryScore??b.score)-Number(a.rollingDiscoveryScore??a.discoveryScore??a.score)||Number(b.scoreVelocity||0)-Number(a.scoreVelocity||0));}
function tierFor(symbol,selected){if(selected.hot.includes(symbol))return'HOT';if(selected.active.includes(symbol))return'ACTIVE';return'EXPLORE';}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase();return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
