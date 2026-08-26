import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAlpacaQuote } from '../src/market-quote-gateway.js';
import { cachePolicyFor, cacheProviderMatches, cacheSourceTag, candleFreshness, parseCacheSource, quoteFreshness, quoteUsableForDiscovery, summarizeFeedHealth } from '../src/data-freshness.js';

const tag=cacheSourceTag({provider:'alpaca',feed:'iex',dataTimestamp:123456});
assert.deepEqual(parseCacheSource(tag),{provider:'alpaca',providerLabel:'Alpaca',feed:'iex',dataTimestamp:123456,legacy:false},'cache identity must preserve provider/feed/data timestamp');
assert.equal(cacheProviderMatches('alpaca',tag),true);
assert.equal(cacheProviderMatches('twelve-data',tag),false,'explicit provider requests must not reuse another provider cache');
assert.equal(cacheProviderMatches('auto',tag),true,'auto mode may reuse a valid shared provider cache');
assert.equal(parseCacheSource('Twelve Data').provider,'twelve-data','legacy cache source rows must remain readable');

const executionPolicy=cachePolicyFor('5D',{purpose:'execution-confirmation-15m'}),readPolicy=cachePolicyFor('5D',{purpose:'market-detail-read'});
assert.equal(executionPolicy.staleIfErrorMs,0,'execution-sensitive paths must never use stale-on-error candles');
assert.ok(readPolicy.staleIfErrorMs>readPolicy.ttlMs,'non-executable reads may use bounded stale-on-error cache');
assert.equal(candleFreshness({fetchedAt:1000,dataTimestamp:1000,cached:true,ttlMs:5000,now:2000}).state,'CACHED');
assert.equal(candleFreshness({fetchedAt:1000,dataTimestamp:1000,cached:true,ttlMs:5000,now:20_000,staleFallback:true}).state,'STALE');

const regularNow=Date.UTC(2026,7,26,18,30,0);
assert.equal(quoteFreshness({dataTimestamp:regularNow-30_000,feed:'iex',now:regularNow}).state,'FRESH');
assert.equal(quoteFreshness({dataTimestamp:regularNow-4*60_000,feed:'iex',now:regularNow}).state,'LAGGING');
assert.equal(quoteFreshness({dataTimestamp:regularNow-10*60_000,feed:'iex',now:regularNow}).state,'STALE');
assert.equal(quoteFreshness({dataTimestamp:regularNow-30_000,feed:'delayed_sip',now:regularNow}).state,'DELAYED');
assert.equal(quoteUsableForDiscovery({state:'STALE'}),false,'stale quotes must not create new discovery evidence');
assert.equal(quoteUsableForDiscovery({state:'LAGGING'}),true,'temporarily lagging quotes may remain visible without being treated as permanently invalid');

const bars=Array.from({length:20},(_,i)=>({t:`2026-07-${String(i+1).padStart(2,'0')}T20:00:00Z`,v:1_000_000}));
const snapshot={latestTrade:{p:105,t:'2026-08-26T18:29:30Z'},dailyBar:{c:104.5,v:2_000_000,t:'2026-08-26T18:29:00Z'},prevDailyBar:{c:100}};
const quote=buildAlpacaQuote('TEST',snapshot,bars,{feed:'iex',now:regularNow});
assert.equal(quote.provider,'alpaca');
assert.equal(quote.feed,'iex');
assert.equal(quote.freshness.state,'FRESH');
assert.equal(quote.dataAgeMs,30_000);
const feedHealth=summarizeFeedHealth([quote],regularNow);
assert.deepEqual(feedHealth.byProvider,{alpaca:1});
assert.deepEqual(feedHealth.byFeed,{'alpaca:iex':1});

const gateway=fs.readFileSync(new URL('../src/market-data-gateway.js',import.meta.url),'utf8');
const twelve=fs.readFileSync(new URL('../src/twelve-data-provider.js',import.meta.url),'utf8');
const quoteGateway=fs.readFileSync(new URL('../src/market-quote-gateway.js',import.meta.url),'utf8');
const radar=fs.readFileSync(new URL('../src/radar.js',import.meta.url),'utf8');
const quarantine=fs.readFileSync(new URL('../src/discovery-quarantine.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/marketpulse-opportunities-ui.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const analysis=fs.readFileSync(new URL('../src/analysis.js',import.meta.url),'utf8');

assert.match(gateway,/cacheProviderMatches\(provider,cached\.source\)/,'candle cache reuse must respect explicit provider selection');
assert.match(gateway,/staleCandidate&&!policy\.executionSensitive/,'stale-on-error candle fallback must be blocked for execution-sensitive purposes');
assert.match(gateway,/fallbackDetail\(failures\[0\]\.provider/,'provider fallback reason must be retained');
assert.match(gateway,/cacheSourceTag\(\{provider:'alpaca',feed,dataTimestamp\}\)/,'Alpaca candle cache must persist feed identity and data timestamp');
assert.match(twelve,/cacheSourceTag\(\{provider:'twelve-data',feed,dataTimestamp\}\)/,'Twelve Data candle cache must persist compatible feed identity');
assert.match(quoteGateway,/latestTrade\?\.t/,'Alpaca quote freshness must use provider timestamps rather than request time');
assert.match(quoteGateway,/payload\.timestamp/,'Twelve Data quote freshness must use provider timestamp when available');
assert.match(quoteGateway,/fallback:fallbackDetail\('alpaca'/,'Twelve fallback rows must explain that Alpaca was the failed primary');
assert.match(radar,/quoteUsableForDiscovery\(rawQuote\.freshness\)/,'radar must reject explicitly stale quote evidence before scoring');
assert.match(quarantine,/status===404\|\|message\.includes\('symbol not found'\)\|\|message\.includes\('invalid symbol'\)/,'stale quote errors must not expand permanent symbol quarantine criteria');
assert.match(entry,/url\.pathname==='\/api\/screener'/,'production screener response must be enriched with provider/feed freshness');
assert.match(entry,/marketDataFeedHealth:summarizeFeedHealth\(recentQuotes\)/,'health must expose recent provider/feed health from D1 quotes');
assert.match(entry,/staleMarketDataCannotAuthorizeBuy:true/,'health must declare the stale-data BUY firewall');
assert.match(ui,/dataFreshness/,'MarketPulse cards must render freshness state');
assert.match(ui,/dataFallback\?\.used/,'MarketPulse cards must mark fallback provider rows');
assert.match(ui,/Alpaca/,'MarketPulse cards must render provider identity');
assert.match(sw,/signalforge-shell-v30-40/,'freshness UI release must advance the PWA shell');
assert.match(sw,/signalforge-api-snapshots-v4/,'freshness response release must invalidate old API snapshots');
assert.match(build,/version:'2\.30\.40'/);
assert.match(build,/shell:'v30-40'/);
assert.equal(pkg.version,'2.30.40','package version must match the freshness UI release');
assert.match(analysis,/dailyGatesReady&&hardBuyGuardrails\.pass\)\{status='BUY NOW'/,'provider freshness work must not replace existing BUY authorization');

console.log('Stage 15.9 provider freshness and intelligent cache checks passed.');
