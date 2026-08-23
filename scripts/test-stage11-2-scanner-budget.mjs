import assert from 'node:assert/strict';
import { allocationForLimit, classifyScannerUniverse, selectTieredSymbols } from '../src/scanner-budget.js';

const now=Date.UTC(2026,7,24,15,0,0);
const stat=(symbol,overrides={})=>({symbol,lastScanned:now-2*60*60*1000,scanCount:4,rollingScore:5,scoreVelocity:0,dollarVolume:3_000_000,relativeVolume:1,...overrides});
const pool=['HOT1','HOT2','HOT3','ACTIVE1','ACTIVE2','EXP1','EXP2'];
const stats=new Map([
  ['HOT1',stat('HOT1',{rollingScore:70,relativeVolume:2.0,scoreVelocity:12,dollarVolume:50_000_000})],
  ['HOT2',stat('HOT2',{rollingScore:55,relativeVolume:1.7,dollarVolume:30_000_000})],
  ['HOT3',stat('HOT3',{rollingScore:45,dollarVolume:20_000_000})],
  ['ACTIVE1',stat('ACTIVE1',{rollingScore:20,relativeVolume:1.2,dollarVolume:20_000_000})],
  ['ACTIVE2',stat('ACTIVE2',{rollingScore:15,dollarVolume:12_000_000})]
]);
const classified=classifyScannerUniverse(pool,stats,{now});
assert.deepEqual(classified.hot.map(x=>x.symbol),['HOT1','HOT2','HOT3']);
assert.deepEqual(classified.active.map(x=>x.symbol),['ACTIVE1','ACTIVE2']);
assert.deepEqual(classified.explore.map(x=>x.symbol),['EXP1','EXP2']);
assert.deepEqual(allocationForLimit(5),{hot:2,active:2,explore:1});

const picked=selectTieredSymbols(classified,{limit:5,exploreCursor:0,now});
assert.equal(picked.symbols.length,5);
assert.equal(picked.selected.hot.length,2,'A five-symbol batch should reserve capacity rather than consuming all slots with HOT names.');
assert.equal(picked.selected.active.length,2);
assert.equal(picked.selected.explore.length,1,'Every normal five-symbol scanner cycle should preserve one exploration slot when exploration names exist.');
assert.equal(picked.selected.explore[0],'EXP1');

const recentHot=classified.hot.map(x=>({...x,lastScanned:now-10*60*1000}));
const dueMix=selectTieredSymbols({...classified,hot:recentHot},{limit:5,exploreCursor:1,now});
assert.ok(!dueMix.selected.hot.includes('HOT1'),'HOT symbols inside the minimum recheck interval should not be immediately rescanned.');
assert.ok(dueMix.selected.explore.includes('EXP2'),'Exploration cursor should rotate instead of repeatedly checking the same unexplored symbol.');

const manyHot=Array.from({length:20},(_,i)=>`H${i}`),manyStats=new Map(manyHot.map((s,i)=>[s,stat(s,{rollingScore:80-i,relativeVolume:2,dollarVolume:50_000_000})]));
const capped=classifyScannerUniverse(manyHot,manyStats,{now});
assert.equal(capped.hot.length,12,'HOT tier must stay bounded so it cannot crowd out the rest of the universe.');

console.log('Stage 11.2 scanner-budget regression tests passed');
