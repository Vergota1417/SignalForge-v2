import assert from 'node:assert/strict';
import { wildersAtr, wildersRsi, structureLevels } from '../src/analysis.js';
import { calculatePositionSizing } from '../src/strategy.js';

const rising=Array.from({length:40},(_,i)=>100+i*.5);
const rsi=wildersRsi(rising,14);
assert.ok(rsi>70&&rsi<=100,'Persistent gains should produce a high Wilder RSI.');

const atrCandles=Array.from({length:40},(_,i)=>({open:100+i*.2,high:102+i*.2,low:99+i*.2,close:101+i*.2,time:Date.UTC(2026,0,i+1),volume:1000}));
const atr=wildersAtr(atrCandles,14);
assert.ok(atr>0&&Number.isFinite(atr),'Wilder ATR must resolve to a positive finite value.');

const unresolved=Array.from({length:80},(_,i)=>({high:100+i*.1,low:98+i*.1,close:99+i*.1,time:Date.UTC(2026,0,i+1),volume:1000}));
unresolved[79]={...unresolved[79],high:unresolved[78].high-.2,close:unresolved[78].close-.3};
const unresolvedStructure=structureLevels(unresolved,2);
assert.equal(unresolvedStructure.target,null,'Structure engine must not manufacture an upside target when no resistance or breakout measured move is available.');

const breakout=Array.from({length:80},(_,i)=>({high:100+i*.05,low:97+i*.03,close:99+i*.04,time:Date.UTC(2026,0,i+1),volume:1000}));
const priorHigh=Math.max(...breakout.slice(0,-1).map(c=>c.high));
breakout[79]={...breakout[79],high:priorHigh+2,close:priorHigh+1.5};
const breakoutStructure=structureLevels(breakout,2);
assert.ok(breakoutStructure.target>breakout[79].close,'A real breakout may use a measured-move target above the prior resistance.');
assert.equal(breakoutStructure.targetSource,'measured move above prior resistance');

const sizing=calculatePositionSizing({accountEquity:10000,availableCash:1200,maxRiskPct:.005,maxPositionPct:.20,entryPrice:100,stopPrice:94});
assert.ok(sizing.shares>=0,'Sizing must never produce negative shares.');
assert.ok(sizing.positionValue<=1200,'Sizing must never exceed deployable cash.');
assert.ok(sizing.positionValue<=2000,'Sizing must never exceed max position exposure.');
assert.ok(sizing.plannedRisk<=50,'Sizing must never exceed the risk budget.');

assert.equal(calculatePositionSizing({accountEquity:10000,availableCash:1000,entryPrice:100,stopPrice:100}),null,'Invalid zero-risk stop must not produce a position size.');

console.log('phase3 regression tests passed');
