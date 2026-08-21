# SignalForge v2.1

SignalForge is a Cloudflare Worker + Static Assets decision-support dashboard for stock-market setups.

## What changed in v2.1

- Live market-data API runs server-side in the Cloudflare Worker.
- Twelve Data API key stays in a Cloudflare secret, never in browser JavaScript.
- 1D / 5D / 1M / 3M / 6M / 1Y / 2Y map to 5min / 15min / 1h / 1day / 1week candles.
- D1 caches candles and stores current signal state plus status-transition history.
- Cron Trigger scans the configured watchlist every 15 minutes on weekdays and only fetches during the U.S. market window.
- Signal changes can optionally POST to an alert webhook.
- Demo data remains a fallback if the live API is unavailable.

## Repository layout

```text
index.html           Browser UI
styles.css
config.js
app.js
src/                 Worker API + scanner + D1 logic
  index.js
  market.js
  db.js
  analysis.js
  constants.js
wrangler.jsonc       Cloudflare deployment configuration
.assetsignore        Keeps backend files out of static assets
package.json
```

## Required Cloudflare secret

Create a free Twelve Data API key, then add it to the Worker as a secret named:

```text
TWELVE_DATA_API_KEY
```

Do not put the API key in `config.js` or GitHub.

Optional webhook secret:

```text
ALERT_WEBHOOK_URL
```

If configured, SignalForge posts JSON when a symbol changes into one of the alert statuses configured in `wrangler.jsonc`.

## Cloudflare deployment

The existing Cloudflare Git deployment can keep using:

```bash
npx wrangler deploy
```

Wrangler serves the repository root as Static Assets, while `.assetsignore` excludes backend/configuration files. API requests under `/api/*` run through `src/index.js`.

The `DB` D1 binding intentionally has no resource ID in source control. Modern Wrangler can automatically provision the D1 resource during deployment. The Worker initializes its tables with `CREATE TABLE IF NOT EXISTS` on first use.

## API routes

- `GET /api/health`
- `GET /api/market-data?symbol=XOM&timeframe=6M`
- `GET /api/signals`
- `GET /api/alerts?limit=12`

## Scanner

The cron expression is `*/15 * * * 1-5`. Cron is evaluated by Cloudflare in UTC, while the Worker itself checks `America/New_York` and only runs provider calls from 09:30 through 16:00 Eastern on weekdays.

The initial watchlist is configured with the `WATCHLIST` variable in `wrangler.jsonc`.

## Market-data safety

The Worker caches provider results in D1 and enforces a daily provider-call ceiling with `MAX_PROVIDER_REQUESTS_PER_DAY`. This protects the initial free data plan from accidental overuse.

## Important

SignalForge is decision-support software. A BUY label is produced only when the critical Trend, Entry, Probability, and Risk/Reward gates all clear. It does not place trades or guarantee returns.
