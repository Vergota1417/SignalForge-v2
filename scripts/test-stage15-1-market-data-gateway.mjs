import assert from 'node:assert/strict';
import fs from 'node:fs';
import { alpacaTimeframe, configuredProviders, dedupeAndSortCandles, minimumHistory, normalizeProvider, providerOrder, validCandle } from '../src/market-data-gateway.js';

assert.equal(normalizeProvider('alpaca'),'alpaca');
assert.equal(normalizeProvider('twelve'),'twelve-data');
assert.equal(normalizeProvider('bogus'),'auto');
assert.deepEqual(providerOrder('auto',{ALPACA_API_KEY_ID:'a',ALPACA_API_SECRET_KEY:'b',TWELVE_DATA_API_KEY:'c'}),['alpaca','twelve-data'],'auto must prefer Alpaca and preserve Twelve Data fallback');
assert.deepEqual(providerOrder('auto',{TWELVE_DATA_API_KEY:'c'}),['twelve-data'],'legacy Twelve Data-only deployments must remain supported');
assert.deepEqual(providerOrder('alpaca',{}),['alpaca'],'explicit provider selection must not silently switch providers');
assert.deepEqual(configuredProviders({ALPACA_API_KEY_ID:'a',ALPACA_API_SECRET_KEY:'b',TWELVE_DATA_API_KEY:'c'}),{alpaca:true,twelveData:true,preferred:'auto'});

for(const timeframe of ['1D','5D','1M','3M','6M','1Y','2Y']){
  const cfg=alpacaTimeframe(timeframe);
  assert.ok(cfg.timeframe,'every supported SignalForge timeframe must map to an Alpaca timeframe');
  assert.equal(cfg.minimum,minimumHistory(timeframe),'provider minimum history must match SignalForge history requirements');
}

const good={time:1000,open:10,high:12,low:9,close:11,volume:100};
assert.equal(validCandle(good),true);
assert.equal(validCandle({...good,high:8}),false,'invalid OHLC geometry must be rejected');
const rows=dedupeAndSortCandles([{...good,time:2000,close:11.5},{...good,time:1000},{...good,time:2000,close:11.75}]);
assert.equal(rows.length,2,'duplicate timestamps must collapse to one candle');
assert.deepEqual(rows.map(x=>x.time),[1000,2000],'candles must be sorted ascending');
assert.equal(rows[1].close,11.75,'latest valid duplicate value must win deterministically');

const compatibility=fs.readFileSync(new URL('../src/market.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../src/market-data-gateway.js',import.meta.url),'utf8');
const twelve=fs.readFileSync(new URL('../src/twelve-data-provider.js',import.meta.url),'utf8');
assert.match(compatibility,/getCandles/,'legacy market entry point must delegate candle reads to the gateway');
assert.match(compatibility,/searchMarketSymbols/,'legacy market entry point must delegate symbol search to the gateway');
assert.doesNotMatch(compatibility,/api\.twelvedata\.com/,'compatibility layer must not contain provider-specific network calls');
assert.match(gateway,/twelve-data-provider\.js/,'gateway must isolate Twelve Data behind its provider adapter');
assert.match(gateway,/data\.alpaca\.markets/,'gateway must provide Alpaca candle support');
assert.match(gateway,/putCachedMarket/,'Alpaca results must enter the shared D1 market cache');
assert.match(gateway,/getCachedMarket/,'provider requests must consult the shared cache before network use');
assert.match(twelve,/reserveProviderPurpose/,'legacy Twelve Data quota accounting must remain intact');
assert.match(twelve,/completedOnly/,'legacy completed-candle reliability behavior must remain intact');

console.log('Stage 15.1 provider-agnostic market data gateway checks passed.');
