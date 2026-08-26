import assert from 'node:assert/strict';
import fs from 'node:fs';
import { composeDiscoveryPool } from '../src/discovery.js';
import { allocationForLimit, discoveryPoolSize, selectTieredSymbols } from '../src/scanner-budget.js';

assert.equal(discoveryPoolSize({}),500,'default discovery pool must expand materially beyond the legacy 120 symbols');
assert.equal(discoveryPoolSize({DISCOVERY_POOL_SIZE:'750'}),750);
assert.equal(discoveryPoolSize({DISCOVERY_POOL_SIZE:'5000'}),1000,'configured discovery pool must remain bounded');
assert.equal(discoveryPoolSize({DISCOVERY_POOL_SIZE:'5'}),120,'configured discovery pool must not shrink below the reliability baseline');

const exploration=Array.from({length:700},(_,i)=>`S${String(i).padStart(4,'0')}`);
const pool=composeDiscoveryPool({pinned:['NVDA'],core:['AAPL','MSFT'],promising:['AMD'],exploration,limit:500});
assert.equal(pool.length,500,'discovery composition must support a 500-symbol pool');
assert.deepEqual(pool.slice(0,4),['NVDA','AAPL','MSFT','AMD'],'pinned/core/promising names must remain ahead of exploration');

const classified={hot:[],active:[],explore:Array.from({length:500},(_,i)=>({symbol:`X${i}`,lastScanned:0,scanCount:0,rollingScore:0,scoreVelocity:0,dollarVolume:0,relativeVolume:0,cooldownUntil:0}))};
const batch=selectTieredSymbols(classified,{limit:6,exploreCursor:0,now:Date.now(),allocation:allocationForLimit(6)});
assert.ok(batch.symbols.length<=6,'broader universe must not increase the deep scan batch above the existing six-symbol cap');

const discovery=fs.readFileSync(new URL('../src/discovery.js',import.meta.url),'utf8');
const scanner=fs.readFileSync(new URL('../src/scanner-budget.js',import.meta.url),'utf8');
assert.match(discovery,/listUsMarketAssets/,'discovery catalog must consume the provider-neutral U.S. market asset catalog');
assert.match(discovery,/source:'alpaca'/,'Alpaca catalog population must be explicitly tracked');
assert.match(discovery,/MAX_DISCOVERY_SIZE=1000/,'discovery pool expansion must remain bounded');
assert.match(scanner,/DEFAULT_POOL_SIZE=500/,'scanner must request the expanded discovery pool');
assert.match(scanner,/Math\.min\(6,Number\(limit\)\|\|6\)/,'deep scan batch cap must remain six');

console.log('Stage 15.2 expanded discovery universe checks passed.');
