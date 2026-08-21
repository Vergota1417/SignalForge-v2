window.SIGNALFORGE_CONFIG = {
  // Optional market-data backend. When blank, SignalForge uses deterministic demo data.
  // Expected endpoint: GET {API_BASE_URL}/api/market-data?symbol=XOM&timeframe=6M
  // Expected response shape: { candles: [{ time, open, high, low, close, volume }] }
  API_BASE_URL: "",
  REQUEST_TIMEOUT_MS: 7000
};
