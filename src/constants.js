export const TIMEFRAMES = {
  '1D': { interval: '5min', outputsize: 90, cacheSeconds: 60 },
  '5D': { interval: '15min', outputsize: 160, cacheSeconds: 180 },
  '1M': { interval: '1h', outputsize: 200, cacheSeconds: 300 },
  '3M': { interval: '1day', outputsize: 100, cacheSeconds: 600 },
  '6M': { interval: '1day', outputsize: 180, cacheSeconds: 600 },
  '1Y': { interval: '1day', outputsize: 260, cacheSeconds: 1800 },
  '2Y': { interval: '1week', outputsize: 110, cacheSeconds: 3600 }
};

export const DEFAULT_WATCHLIST = ['XOM', 'NVDA', 'MSFT', 'AAPL', 'AMZN', 'TSLA'];
