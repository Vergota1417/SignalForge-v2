import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAlpacaQuote } from '../src/market-quote-gateway.js';
import { scoreQuote } from '../src/radar.js';

const bars=Array.from({length:20},(_,i)=>({t:`2026-07-${String(i+1).padStart(2,'0')}T20:00:00Z`,v:1_000_000}));
const snapshot={latestTrade:{p:105},dailyBar:{c:104.5,v:2_000_000,t:'2026-08-26T14:00:00Z'},prevDailyBar:{c:100}};
const quote=buildAlpacaQuote('TEST',snapshot,bars);
assert.equal(quote.symbol,'TEST');
assert.equal(quote.price,105);
assert.ok(Math.abs(quote.changePct-5)<1e-9,'change percent must use previous daily close');
assert.equal(quote.averageVolume,1_000_000,'RVOL baseline must use historical completed daily volume');
assert.equal(quote.relativeVolume,2,'relative volume must compare current daily volume with historical average');
assert.equal(quote.source,'Alpaca');
assert.ok(Number.isFinite(scoreQuote(quote)),'existing radar score must accept provider-neutral quote output');
assert.equal(buildAlpacaQuote('TEST',null,bars),null,'missing provider snapshot must not fabricate a quote');

const gateway=fs.readFileSync(new URL('../src/market-quote-gateway.js',import.meta.url),'utf8');
const radar=fs.readFileSync(new URL('../src/radar.js',import.meta.url),'utf8');
assert.match(gateway,/\/v2\/stocks\/snapshots/,'quote gateway must batch current snapshots');
assert.match(gateway,/\/v2\/stocks\/bars/,'quote gateway must batch historical daily volume');
assert.match(gateway,/symbols.*join\(','\)/s,'Alpaca quote gateway must send multiple symbols in one provider request');
assert.match(gateway,/next_page_token/,'multi-symbol bars must handle provider pagination');
assert.match(gateway,/getTwelveDataQuotes/,'Twelve Data fallback must remain available');
assert.match(radar,/getMarketQuotes/,'radar must consume the provider-neutral quote gateway');
assert.doesNotMatch(radar,/api\.twelvedata\.com\/quote/,'radar must not make direct Twelve Data quote requests');
assert.doesNotMatch(radar,/reserveProviderPurpose/,'provider quota details must be isolated from radar scoring logic');
assert.match(radar,/const discoveryScore=scoreQuote\(rawQuote\)/,'existing discovery scoring must remain in radar rather than provider code');

console.log('Stage 15.3 provider-neutral batch quote gateway checks passed.');
