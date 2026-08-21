export async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured.');
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS market_cache (symbol TEXT NOT NULL, timeframe TEXT NOT NULL, fetched_at INTEGER NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(symbol,timeframe))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS signal_state (symbol TEXT PRIMARY KEY, status TEXT NOT NULL, readiness INTEGER NOT NULL, price REAL NOT NULL, reason TEXT NOT NULL, analysis_json TEXT NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS signal_events (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, previous_status TEXT, status TEXT NOT NULL, readiness INTEGER NOT NULL, price REAL NOT NULL, reason TEXT NOT NULL, analysis_json TEXT NOT NULL, created_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_usage (day_key TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS symbol_search_cache (query TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS radar_quotes (symbol TEXT PRIMARY KEY, price REAL NOT NULL, change_pct REAL NOT NULL, volume REAL NOT NULL, average_volume REAL NOT NULL, relative_volume REAL NOT NULL, score REAL NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS radar_state (id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL DEFAULT 0, symbols_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL DEFAULT 0)`)
  ]);
}

export async function reserveProviderRequest(env) {
  const max = clampInt(env.MAX_PROVIDER_REQUESTS_PER_DAY, 50, 5000, 700);
  const dayKey = new Date().toISOString().slice(0,10), now = Date.now();
  const row = await env.DB.prepare('SELECT requests FROM provider_usage WHERE day_key=?').bind(dayKey).first();
  if (Number(row?.requests || 0) >= max) throw new Error('Provider quota safety limit reached.');
  await env.DB.prepare(`INSERT INTO provider_usage(day_key,requests,updated_at) VALUES(?,1,?) ON CONFLICT(day_key) DO UPDATE SET requests=requests+1, updated_at=excluded.updated_at`).bind(dayKey,now).run();
}

export async function getCachedMarket(env, symbol, timeframe, maxAgeMs) {
  const row = await env.DB.prepare('SELECT fetched_at AS fetchedAt, source, payload FROM market_cache WHERE symbol=? AND timeframe=?').bind(symbol,timeframe).first();
  if (!row || Date.now()-Number(row.fetchedAt) >= maxAgeMs) return null;
  return { candles:JSON.parse(row.payload), source:row.source, cached:true, fetchedAt:Number(row.fetchedAt) };
}

export async function putCachedMarket(env, symbol, timeframe, source, candles) {
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO market_cache(symbol,timeframe,fetched_at,source,payload) VALUES(?,?,?,?,?) ON CONFLICT(symbol,timeframe) DO UPDATE SET fetched_at=excluded.fetched_at,source=excluded.source,payload=excluded.payload`).bind(symbol,timeframe,now,source,JSON.stringify(candles)).run();
  return now;
}

export async function getCachedSymbolSearch(env, query, maxAgeMs=86_400_000) {
  const row=await env.DB.prepare('SELECT fetched_at AS fetchedAt,payload FROM symbol_search_cache WHERE query=?').bind(query).first();
  if (!row || Date.now()-Number(row.fetchedAt)>=maxAgeMs) return null;
  return { results:JSON.parse(row.payload), cached:true, fetchedAt:Number(row.fetchedAt) };
}

export async function putCachedSymbolSearch(env, query, results) {
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO symbol_search_cache(query,fetched_at,payload) VALUES(?,?,?) ON CONFLICT(query) DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload`).bind(query,now,JSON.stringify(results)).run();
  return now;
}

export async function putRadarQuote(env, quote) {
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO radar_quotes(symbol,price,change_pct,volume,average_volume,relative_volume,score,payload,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET price=excluded.price,change_pct=excluded.change_pct,volume=excluded.volume,average_volume=excluded.average_volume,relative_volume=excluded.relative_volume,score=excluded.score,payload=excluded.payload,updated_at=excluded.updated_at`).bind(quote.symbol,quote.price,quote.changePct,quote.volume,quote.averageVolume,quote.relativeVolume,quote.score,JSON.stringify(quote),now).run();
}

export async function listRadarQuotes(env, maxAgeMs=14_400_000, limit=24) {
  const cutoff=Date.now()-maxAgeMs;
  const rows=await env.DB.prepare(`SELECT payload,updated_at AS updatedAt FROM radar_quotes WHERE updated_at>=? ORDER BY score DESC LIMIT ?`).bind(cutoff,limit).all();
  return (rows.results||[]).map(row=>{try{return {...JSON.parse(row.payload),updatedAt:Number(row.updatedAt)||0};}catch{return null;}}).filter(Boolean);
}

export async function getRadarState(env) {
  const row=await env.DB.prepare(`SELECT cursor,symbols_json AS symbolsJson,updated_at AS updatedAt FROM radar_state WHERE id=1`).first();
  if(!row) return {cursor:0,symbols:[],updatedAt:0};
  let symbols=[];try{symbols=JSON.parse(row.symbolsJson)||[];}catch{}
  return {cursor:Number(row.cursor)||0,symbols,updatedAt:Number(row.updatedAt)||0};
}

export async function putRadarState(env, cursor, symbols) {
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO radar_state(id,cursor,symbols_json,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor,symbols_json=excluded.symbols_json,updated_at=excluded.updated_at`).bind(cursor,JSON.stringify(symbols),now).run();
  return now;
}

export async function listAlerts(env, limit) {
  const rows=await env.DB.prepare(`SELECT id,symbol,previous_status AS previousStatus,status,readiness,price,reason,created_at AS createdAt FROM signal_events ORDER BY id DESC LIMIT ?`).bind(limit).all();
  return rows.results || [];
}

export async function listSignals(env) {
  const rows=await env.DB.prepare(`SELECT symbol,status,readiness,price,reason,analysis_json AS analysisJson,updated_at AS updatedAt FROM signal_state ORDER BY symbol`).all();
  return (rows.results || []).map(row=>{
    let analysis=null;
    try { analysis=row.analysisJson ? JSON.parse(row.analysisJson) : null; } catch {}
    const {analysisJson,...rest}=row;
    return {...rest,analysis};
  });
}

export async function getSignalAnalysis(env, symbol) {
  const row=await env.DB.prepare(`SELECT analysis_json AS analysisJson,updated_at AS updatedAt FROM signal_state WHERE symbol=?`).bind(symbol).first();
  if (!row?.analysisJson) return null;
  try { return {analysis:JSON.parse(row.analysisJson),updatedAt:Number(row.updatedAt)||0}; }
  catch { return null; }
}

export async function recordSignal(env, analysis) {
  const now=Date.now();
  const previous=await env.DB.prepare('SELECT status FROM signal_state WHERE symbol=?').bind(analysis.symbol).first();
  await env.DB.prepare(`INSERT INTO signal_state(symbol,status,readiness,price,reason,analysis_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET status=excluded.status,readiness=excluded.readiness,price=excluded.price,reason=excluded.reason,analysis_json=excluded.analysis_json,updated_at=excluded.updated_at`).bind(analysis.symbol,analysis.status,analysis.readiness,analysis.latest.close,analysis.reason,JSON.stringify(analysis),now).run();
  if (previous?.status===analysis.status) return { changed:false, previousStatus:previous.status, now };
  await env.DB.prepare(`INSERT INTO signal_events(symbol,previous_status,status,readiness,price,reason,analysis_json,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(analysis.symbol,previous?.status||null,analysis.status,analysis.readiness,analysis.latest.close,analysis.reason,JSON.stringify(analysis),now).run();
  return { changed:true, previousStatus:previous?.status||null, now };
}

function clampInt(value,min,max,fallback){const n=Number.parseInt(value,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
