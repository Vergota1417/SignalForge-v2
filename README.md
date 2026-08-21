# SignalForge Rebuild

A deployable static rebuild of the SignalForge decision dashboard with the upgraded logic discussed in chat.

## What changed

- Replaces a misleading raw `10/12` interpretation with **critical gates**.
- Four independent decision engines:
  1. Trend
  2. Entry
  3. Probability
  4. Risk / Reward
- Final states:
  - BUY NOW
  - SETUP — READY SOON
  - WAIT FOR PULLBACK
  - WAIT — SETUP NOT READY
  - AVOID
  - SELL / EXIT
- Three distinct chart zones:
  - Preferred Entry
  - Overextension / Don’t Chase
  - Thesis Break / Stop
- Timeframes:
  - 1D: 5-minute candles
  - 5D: 15-minute candles
  - 1M: 1-hour candles
  - 3M: daily candles
  - 6M: daily candles
  - 1Y: daily candles
  - 2Y: weekly candles
- Lightweight walk-forward check on the loaded candle series.
- Explains exactly why a setup is blocked from BUY.
- Responsive desktop/mobile layout.
- Watchlist scan with deterministic demo data.

## Run locally

Because this is a static app, any simple web server works.

### Python

```bash
cd SignalForge-Rebuild
python -m http.server 8080
```

Then open `http://127.0.0.1:8080`.

## Connect real market data

Edit `config.js`:

```js
window.SIGNALFORGE_CONFIG = {
  API_BASE_URL: "https://your-api.example.com",
  REQUEST_TIMEOUT_MS: 7000
};
```

The frontend expects:

```text
GET /api/market-data?symbol=XOM&timeframe=6M
```

Response:

```json
{
  "candles": [
    {
      "time": "2026-08-21T14:30:00Z",
      "open": 100.1,
      "high": 101.2,
      "low": 99.8,
      "close": 100.9,
      "volume": 1234567
    }
  ]
}
```

If the API is blank or unavailable, the UI automatically falls back to deterministic demo data.

## Important

The calculations in this rebuild are a transparent decision-support prototype. They should be validated against historical market data before being used for live trading decisions. They are not financial advice and do not guarantee returns.
