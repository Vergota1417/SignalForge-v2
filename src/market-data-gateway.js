import { getMarketData as getTwelveDataMarketData, searchSymbols as searchTwelveDataSymbols } from './market.js';

const DEFAULT_PROVIDER = 'auto';

export async function getCandles(env, symbol, timeframe, options = {}) {
  const provider = normalizeProvider(options.provider || env.MARKET_DATA_PROVIDER || DEFAULT_PROVIDER);
  const ordered = providerOrder(provider, env);
  let lastError = null;

  for (const candidate of ordered) {
    try {
      if (candidate === 'alpaca') return await getAlpacaCandles(env, symbol, timeframe, options);
      if (candidate === 'twelve-data') return await getTwelveDataMarketData(env, symbol, timeframe, Boolean(options.forceRefresh), options);
    } catch (error) {
      lastError = error;
      if (provider !== 'auto') throw error;
    }
  }

  throw lastError || new Error('No configured market-data provider could return candle data.');
}

export async function searchMarketSymbols(env, query, options = {}) {
  const provider = normalizeProvider(options.provider || env.MARKET_DATA_PROVIDER || DEFAULT_PROVIDER);
  if (provider === 'twelve-data') return searchTwelveDataSymbols(env, query);
  if (provider === 'alpaca') return searchAlpacaAssets(env, query);

  if (env.ALPACA_API_KEY_ID && env.ALPACA_API_SECRET_KEY) {
    try { return await searchAlpacaAssets(env, query); } catch (_) {}
  }
  return searchTwelveDataSymbols(env, query);
}

export function configuredProviders(env) {
  return {
    alpaca: Boolean(env.ALPACA_API_KEY_ID && env.ALPACA_API_SECRET_KEY),
    twelveData: Boolean(env.TWELVE_DATA_API_KEY)
  };
}

function normalizeProvider(value) {
  const p = String(value || '').trim().toLowerCase();
  if (['alpaca', 'twelve-data', 'auto'].includes(p)) return p;
  if (p === 'twelve' || p === 'twelvedata') return 'twelve-data';
  return DEFAULT_PROVIDER;
}

function providerOrder(provider, env) {
  if (provider !== 'auto') return [provider];
  const order = [];
  if (env.ALPACA_API_KEY_ID && env.ALPACA_API_SECRET_KEY) order.push('alpaca');
  if (env.TWELVE_DATA_API_KEY) order.push('twelve-data');
  return order;
}

async function getAlpacaCandles(env, symbol, timeframe, options = {}) {
  assertAlpaca(env);
  const tf = alpacaTimeframe(timeframe);
  const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
  url.searchParams.set('timeframe', tf.timeframe);
  url.searchParams.set('limit', String(tf.limit));
  url.searchParams.set('adjustment', 'raw');
  url.searchParams.set('feed', String(options.feed || env.ALPACA_DATA_FEED || 'iex'));
  url.searchParams.set('sort', 'asc');

  if (tf.startDaysAgo) {
    const start = new Date(Date.now() - tf.startDaysAgo * 86_400_000);
    url.searchParams.set('start', start.toISOString());
  }

  const payload = await fetchAlpacaJson(env, url);
  const bars = Array.isArray(payload?.bars) ? payload.bars : [];
  if (!bars.length) throw new Error('Alpaca returned no bars.');

  const candles = bars.map(b => ({
    time: Date.parse(b.t),
    open: Number(b.o),
    high: Number(b.h),
    low: Number(b.l),
    close: Number(b.c),
    volume: Number(b.v || 0)
  })).filter(validCandle);

  if (candles.length < tf.minimum) throw new Error(`Alpaca returned insufficient candle history: ${candles.length}/${tf.minimum}.`);

  return {
    candles,
    source: 'Alpaca',
    cached: false,
    fetchedAt: Date.now(),
    quality: {
      rawBars: bars.length,
      acceptedBars: candles.length,
      rejectedBars: bars.length - candles.length,
      duplicatesRemoved: 0,
      formingBarsRemoved: 0,
      historyRequired: tf.minimum,
      historyReady: candles.length >= tf.minimum,
      cacheDerived: false
    }
  };
}

async function searchAlpacaAssets(env, query) {
  assertAlpaca(env);
  const q = String(query || '').trim().toUpperCase();
  const payload = await fetchAlpacaJson(env, new URL('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity'));
  const rows = Array.isArray(payload) ? payload : [];
  const results = rows
    .filter(a => a?.tradable && a?.symbol)
    .filter(a => !q || String(a.symbol).toUpperCase().includes(q) || String(a.name || '').toUpperCase().includes(q))
    .slice(0, 12)
    .map(a => ({
      symbol: String(a.symbol).toUpperCase(),
      name: String(a.name || a.symbol),
      exchange: String(a.exchange || ''),
      micCode: '',
      type: 'Common Stock/ETF',
      country: 'United States',
      currency: 'USD',
      plan: 'alpaca'
    }));
  return { results, cached: false, fetchedAt: Date.now(), source: 'Alpaca' };
}

function alpacaTimeframe(timeframe) {
  const map = {
    '1D': { timeframe: '5Min', limit: 120, minimum: 1, startDaysAgo: 2 },
    '5D': { timeframe: '15Min', limit: 500, minimum: 60, startDaysAgo: 10 },
    '1M': { timeframe: '1Hour', limit: 500, minimum: 60, startDaysAgo: 45 },
    '3M': { timeframe: '1Day', limit: 120, minimum: 60, startDaysAgo: 150 },
    '6M': { timeframe: '1Day', limit: 180, minimum: 100, startDaysAgo: 260 },
    '1Y': { timeframe: '1Day', limit: 260, minimum: 120, startDaysAgo: 420 },
    '2Y': { timeframe: '1Week', limit: 130, minimum: 80, startDaysAgo: 900 }
  };
  const cfg = map[timeframe];
  if (!cfg) throw new Error('Unsupported timeframe.');
  return cfg;
}

function validCandle(c) {
  return Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && Number.isFinite(c.volume) && c.open > 0 && c.high >= c.low && c.low > 0 && c.close > 0 && c.volume >= 0;
}

function assertAlpaca(env) {
  if (!env.ALPACA_API_KEY_ID || !env.ALPACA_API_SECRET_KEY) throw new Error('Alpaca API credentials are not configured.');
}

async function fetchAlpacaJson(env, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'APCA-API-KEY-ID': env.ALPACA_API_KEY_ID,
        'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET_KEY
      }
    });
    if (!response.ok) throw new Error(`Alpaca HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Alpaca request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
