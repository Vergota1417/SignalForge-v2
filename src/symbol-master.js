import { getCachedMarket, getSignalAnalysis } from './db.js';
import { getMarketData } from './market.js';
import { analyze, assessIntradayConfirmation } from './analysis.js';
import { assessAuctionContext } from './auction-context.js';
import { assessSessionRange } from './session-range.js';
import { evaluateStrategy } from './strategy.js';
import { buildTradePlan } from './trade-plan.js';
import { TIMEFRAMES } from './constants.js';

export const SYMBOL_MASTER_VERSION='symbol-master-v1';
const masterSchemaReadyByDb=new WeakMap();
const LONG_CACHE_READ_MS=30*86_400_000;

export async function ensureSymbolMasterSchema(env){
  if(!env.DB)throw new Error('D1 binding DB is not configured.');
  let ready=masterSchemaReadyByDb.get(env.DB);
  if(!ready){
    ready=env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS symbol_master_state (symbol TEXT PRIMARY KEY, timeframe TEXT NOT NULL, status TEXT NOT NULL, readiness INTEGER NOT NULL DEFAULT 0, last_pull_at INTEGER NOT NULL DEFAULT 0, calculated_at INTEGER NOT NULL DEFAULT 0, snapshot_json TEXT NOT NULL, updated_at INTEGER NOT NULL)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_symbol_master_updated ON symbol_master_state(updated_at DESC)`)
    ]).catch(error=>{masterSchemaReadyByDb.delete(env.DB);throw error;});
    masterSchemaReadyByDb.set(env.DB,ready);
  }
  return ready;
}

export async function getStoredSymbolMaster(env,symbol){
  await ensureSymbolMasterSchema(env);
  const row=await env.DB.prepare(`SELECT symbol,timeframe,status,readiness,last_pull_at AS lastPullAt,calculated_at AS calculatedAt,snapshot_json AS snapshotJson,updated_at AS updatedAt FROM symbol_master_state WHERE symbol=?`).bind(symbol).first();
  if(!row)return null;
  try{return {...JSON.parse(row.snapshotJson),symbol:row.symbol,timeframe:row.timeframe,status:row.status,readiness:Number(row.readiness)||0,lastPullAt:Number(row.lastPullAt)||0,calculatedAt:Number(row.calculatedAt)||0,updatedAt:Number(row.updatedAt)||0};}catch{return null;}
}

export async function listStoredSymbolMasters(env,{limit=50}={}){
  await ensureSymbolMasterSchema(env);
  const n=Math.max(1,Math.min(250,Math.round(Number(limit)||50)));
  const rows=await env.DB.prepare(`SELECT symbol,timeframe,status,readiness,last_pull_at AS lastPullAt,calculated_at AS calculatedAt,snapshot_json AS snapshotJson,updated_at AS updatedAt FROM symbol_master_state ORDER BY updated_at DESC LIMIT ?`).bind(n).all();
  return (rows.results||[]).map(row=>{try{return {...JSON.parse(row.snapshotJson),symbol:row.symbol,timeframe:row.timeframe,status:row.status,readiness:Number(row.readiness)||0,lastPullAt:Number(row.lastPullAt)||0,calculatedAt:Number(row.calculatedAt)||0,updatedAt:Number(row.updatedAt)||0};}catch{return null;}}).filter(Boolean);
}

export async function buildSymbolMaster(env,symbol,{timeframe='6M',allowProvider=true,forceRefresh=false,includeCandles=true}={}){
  await ensureSymbolMasterSchema(env);
  const tf=normalizeTimeframe(timeframe),now=Date.now();
  const primary=await loadDataset(env,{symbol,timeframe:tf,allowProvider,forceRefresh,purpose:'symbol-master-primary'});
  if(!primary?.candles?.length)throw new Error(`Symbol Master has no ${tf} market data for ${symbol}.`);

  const execution=tf==='5D'?primary:await loadDataset(env,{symbol,timeframe:'5D',allowProvider,forceRefresh:false,purpose:'symbol-master-execution'}).catch(()=>null);
  let benchmark=null;
  if(symbol!=='SPY'&&['6M','1Y'].includes(tf))benchmark=await loadDataset(env,{symbol:'SPY',timeframe:tf,allowProvider,forceRefresh:false,purpose:'symbol-master-benchmark'}).catch(()=>null);

  const analysis=analyze(primary.candles,symbol,{benchmarkCandles:benchmark?.candles||null});
  const strategy=evaluateStrategy(analysis,null);
  const executionCandles=execution?.candles||[];
  const auction=executionCandles.length?assessAuctionContext(executionCandles,{symbol,currentPrice:executionCandles.at(-1)?.close}):null;
  const confirmation=executionCandles.length?assessIntradayConfirmation(executionCandles):null;
  const currentPrice=Number(confirmation?.latestPrice)||Number(executionCandles.at(-1)?.close)||Number(primary.candles.at(-1)?.close)||null;
  const roomToRun=executionCandles.length?assessSessionRange(executionCandles,{atr:analysis?.atr,currentPrice}):null;
  const tradePlan=buildTradePlan(analysis);
  const savedSignal=await getSignalAnalysis(env,symbol).catch(()=>null);
  const radar=await getRadarRow(env,symbol).catch(()=>null);
  const market={
    primary:datasetView(primary,{includeCandles}),
    execution:execution?datasetView(execution,{includeCandles}):null,
    benchmark:benchmark?datasetView(benchmark,{includeCandles}):null
  };
  const datasets=[primary,execution,benchmark].filter(Boolean),lastPullAt=Math.max(0,...datasets.map(row=>Number(row.fetchedAt)||0));
  const upstream=datasets.filter(row=>row?.provenance?.upstreamRequest).map(row=>({symbol:row.symbol,timeframe:row.timeframe,provider:row.provenance?.provider||row.source||'',role:row.provenance?.role||''}));
  const blocks={
    marketData:blockState(Boolean(primary?.candles?.length),'RAW_MASTER',primary?.fetchedAt),
    chart:blockState(Boolean(primary?.candles?.length),'RAW_MASTER',primary?.fetchedAt),
    validation:blockState(Boolean(analysis),'SYMBOL_MASTER',now),
    finalDecision:blockState(Boolean(analysis?.status),'SYMBOL_MASTER',now),
    auction:blockState(Boolean(auction),'SYMBOL_MASTER',now),
    execution:blockState(Boolean(confirmation||roomToRun),'SYMBOL_MASTER',now),
    volume:blockState(Boolean(executionCandles.length),'RAW_MASTER',execution?.fetchedAt||0),
    tradePlan:blockState(Boolean(tradePlan),'SYMBOL_MASTER',now),
    discovery:blockState(Boolean(radar),'RADAR_CACHE',radar?.updatedAt||0)
  };
  const required=['marketData','validation','finalDecision','auction','execution','volume'],readyCount=required.filter(key=>blocks[key]?.ready).length;
  const snapshot={
    masterVersion:SYMBOL_MASTER_VERSION,
    snapshotId:`SF-MASTER-${symbol}-${now}`,
    symbol,timeframe:tf,generatedAt:now,lastPullAt,lastCalculationAt:now,
    pull:{owner:'SYMBOL_MASTER',lastPullAt,upstreamRequests:upstream,upstreamRequestCount:upstream.length,cacheHitCount:datasets.length-upstream.length,providers:[...new Set(datasets.map(row=>row?.source).filter(Boolean))]},
    market,
    derived:{analysis,strategy,auction,execution:{confirmation,roomToRun,openingStructure:roomToRun?.openingRangeShadow||null},tradePlan,radar,savedSignal:savedSignal?{updatedAt:savedSignal.updatedAt,status:savedSignal.analysis?.status||null,readiness:savedSignal.analysis?.readiness??null}:null},
    status:{final:analysis?.status||'NOT ANALYZED',readiness:Number(analysis?.readiness)||0,reason:String(analysis?.reason||''),latestPrice:Number(analysis?.latest?.close)||currentPrice||null},
    blocks,
    health:{requiredBlocks:required.length,readyBlocks:readyCount,complete:readyCount===required.length,missingBlocks:required.filter(key=>!blocks[key]?.ready),allBlocksSameSnapshot:true,rawDataOwner:'market_cache',calculationOwner:'symbol_master_state'}
  };
  await persistSummary(env,snapshot);
  return snapshot;
}

export async function buildSymbolMasterFromCache(env,symbol,{timeframe='6M',includeCandles=true}={}){
  return buildSymbolMaster(env,symbol,{timeframe,allowProvider:false,forceRefresh:false,includeCandles});
}

async function loadDataset(env,{symbol,timeframe,allowProvider,forceRefresh,purpose}){
  let row;
  if(allowProvider)row=await getMarketData(env,symbol,timeframe,forceRefresh,{completedOnly:false,purpose});
  else row=await getCachedMarket(env,symbol,timeframe,LONG_CACHE_READ_MS);
  if(!row)return null;
  return {...row,symbol,timeframe};
}

function datasetView(row,{includeCandles=true}={}){
  const candles=Array.isArray(row?.candles)?row.candles:[],latest=candles.at(-1)||null;
  return{symbol:row.symbol,timeframe:row.timeframe,source:row.source||'',cached:Boolean(row.cached),fetchedAt:Number(row.fetchedAt)||0,ageMs:Math.max(0,Date.now()-(Number(row.fetchedAt)||0)),bars:candles.length,latest:latest?{time:latest.time,open:latest.open,high:latest.high,low:latest.low,close:latest.close,volume:latest.volume}:null,quality:row.quality||null,provenance:row.provenance||{mode:'CACHE',provider:row.source||null,role:'CACHE',upstreamRequest:false,fallbackFrom:null},...(includeCandles?{candles}:{})};
}

function blockState(ready,source,updatedAt){return{ready:Boolean(ready),state:ready?'READY':'MISSING',source,updatedAt:Number(updatedAt)||0};}

async function getRadarRow(env,symbol){
  const row=await env.DB.prepare(`SELECT payload,updated_at AS updatedAt FROM radar_quotes WHERE symbol=?`).bind(symbol).first();
  if(!row?.payload)return null;
  try{return {...JSON.parse(row.payload),updatedAt:Number(row.updatedAt)||0};}catch{return null;}
}

async function persistSummary(env,snapshot){
  const now=Date.now(),summary=stripCandles(snapshot);
  await env.DB.prepare(`INSERT INTO symbol_master_state(symbol,timeframe,status,readiness,last_pull_at,calculated_at,snapshot_json,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET timeframe=excluded.timeframe,status=excluded.status,readiness=excluded.readiness,last_pull_at=excluded.last_pull_at,calculated_at=excluded.calculated_at,snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at`).bind(snapshot.symbol,snapshot.timeframe,snapshot.status.final,snapshot.status.readiness,snapshot.lastPullAt,snapshot.lastCalculationAt,JSON.stringify(summary),now).run();
}

function stripCandles(snapshot){
  const clone=JSON.parse(JSON.stringify(snapshot));
  for(const key of ['primary','execution','benchmark'])if(clone.market?.[key])delete clone.market[key].candles;
  return clone;
}

function normalizeTimeframe(value){const tf=String(value||'6M').toUpperCase();return TIMEFRAMES[tf]?tf:'6M';}
