import { reserveProviderRequest } from './db.js';

export const CORE_DISCOVERY_SYMBOLS=[
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','AVGO','TSLA','AMD','NFLX','CRM','ORCL','ADBE','QCOM','INTC','MU','AMAT','ARM','PLTR','CRWD',
  'JPM','BAC','GS','V','MA','XOM','CVX','COP','LLY','UNH','COST','WMT','HD','CAT','GE','UBER','DIS','KO','PEP','BA'
];

const CATALOG_TTL=86_400_000;
const DEFAULT_DISCOVERY_SIZE=120;
const DEFAULT_WEEKLY_SIZE=36;
const WEAK_COOLDOWN_MS=30*86_400_000;

export async function ensureDiscoverySchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_catalog (symbol TEXT PRIMARY KEY,name TEXT NOT NULL DEFAULT '',exchange TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT '',security_type TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'twelve-data',eligible INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_stats (symbol TEXT PRIMARY KEY,last_scanned INTEGER NOT NULL DEFAULT 0,scan_count INTEGER NOT NULL DEFAULT 0,current_score REAL NOT NULL DEFAULT 0,previous_score REAL NOT NULL DEFAULT 0,rolling_score REAL NOT NULL DEFAULT 0,score_velocity REAL NOT NULL DEFAULT 0,price REAL NOT NULL DEFAULT 0,dollar_volume REAL NOT NULL DEFAULT 0,relative_volume REAL NOT NULL DEFAULT 0,cooldown_until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_meta (id INTEGER PRIMARY KEY CHECK(id=1),catalog_updated_at INTEGER NOT NULL DEFAULT 0,exploration_cursor INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_weekly_pool (week_key TEXT NOT NULL,position INTEGER NOT NULL,symbol TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(week_key,position),UNIQUE(week_key,symbol))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS discovery_weekly_universe (week_key TEXT NOT NULL,position INTEGER NOT NULL,symbol TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'promoted',created_at INTEGER NOT NULL,PRIMARY KEY(week_key,position),UNIQUE(week_key,symbol))`)
  ]);
}

export async function refreshDiscoveryCatalog(env,{force=false}={}){
  await ensureDiscoverySchema(env);const meta=await getDiscoveryMeta(env),now=Date.now();
  if(!force&&meta.catalogUpdatedAt>0&&now-meta.catalogUpdatedAt<CATALOG_TTL)return{refreshed:false,catalogSize:await catalogCount(env),updatedAt:meta.catalogUpdatedAt};
  if(!env.TWELVE_DATA_API_KEY)return seedCoreCatalog(env,true,now);
  try{
    await reserveProviderRequest(env);
    const url=new URL('https://api.twelvedata.com/stocks');url.searchParams.set('country','United States');url.searchParams.set('type','Common Stock');url.searchParams.set('apikey',env.TWELVE_DATA_API_KEY);
    const response=await fetch(url,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`Twelve Data HTTP ${response.status}`);
    const payload=await response.json();if(payload?.status==='error')throw new Error(`Twelve Data: ${payload.message||'provider error'}`);
    const rows=Array.isArray(payload?.data)?payload.data:[];
    const eligible=rows.filter(isEligibleUsCommonStock).map(item=>({symbol:sanitizeSymbol(item.symbol),name:String(item.name||''),exchange:String(item.exchange||''),country:String(item.country||'United States'),securityType:String(item.type||'Common Stock')})).filter(row=>row.symbol);
    if(!eligible.length)throw new Error('Stock catalog returned no eligible U.S. common stocks.');
    for(let i=0;i<eligible.length;i+=75){const batch=eligible.slice(i,i+75).map(row=>env.DB.prepare(`INSERT INTO discovery_catalog(symbol,name,exchange,country,security_type,source,eligible,updated_at) VALUES(?,?,?,?,?,'twelve-data',1,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name,exchange=excluded.exchange,country=excluded.country,security_type=excluded.security_type,source=excluded.source,eligible=1,updated_at=excluded.updated_at`).bind(row.symbol,row.name,row.exchange,row.country,row.securityType,now));if(batch.length)await env.DB.batch(batch);}
    await seedCoreCatalog(env,false,now);await putDiscoveryMeta(env,{catalogUpdatedAt:now});return{refreshed:true,catalogSize:await catalogCount(env),updatedAt:now};
  }catch(error){
    console.error(JSON.stringify({event:'discovery_catalog_error',message:error?.message||String(error)}));await seedCoreCatalog(env,false,now);await putDiscoveryMeta(env,{catalogUpdatedAt:now});return{refreshed:false,catalogSize:await catalogCount(env),updatedAt:now,fallback:true,error:error?.message||String(error)};
  }
}

export async function getDiscoveryPool(env,{limit=DEFAULT_DISCOVERY_SIZE,now=Date.now(),weekKey=investmentWeekKey(new Date(now))}={}){
  await ensureDiscoverySchema(env);await refreshDiscoveryCatalog(env);
  const existing=await env.DB.prepare(`SELECT symbol FROM discovery_weekly_pool WHERE week_key=? ORDER BY position`).bind(weekKey).all();if((existing.results||[]).length)return(existing.results||[]).map(r=>r.symbol);
  const capped=Math.max(20,Math.min(200,Number(limit)||DEFAULT_DISCOVERY_SIZE)),pinned=envSymbols(env),core=CORE_DISCOVERY_SYMBOLS;
  const promisingRows=await env.DB.prepare(`SELECT symbol FROM discovery_stats WHERE cooldown_until<=? ORDER BY rolling_score DESC,score_velocity DESC,last_scanned ASC LIMIT 60`).bind(now).all();
  const promising=(promisingRows.results||[]).map(r=>r.symbol).filter(Boolean),used=new Set([...pinned,...core,...promising]),exploration=await explorationSymbols(env,Math.max(0,capped-used.size),used,now);
  const pool=composeDiscoveryPool({pinned,core,promising,exploration,limit:capped}),createdAt=Date.now();
  if(pool.length)await env.DB.batch(pool.map((symbol,position)=>env.DB.prepare(`INSERT OR IGNORE INTO discovery_weekly_pool(week_key,position,symbol,created_at) VALUES(?,?,?,?)`).bind(weekKey,position,symbol,createdAt)));
  return pool;
}

export async function getWeeklyResearchUniverse(env,{limit=DEFAULT_WEEKLY_SIZE,now=Date.now(),weekKey=investmentWeekKey(new Date(now))}={}){
  await ensureDiscoverySchema(env);
  const existing=await env.DB.prepare(`SELECT symbol FROM discovery_weekly_universe WHERE week_key=? ORDER BY position`).bind(weekKey).all();if((existing.results||[]).length)return(existing.results||[]).map(r=>r.symbol);
  const capped=Math.max(12,Math.min(42,Number(limit)||DEFAULT_WEEKLY_SIZE)),pinned=envSymbols(env).slice(0,8);
  const previous=await env.DB.prepare(`SELECT symbol,MAX(score) AS score FROM weekly_research WHERE week_key<>? GROUP BY symbol ORDER BY score DESC LIMIT 6`).bind(weekKey).all(),previousCandidates=(previous.results||[]).map(r=>r.symbol).filter(Boolean);
  const leaders=await env.DB.prepare(`SELECT symbol FROM discovery_stats WHERE cooldown_until<=? AND dollar_volume>=10000000 ORDER BY rolling_score DESC,score_velocity DESC,last_scanned DESC LIMIT 30`).bind(now).all(),leaderSymbols=(leaders.results||[]).map(r=>r.symbol).filter(Boolean);
  const exploration=await explorationSymbols(env,8,new Set([...pinned,...previousCandidates,...leaderSymbols]),now),shortlist=composeWeeklyShortlist({pinned,previous:previousCandidates,leaders:leaderSymbols,exploration,core:CORE_DISCOVERY_SYMBOLS,limit:capped}),createdAt=Date.now();
  if(shortlist.length)await env.DB.batch(shortlist.map((symbol,position)=>env.DB.prepare(`INSERT OR IGNORE INTO discovery_weekly_universe(week_key,position,symbol,source,created_at) VALUES(?,?,?,?,?)`).bind(weekKey,position,symbol,sourceFor(symbol,pinned,previousCandidates,leaderSymbols,exploration),createdAt)));
  return shortlist;
}

export async function recordDiscoveryObservation(env,quote,{now=Date.now()}={}){
  await ensureDiscoverySchema(env);const symbol=sanitizeSymbol(quote?.symbol);if(!symbol)return null;
  const previous=await env.DB.prepare(`SELECT scan_count AS scanCount,current_score AS currentScore,rolling_score AS rollingScore FROM discovery_stats WHERE symbol=?`).bind(symbol).first();
  const score=finite(quote.discoveryScore??quote.score),priorScore=finite(previous?.currentScore),priorRolling=finite(previous?.rollingScore),scanCount=(Number(previous?.scanCount)||0)+1,rolling=previous?priorRolling*.65+score*.35:score,velocity=previous?score-priorScore:0,dollarVolume=Math.max(0,finite(quote.price)*finite(quote.volume));
  const weak=scanCount>=3&&rolling<=5&&dollarVolume<5_000_000,cooldownUntil=weak?now+WEAK_COOLDOWN_MS:0;
  await env.DB.prepare(`INSERT INTO discovery_stats(symbol,last_scanned,scan_count,current_score,previous_score,rolling_score,score_velocity,price,dollar_volume,relative_volume,cooldown_until,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET last_scanned=excluded.last_scanned,scan_count=excluded.scan_count,current_score=excluded.current_score,previous_score=excluded.previous_score,rolling_score=excluded.rolling_score,score_velocity=excluded.score_velocity,price=excluded.price,dollar_volume=excluded.dollar_volume,relative_volume=excluded.relative_volume,cooldown_until=excluded.cooldown_until,updated_at=excluded.updated_at`).bind(symbol,now,scanCount,score,priorScore,rolling,velocity,finite(quote.price),dollarVolume,finite(quote.relativeVolume),cooldownUntil,now).run();
  return{symbol,scanCount,currentScore:score,rollingScore:rolling,scoreVelocity:velocity,dollarVolume,cooldownUntil};
}

export async function getDiscoveryStatus(env){await ensureDiscoverySchema(env);const meta=await getDiscoveryMeta(env),catalogSize=await catalogCount(env),stats=await env.DB.prepare(`SELECT COUNT(*) AS scanned,MAX(last_scanned) AS lastScanned FROM discovery_stats`).first();return{catalogSize,scannedSymbols:Number(stats?.scanned)||0,lastScanned:Number(stats?.lastScanned)||0,catalogUpdatedAt:meta.catalogUpdatedAt};}
export function composeDiscoveryPool({pinned=[],core=[],promising=[],exploration=[],limit=120}={}){return unique([...pinned,...core,...promising,...exploration]).slice(0,limit);}
export function composeWeeklyShortlist({pinned=[],previous=[],leaders=[],exploration=[],core=[],limit=36}={}){return unique([...pinned,...previous,...leaders,...exploration,...core]).slice(0,limit);}

async function explorationSymbols(env,limit,exclude=new Set(),now=Date.now()){
  if(limit<=0)return[];const rows=await env.DB.prepare(`SELECT c.symbol FROM discovery_catalog c LEFT JOIN discovery_stats s ON s.symbol=c.symbol WHERE c.eligible=1 AND COALESCE(s.cooldown_until,0)<=? ORDER BY c.symbol`).bind(now).all(),all=(rows.results||[]).map(r=>r.symbol).filter(symbol=>symbol&&!exclude.has(symbol));if(!all.length)return[];
  const offset=weekSeed(new Date(now))%all.length,result=[];for(let i=0;i<all.length&&result.length<limit;i++)result.push(all[(offset+i)%all.length]);return result;
}
async function seedCoreCatalog(env,markRefresh=false,now=Date.now()){await ensureDiscoverySchema(env);await env.DB.batch(CORE_DISCOVERY_SYMBOLS.map(symbol=>env.DB.prepare(`INSERT INTO discovery_catalog(symbol,name,exchange,country,security_type,source,eligible,updated_at) VALUES(?,?,'','United States','Common Stock','core',1,?) ON CONFLICT(symbol) DO UPDATE SET eligible=1,updated_at=excluded.updated_at`).bind(symbol,symbol,now)));const meta=await getDiscoveryMeta(env);if(markRefresh)await putDiscoveryMeta(env,{catalogUpdatedAt:now});return{refreshed:false,catalogSize:await catalogCount(env),updatedAt:markRefresh?now:meta.catalogUpdatedAt,fallback:true};}
async function catalogCount(env){const row=await env.DB.prepare(`SELECT COUNT(*) AS count FROM discovery_catalog WHERE eligible=1`).first();return Number(row?.count)||0;}
async function getDiscoveryMeta(env){const row=await env.DB.prepare(`SELECT catalog_updated_at AS catalogUpdatedAt FROM discovery_meta WHERE id=1`).first();return row?{catalogUpdatedAt:Number(row.catalogUpdatedAt)||0}:{catalogUpdatedAt:0};}
async function putDiscoveryMeta(env,meta){const now=Date.now();await env.DB.prepare(`INSERT INTO discovery_meta(id,catalog_updated_at,exploration_cursor,updated_at) VALUES(1,?,0,?) ON CONFLICT(id) DO UPDATE SET catalog_updated_at=excluded.catalog_updated_at,updated_at=excluded.updated_at`).bind(Number(meta.catalogUpdatedAt)||0,now).run();}
function envSymbols(env){const raw=String(env.RADAR_UNIVERSE||'').trim();return raw?unique(raw.split(',').map(sanitizeSymbol).filter(Boolean)):[];}
function isEligibleUsCommonStock(item){const exchange=String(item?.exchange||'').toUpperCase(),type=String(item?.type||'').toLowerCase(),country=String(item?.country||'United States').toLowerCase();return['NASDAQ','NYSE','NYSE AMERICAN'].includes(exchange)&&country.includes('united states')&&type.includes('common stock');}
function sourceFor(symbol,pinned,previous,leaders,exploration){if(pinned.includes(symbol))return'pinned';if(previous.includes(symbol))return'previous';if(leaders.includes(symbol))return'radar-leader';if(exploration.includes(symbol))return'exploration';return'core';}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function unique(values){return[...new Set(values.filter(Boolean))];}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function weekSeed(date){const y=date.getUTCFullYear(),start=Date.UTC(y,0,1),days=Math.floor((date.getTime()-start)/86_400_000);return Math.floor(days/7)*17;}
function investmentWeekKey(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),p=Object.fromEntries(parts.map(x=>[x.type,x.value])),base=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))),weekday=(base.getUTCDay()+6)%7;base.setUTCDate(base.getUTCDate()-weekday);return base.toISOString().slice(0,10);}
