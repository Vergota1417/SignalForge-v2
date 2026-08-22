import { reserveProviderRequest } from './db.js';

export const CORE_DISCOVERY_SYMBOLS=[
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','AVGO','TSLA','AMD','NFLX','CRM','ORCL','ADBE','QCOM','INTC','MU','AMAT','ARM','PLTR','CRWD',
  'JPM','BAC','GS','V','MA','XOM','CVX','COP','LLY','UNH','COST','WMT','HD','CAT','GE','UBER','DIS','KO','PEP','BA'
];

const CATALOG_TTL=86_400_000;
const DEFAULT_DISCOVERY_SIZE=120;
const DEFAULT_WEEKLY_SIZE=42;
const WEAK_COOLDOWN_MS=30*86_400_000;

export async function ensureDiscoverySchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_catalog (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      exchange TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      security_type TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'twelve-data',
      eligible INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_stats (
      symbol TEXT PRIMARY KEY,
      last_scanned INTEGER NOT NULL DEFAULT 0,
      scan_count INTEGER NOT NULL DEFAULT 0,
      current_score REAL NOT NULL DEFAULT 0,
      previous_score REAL NOT NULL DEFAULT 0,
      rolling_score REAL NOT NULL DEFAULT 0,
      score_velocity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      dollar_volume REAL NOT NULL DEFAULT 0,
      relative_volume REAL NOT NULL DEFAULT 0,
      cooldown_until INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_meta (
      id INTEGER PRIMARY KEY CHECK(id=1),
      catalog_updated_at INTEGER NOT NULL DEFAULT 0,
      exploration_cursor INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`)
  ]);
}

export async function refreshDiscoveryCatalog(env,{force=false}={}){
  await ensureDiscoverySchema(env);
  const meta=await getDiscoveryMeta(env),now=Date.now();
  if(!force&&meta.catalogUpdatedAt>0&&now-meta.catalogUpdatedAt<CATALOG_TTL){
    return{refreshed:false,catalogSize:await catalogCount(env),updatedAt:meta.catalogUpdatedAt};
  }
  if(!env.TWELVE_DATA_API_KEY)return seedCoreCatalog(env,false);

  try{
    await reserveProviderRequest(env);
    const url=new URL('https://api.twelvedata.com/stocks');
    url.searchParams.set('country','United States');
    url.searchParams.set('type','Common Stock');
    url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
    const response=await fetch(url,{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error(`Twelve Data HTTP ${response.status}`);
    const payload=await response.json();
    if(payload?.status==='error')throw new Error(`Twelve Data: ${payload.message||'provider error'}`);
    const rows=Array.isArray(payload?.data)?payload.data:[];
    const eligible=rows.filter(item=>isEligibleUsCommonStock(item)).map(item=>({
      symbol:sanitizeSymbol(item.symbol),name:String(item.name||''),exchange:String(item.exchange||''),country:String(item.country||'United States'),securityType:String(item.type||'Common Stock')
    })).filter(row=>row.symbol);
    if(!eligible.length)throw new Error('Stock catalog returned no eligible U.S. common stocks.');

    for(let i=0;i<eligible.length;i+=75){
      const batch=eligible.slice(i,i+75).map(row=>env.DB.prepare(`INSERT INTO discovery_catalog(symbol,name,exchange,country,security_type,source,eligible,updated_at)
        VALUES(?,?,?,?,?,'twelve-data',1,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name,exchange=excluded.exchange,country=excluded.country,security_type=excluded.security_type,source=excluded.source,eligible=1,updated_at=excluded.updated_at`)
        .bind(row.symbol,row.name,row.exchange,row.country,row.securityType,now));
      if(batch.length)await env.DB.batch(batch);
    }
    await seedCoreCatalog(env,true);
    await putDiscoveryMeta(env,{...meta,catalogUpdatedAt:now});
    return{refreshed:true,catalogSize:await catalogCount(env),updatedAt:now};
  }catch(error){
    console.error(JSON.stringify({event:'discovery_catalog_error',message:error?.message||String(error)}));
    const seeded=await seedCoreCatalog(env,false);
    return{...seeded,error:error?.message||String(error)};
  }
}

export async function getDiscoveryPool(env,{limit=DEFAULT_DISCOVERY_SIZE,now=Date.now()}={}){
  await ensureDiscoverySchema(env);
  await refreshDiscoveryCatalog(env);
  const capped=Math.max(20,Math.min(200,Number(limit)||DEFAULT_DISCOVERY_SIZE));
  const pinned=envSymbols(env);
  const core=CORE_DISCOVERY_SYMBOLS;
  const promisingRows=await env.DB.prepare(`SELECT symbol,rolling_score AS rollingScore,score_velocity AS scoreVelocity,last_scanned AS lastScanned,cooldown_until AS cooldownUntil
    FROM discovery_stats WHERE cooldown_until<=? ORDER BY rolling_score DESC,score_velocity DESC,last_scanned ASC LIMIT 60`).bind(now).all();
  const promising=(promisingRows.results||[]).map(r=>r.symbol).filter(Boolean);

  const used=new Set([...pinned,...core,...promising]);
  const explorationLimit=Math.max(0,capped-used.size);
  const exploration=await explorationSymbols(env,explorationLimit,used);
  return unique([...pinned,...core,...promising,...exploration]).slice(0,capped);
}

export async function getWeeklyResearchUniverse(env,{limit=DEFAULT_WEEKLY_SIZE,now=Date.now()}={}){
  await ensureDiscoverySchema(env);
  const capped=Math.max(12,Math.min(42,Number(limit)||DEFAULT_WEEKLY_SIZE));
  const pinned=envSymbols(env).slice(0,8);
  const previous=await env.DB.prepare(`SELECT symbol,MAX(score) AS score FROM weekly_research GROUP BY symbol ORDER BY score DESC LIMIT 6`).all();
  const previousCandidates=(previous.results||[]).map(r=>r.symbol).filter(Boolean);
  const leaders=await env.DB.prepare(`SELECT symbol,rolling_score AS rollingScore,score_velocity AS scoreVelocity,last_scanned AS lastScanned
    FROM discovery_stats WHERE cooldown_until<=? AND dollar_volume>=10000000 ORDER BY rolling_score DESC,score_velocity DESC,last_scanned DESC LIMIT 30`).bind(now).all();
  const leaderSymbols=(leaders.results||[]).map(r=>r.symbol).filter(Boolean);
  const exploration=await explorationSymbols(env,8,new Set([...pinned,...previousCandidates,...leaderSymbols]));
  return unique([...pinned,...previousCandidates,...leaderSymbols,...exploration,...CORE_DISCOVERY_SYMBOLS]).slice(0,capped);
}

export async function recordDiscoveryObservation(env,quote,{now=Date.now()}={}){
  await ensureDiscoverySchema(env);
  const symbol=sanitizeSymbol(quote?.symbol);if(!symbol)return null;
  const previous=await env.DB.prepare(`SELECT scan_count AS scanCount,current_score AS currentScore,rolling_score AS rollingScore FROM discovery_stats WHERE symbol=?`).bind(symbol).first();
  const score=finite(quote.discoveryScore??quote.score),priorScore=finite(previous?.currentScore),priorRolling=finite(previous?.rollingScore);
  const scanCount=(Number(previous?.scanCount)||0)+1;
  const rolling=previous?priorRolling*.65+score*.35:score;
  const velocity=score-priorScore;
  const dollarVolume=Math.max(0,finite(quote.price)*finite(quote.volume));
  const weak=scanCount>=3&&rolling<=5&&dollarVolume<5_000_000;
  const cooldownUntil=weak?now+WEAK_COOLDOWN_MS:0;
  await env.DB.prepare(`INSERT INTO discovery_stats(symbol,last_scanned,scan_count,current_score,previous_score,rolling_score,score_velocity,price,dollar_volume,relative_volume,cooldown_until,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET last_scanned=excluded.last_scanned,scan_count=excluded.scan_count,current_score=excluded.current_score,previous_score=excluded.previous_score,rolling_score=excluded.rolling_score,score_velocity=excluded.score_velocity,price=excluded.price,dollar_volume=excluded.dollar_volume,relative_volume=excluded.relative_volume,cooldown_until=excluded.cooldown_until,updated_at=excluded.updated_at`)
    .bind(symbol,now,scanCount,score,priorScore,rolling,velocity,finite(quote.price),dollarVolume,finite(quote.relativeVolume),cooldownUntil,now).run();
  return{symbol,scanCount,currentScore:score,rollingScore:rolling,scoreVelocity:velocity,dollarVolume,cooldownUntil};
}

export async function getDiscoveryStatus(env){
  await ensureDiscoverySchema(env);
  const meta=await getDiscoveryMeta(env);
  const catalogSize=await catalogCount(env);
  const stats=await env.DB.prepare(`SELECT COUNT(*) AS scanned,MAX(last_scanned) AS lastScanned FROM discovery_stats`).first();
  return{catalogSize,scannedSymbols:Number(stats?.scanned)||0,lastScanned:Number(stats?.lastScanned)||0,catalogUpdatedAt:meta.catalogUpdatedAt,explorationCursor:meta.explorationCursor};
}

async function explorationSymbols(env,limit,exclude=new Set()){
  if(limit<=0)return[];
  const meta=await getDiscoveryMeta(env),rows=await env.DB.prepare(`SELECT c.symbol,COALESCE(s.last_scanned,0) AS lastScanned FROM discovery_catalog c LEFT JOIN discovery_stats s ON s.symbol=c.symbol WHERE c.eligible=1 ORDER BY c.symbol`).all();
  const all=(rows.results||[]).map(r=>r.symbol).filter(symbol=>symbol&&!exclude.has(symbol));if(!all.length)return[];
  const week=weekSeed(new Date()),offset=(meta.explorationCursor+week)%all.length,result=[];
  for(let i=0;i<all.length&&result.length<limit;i++)result.push(all[(offset+i)%all.length]);
  await putDiscoveryMeta(env,{...meta,explorationCursor:(offset+result.length)%all.length});
  return result;
}

async function seedCoreCatalog(env,preserveMeta=true){
  await ensureDiscoverySchema(env);const now=Date.now();
  await env.DB.batch(CORE_DISCOVERY_SYMBOLS.map(symbol=>env.DB.prepare(`INSERT INTO discovery_catalog(symbol,name,exchange,country,security_type,source,eligible,updated_at) VALUES(?,?,'','United States','Common Stock','core',1,?) ON CONFLICT(symbol) DO UPDATE SET eligible=1,updated_at=excluded.updated_at`).bind(symbol,symbol,now)));
  const meta=await getDiscoveryMeta(env);if(!preserveMeta&&!meta.catalogUpdatedAt)await putDiscoveryMeta(env,{...meta,catalogUpdatedAt:now});
  return{refreshed:false,catalogSize:await catalogCount(env),updatedAt:meta.catalogUpdatedAt||now,fallback:true};
}
async function catalogCount(env){const row=await env.DB.prepare(`SELECT COUNT(*) AS count FROM discovery_catalog WHERE eligible=1`).first();return Number(row?.count)||0;}
async function getDiscoveryMeta(env){const row=await env.DB.prepare(`SELECT catalog_updated_at AS catalogUpdatedAt,exploration_cursor AS explorationCursor,updated_at AS updatedAt FROM discovery_meta WHERE id=1`).first();return row?{catalogUpdatedAt:Number(row.catalogUpdatedAt)||0,explorationCursor:Number(row.explorationCursor)||0,updatedAt:Number(row.updatedAt)||0}:{catalogUpdatedAt:0,explorationCursor:0,updatedAt:0};}
async function putDiscoveryMeta(env,meta){const now=Date.now();await env.DB.prepare(`INSERT INTO discovery_meta(id,catalog_updated_at,exploration_cursor,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET catalog_updated_at=excluded.catalog_updated_at,exploration_cursor=excluded.exploration_cursor,updated_at=excluded.updated_at`).bind(Number(meta.catalogUpdatedAt)||0,Number(meta.explorationCursor)||0,now).run();}
function envSymbols(env){const raw=String(env.RADAR_UNIVERSE||'').trim();return raw?unique(raw.split(',').map(sanitizeSymbol).filter(Boolean)):[];}
function isEligibleUsCommonStock(item){const exchange=String(item?.exchange||'').toUpperCase(),type=String(item?.type||'').toLowerCase(),country=String(item?.country||'United States').toLowerCase();return ['NASDAQ','NYSE','NYSE AMERICAN'].includes(exchange)&&country.includes('united states')&&type.includes('common stock');}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function unique(values){return[...new Set(values.filter(Boolean))];}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function weekSeed(date){const y=date.getUTCFullYear(),start=Date.UTC(y,0,1),days=Math.floor((date.getTime()-start)/86_400_000);return Math.floor(days/7)*17;}
