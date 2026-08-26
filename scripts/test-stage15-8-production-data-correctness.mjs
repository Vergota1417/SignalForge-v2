import assert from 'node:assert/strict';
import fs from 'node:fs';
import { composeDiscoveryExtension, discoveryPoolTarget } from '../src/discovery.js';
import { discoveryPoolSize } from '../src/scanner-budget.js';
import { normalizeProbabilityPercent, tradeConfidenceFor } from '../src/screener.js';

assert.equal(discoveryPoolTarget({}),500,'production discovery target must default to 500');
assert.equal(discoveryPoolTarget({DISCOVERY_POOL_SIZE:'750'}),750);
assert.equal(discoveryPoolTarget({DISCOVERY_POOL_SIZE:'2000'}),1000,'production discovery target must remain capped at 1000');
assert.equal(discoveryPoolTarget({DISCOVERY_POOL_SIZE:'50'}),120,'production discovery target must retain the 120-symbol reliability floor');
assert.equal(discoveryPoolSize({DISCOVERY_POOL_SIZE:'625'}),625,'scanner target must share discovery.js source of truth');

const existing=Array.from({length:120},(_,i)=>`E${i}`);
const exploration=Array.from({length:500},(_,i)=>`X${i}`);
const extended=composeDiscoveryExtension(existing,{pinned:['E0','PIN'],core:['CORE'],promising:['HOT'],exploration,limit:500});
assert.equal(extended.length,500,'a frozen 120-symbol weekly pool must be extendable to the 500-symbol production target');
assert.deepEqual(extended.slice(0,120),existing,'weekly extension must preserve existing observations/order rather than replacing the week');
assert.equal(new Set(extended).size,extended.length,'weekly extension must never add duplicate symbols');
assert.ok(extended.includes('PIN')&&extended.includes('CORE')&&extended.includes('HOT'),'new pinned/core/promising candidates must be eligible for the extension');

assert.equal(normalizeProbabilityPercent(.625),62.5);
assert.equal(normalizeProbabilityPercent(62.5),62.5);
assert.equal(normalizeProbabilityPercent(-.1),null);
assert.equal(normalizeProbabilityPercent(101),null);
const base={readiness:70,status:'WAIT — SETUP NOT READY',engines:{trend:{ready:true},entry:{ready:true},probability:{ready:true},riskReward:{ready:false}},dailyGatesReady:false,intradayConfirmation:{pass:false,participationPass:false},hardBuyGuardrails:{pass:false}};
assert.equal(tradeConfidenceFor({...base,calibratedProbability:.625}),tradeConfidenceFor({...base,calibratedProbability:62.5}),'probability storage units must not change user-facing Trade Confidence');

const discovery=fs.readFileSync(new URL('../src/discovery.js',import.meta.url),'utf8');
const scanner=fs.readFileSync(new URL('../src/scanner-budget.js',import.meta.url),'utf8');
const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');
const analysis=fs.readFileSync(new URL('../src/analysis.js',import.meta.url),'utf8');

assert.match(discovery,/existingSymbols\.length>=capped/,'existing weekly pool must be compared with the requested target');
assert.match(discovery,/composeDiscoveryExtension\(existingSymbols/,'existing weekly pool must extend in place');
assert.match(discovery,/currentWeeklyPoolSize,configuredPoolSize,poolFillPct/,'discovery status must expose real current-week coverage');
assert.match(scanner,/return discoveryPoolTarget\(env\)/,'scanner must use the centralized pool target');
assert.match(scanner,/Math\.min\(6,Number\(limit\)\|\|6\)/,'deep scanner batch must remain capped at six');
assert.match(screener,/discoveryTarget=discoveryPoolTarget\(env\)/,'screener coverage must use configured discovery target');
assert.match(screener,/getDiscoveryPool\(env,\{limit:discoveryTarget,now\}\)/,'screener must no longer request the legacy 120-symbol pool');
assert.doesNotMatch(screener,/getDiscoveryPool\(env,\{limit:120\}\)/,'legacy screener 120-symbol ceiling must not return');
assert.match(screener,/normalizeProbabilityPercent/,'Trade Confidence must explicitly normalize probability units');
assert.match(entry,/discoveryPoolSize:discovery\.configuredPoolSize/,'health must override the legacy 120 readout with the configured target');
assert.match(entry,/discoveryCoverage:\{weekKey:discovery\.weekKey,configuredPoolSize:discovery\.configuredPoolSize,currentWeeklyPoolSize:discovery\.currentWeeklyPoolSize,poolFillPct:discovery\.poolFillPct/,'health must expose current-week pool fill and freshness diagnostics');
assert.match(entry,/hardBuyAuthorization:true/,'production health must continue declaring hard BUY authorization');
assert.match(analysis,/dailyGatesReady&&hardBuyGuardrails\.pass\)\{status='BUY NOW'/,'BUY NOW must remain directly gated by the existing hard guardrails');

console.log('Stage 15.8 production data/score correctness checks passed.');
