import assert from 'node:assert/strict';
import fs from 'node:fs';
import { configuredProviders } from '../src/market.js';

const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');
const scheduler=fs.readFileSync(new URL('../src/scheduler.js',import.meta.url),'utf8');

const alpacaOnly={ALPACA_API_KEY_ID:'a',ALPACA_API_SECRET_KEY:'b'};
const twelveOnly={TWELVE_DATA_API_KEY:'c'};
const both={...alpacaOnly,...twelveOnly};
const none={};

assert.deepEqual(configuredProviders(alpacaOnly),{alpaca:true,twelveData:false,preferred:'auto'});
assert.deepEqual(configuredProviders(twelveOnly),{alpaca:false,twelveData:true,preferred:'auto'});
assert.deepEqual(configuredProviders(both),{alpaca:true,twelveData:true,preferred:'auto'});
assert.deepEqual(configuredProviders(none),{alpaca:false,twelveData:false,preferred:'auto'});

assert.match(entry,/configuredProviders/,'health must consume the provider gateway configuration');
assert.match(entry,/marketDataConfigured=Boolean\(marketDataProviders\.alpaca\|\|marketDataProviders\.twelveData\)/,'health must treat Alpaca-only and Twelve-only deployments as configured');
assert.match(entry,/marketDataProviders/,'health must expose configured/preferred provider state');
assert.doesNotMatch(entry,/marketDataConfigured:Boolean\(env\.TWELVE_DATA_API_KEY\)/,'health must not use Twelve Data as the sole readiness switch');

assert.match(scheduler,/configuredProviders/,'scheduler must consume the provider gateway configuration');
assert.match(scheduler,/marketDataConfigured=Boolean\(marketDataProviders\.alpaca\|\|marketDataProviders\.twelveData\)/,'scheduler must allow Alpaca-only runtime activation');
assert.match(scheduler,/status:marketDataConfigured\?'OK':'IDLE'/,'no-provider cron heartbeats must be explicitly idle');
assert.match(scheduler,/if\(!marketDataConfigured\)return/,'scheduler must safely do no market work with zero configured providers');
assert.doesNotMatch(scheduler,/if\(!env\.TWELVE_DATA_API_KEY\)return/,'scheduler must not require Twelve Data specifically');

console.log('Stage 15.4 provider-neutral runtime activation checks passed.');
