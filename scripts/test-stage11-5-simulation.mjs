import assert from 'node:assert/strict';
import { aggregateTradeMetrics, benchmarkPerformance, curveDrawdown, downsampleEquityCurve, modelCohortMetrics } from '../src/simulation-metrics.js';

const trades=[];for(let i=0;i<150;i++)trades.push({pnl:i%3===0?-5:10,pnlPct:i%3===0?-.05:.1,modelVersion:i<120?'v2.26':'v2.27'});
const lifetime=aggregateTradeMetrics(trades);assert.equal(lifetime.totalTrades,150,'lifetime metrics must not inherit the recent-trade UI limit');assert.equal(lifetime.wins,100);assert.equal(lifetime.losses,50);assert.ok(lifetime.realizedPnl>0);
const cohorts=modelCohortMetrics(trades);assert.equal(cohorts.length,2);assert.equal(cohorts[0].modelVersion,'v2.26');assert.equal(cohorts[0].totalTrades,120);
const curve=Array.from({length:5000},(_,i)=>({equity:300+i*.2+(i%97===0?-20:0),createdAt:1_700_000_000_000+i*900000}));const sampled=downsampleEquityCurve(curve,1200);assert.ok(sampled.length<=1200);assert.deepEqual(sampled[0],curve[0]);assert.deepEqual(sampled.at(-1),curve.at(-1));assert.ok(curveDrawdown(curve)<0);
assert.deepEqual(benchmarkPerformance({strategyReturn:.12,benchmarkReturn:.08}),{strategyReturn:.12,benchmarkReturn:.08,excessReturn:.039999999999999994});assert.equal(benchmarkPerformance({strategyReturn:.1}).excessReturn,null);
console.log('Stage 11.5 simulation hardening tests passed.');
