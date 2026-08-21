export async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured.');
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS market_cache (symbol TEXT NOT NULL, timeframe TEXT NOT NULL, fetched_at INTEGER NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(symbol,timeframe))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS signal_state (symbol TEXT PRIMARY KEY, status TEXT NOT NULL, readiness INTEGER NOT NULL, price REAL NOT NULL, reason TEXT NOT NULL, analysis_json TEXT NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS signal_events (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, previous_status TEXT, status TEXT NOT NULL, readiness INTEGER NOT NULL, price REAL NOT NULL, reason TEXT NOT NULL, analysis_json TEXT NOT NULL, created_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_usage (day_key TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS symbol_search_cache (query TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, payload TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS radar_quotes (symbol TEXT PRIMARY KEY, price REAL NOT NULL, change_pct REAL NOT NULL, volume REAL NOT NULL, average_volume REAL NOT NULL, relative_volume REAL NOT NULL, score REAL NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS radar_state (id INTEGER PRIMARY KEY CHECK(id=1), cursor INTEGER NOT NULL DEFAULT 0, symbols_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, subscription_json TEXT NOT NULL, user_agent TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_test_access (endpoint TEXT PRIMARY KEY, test_token TEXT NOT NULL, last_test_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portfolio_positions (symbol TEXT PRIMARY KEY, entry_price REAL NOT NULL, shares REAL NOT NULL, bought_at INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
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

export async function upsertPushSubscription(env, subscription, userAgent='', testToken='') {
  const endpoint=String(subscription?.endpoint||'').trim();
  if(!endpoint) throw new Error('Push subscription endpoint is required.');
  const now=Date.now();
  const statements=[env.DB.prepare(`INSERT INTO push_subscriptions(endpoint,subscription_json,user_agent,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription_json=excluded.subscription_json,user_agent=excluded.user_agent,updated_at=excluded.updated_at`).bind(endpoint,JSON.stringify(subscription),String(userAgent||'').slice(0,500),now,now)];
  const token=String(testToken||'').trim();
  if(token) statements.push(env.DB.prepare(`INSERT INTO push_test_access(endpoint,test_token,last_test_at,updated_at) VALUES(?,?,0,?) ON CONFLICT(endpoint) DO UPDATE SET test_token=excluded.test_token,updated_at=excluded.updated_at`).bind(endpoint,token,now));
  await env.DB.batch(statements);return now;
}

export async function deletePushSubscription(env, endpoint) {
  const value=String(endpoint||'').trim();if(!value)return;
  await env.DB.batch([env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint=?`).bind(value),env.DB.prepare(`DELETE FROM push_test_access WHERE endpoint=?`).bind(value)]);
}

export async function listPushSubscriptions(env) {
  const rows=await env.DB.prepare(`SELECT endpoint,subscription_json AS subscriptionJson FROM push_subscriptions ORDER BY updated_at DESC`).all();
  return (rows.results||[]).map(row=>{try{return {endpoint:row.endpoint,subscription:JSON.parse(row.subscriptionJson)};}catch{return null;}}).filter(Boolean);
}

export async function countPushSubscriptions(env) { const row=await env.DB.prepare(`SELECT COUNT(*) AS count FROM push_subscriptions`).first();return Number(row?.count)||0; }

export async function authorizeDevice(env,endpoint,testToken) {
  const ep=String(endpoint||'').trim(), token=String(testToken||'').trim();if(!ep||!token)return false;
  const row=await env.DB.prepare(`SELECT 1 AS ok FROM push_subscriptions s JOIN push_test_access a ON a.endpoint=s.endpoint WHERE s.endpoint=? AND a.test_token=?`).bind(ep,token).first();
  return Boolean(row?.ok);
}

export async function authorizePushTest(env, endpoint, testToken, cooldownMs=60_000) {
  const ep=String(endpoint||'').trim(), token=String(testToken||'').trim();if(!ep||!token)return {authorized:false};
  const row=await env.DB.prepare(`SELECT s.subscription_json AS subscriptionJson,a.last_test_at AS lastTestAt FROM push_subscriptions s JOIN push_test_access a ON a.endpoint=s.endpoint WHERE s.endpoint=? AND a.test_token=?`).bind(ep,token).first();
  if(!row?.subscriptionJson)return {authorized:false};
  const now=Date.now(), lastTestAt=Number(row.lastTestAt)||0, retryAfterMs=Math.max(0,cooldownMs-(now-lastTestAt));
  if(retryAfterMs>0)return {authorized:true,rateLimited:true,retryAfterMs};
  await env.DB.prepare(`UPDATE push_test_access SET last_test_at=?,updated_at=? WHERE endpoint=? AND test_token=?`).bind(now,now,ep,token).run();
  try{return {authorized:true,rateLimited:false,subscription:JSON.parse(row.subscriptionJson)};}catch{return {authorized:false};}
}

export async function listAlerts(env, limit) { const rows=await env.DB.prepare(`SELECT id,symbol,previous_status AS previousStatus,status,readiness,price,reason,created_at AS createdAt FROM signal_events ORDER BY id DESC LIMIT ?`).bind(limit).all();return rows.results||[]; }

export async function listSignals(env) {
  const rows=await env.DB.prepare(`SELECT symbol,status,readiness,price,reason,analysis_json AS analysisJson,updated_at AS updatedAt FROM signal_state ORDER BY symbol`).all();
  return (rows.results||[]).map(row=>{let analysis=null;try{analysis=row.analysisJson?JSON.parse(row.analysisJson):null;}catch{}const {analysisJson,...rest}=row;return {...rest,analysis};});
}

export async function getSignalAnalysis(env, symbol) {
  const row=await env.DB.prepare(`SELECT analysis_json AS analysisJson,updated_at AS updatedAt FROM signal_state WHERE symbol=?`).bind(symbol).first();if(!row?.analysisJson)return null;
  try{return {analysis:JSON.parse(row.analysisJson),updatedAt:Number(row.updatedAt)||0};}catch{return null;}
}

export async function recordSignal(env, analysis) {
  const now=Date.now();const previous=await env.DB.prepare('SELECT status FROM signal_state WHERE symbol=?').bind(analysis.symbol).first();
  await env.DB.prepare(`INSERT INTO signal_state(symbol,status,readiness,price,reason,analysis_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET status=excluded.status,readiness=excluded.readiness,price=excluded.price,reason=excluded.reason,analysis_json=excluded.analysis_json,updated_at=excluded.updated_at`).bind(analysis.symbol,analysis.status,analysis.readiness,analysis.latest.close,analysis.reason,JSON.stringify(analysis),now).run();
  if(previous?.status===analysis.status)return {changed:false,previousStatus:previous.status,now};
  await env.DB.prepare(`INSERT INTO signal_events(symbol,previous_status,status,readiness,price,reason,analysis_json,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(analysis.symbol,previous?.status||null,analysis.status,analysis.readiness,analysis.latest.close,analysis.reason,JSON.stringify(analysis),now).run();
  return {changed:true,previousStatus:previous?.status||null,now};
}

export async function listPortfolioPositions(env) { const rows=await env.DB.prepare(`SELECT symbol,entry_price AS entryPrice,shares,bought_at AS boughtAt,notes,created_at AS createdAt,updated_at AS updatedAt FROM portfolio_positions ORDER BY bought_at DESC`).all();return rows.results||[]; }

export async function upsertPortfolioPosition(env,{symbol,entryPrice,shares,boughtAt,notes=''}) {
  const now=Date.now();await env.DB.prepare(`INSERT INTO portfolio_positions(symbol,entry_price,shares,bought_at,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET entry_price=excluded.entry_price,shares=excluded.shares,bought_at=excluded.bought_at,notes=excluded.notes,updated_at=excluded.updated_at`).bind(symbol,entryPrice,shares,boughtAt,String(notes||'').slice(0,500),now,now).run();return now;
}

export async function deletePortfolioPosition(env,symbol) { await env.DB.prepare(`DELETE FROM portfolio_positions WHERE symbol=?`).bind(symbol).run(); }

function clampInt(value,min,max,fallback){const n=Number.parseInt(value,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
