import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTradePlan } from '../src/trade-plan.js';
import { evaluateManagedPosition } from '../src/position-manager.js';

const ready={ready:true,metrics:[]};
const candidate={
  symbol:'TEST',status:'BUY NOW',readiness:94,latest:{close:100},preferredEntryLow:98,preferredEntryHigh:101,overextension:105,thesisBreak:95,target:110,rsi:58,rr:2,
  structure:{targetSource:'nearest pivot resistance'},benchmark:{latest:500,bull:true,riskOff:false},wf:{sample:12,winRate:.62,avgReturn:.04},
  engines:{trend:ready,entry:ready,probability:ready,riskReward:ready},intradayConfirmation:{pass:true,participationPass:true,passes:4,total:5},hardBuyGuardrails:{pass:true,minRewardRisk:1.8}
};
const plan=buildTradePlan(candidate);
assert.equal(plan.state,'OPEN','BUY NOW with hard authorization and 2:1 R/R should create an open trade plan');
assert.equal(plan.hardAuthorized,true);
assert.ok(plan.entry.doNotEnterAbove>100&&plan.entry.doNotEnterAbove<101,'do-not-enter price should preserve the 1.80:1 floor and execution zone');
assert.equal(plan.risk.stop,95);assert.equal(plan.targets.target1,110);assert.ok(plan.targets.target2>plan.targets.target1,'stretch target should only appear above the structure target');
assert.equal(plan.permissionRequired,'BUY NOW + HARD GUARDRAILS');
const legacyPlan=buildTradePlan({...candidate,hardBuyGuardrails:undefined});assert.equal(legacyPlan.state,'PREPARE','A legacy BUY label without hard authorization must never create an open plan');assert.ok(legacyPlan.blockers.includes('HARD BUY AUTHORIZATION'));
assert.equal(buildTradePlan({...candidate,status:'SETUP — READY SOON'}).state,'PREPARE','READY SOON must never be presented as an open buy plan');

const holdingAnalysis={...candidate,latest:{close:110},target:108,rr:0,status:'SETUP — READY SOON'};
const managed=evaluateManagedPosition(holdingAnalysis,{symbol:'TEST',entryPrice:100,shares:8,boughtAt:Date.now()-86400000});
assert.equal(managed.state,'TAKE PARTIAL PROFIT','reaching the saved structure target should trigger partial-profit management');assert.equal(managed.partial.fraction,.25);assert.equal(managed.partial.shares,2);assert.equal(managed.partial.remainingShares,6);
const exit=evaluateManagedPosition({...holdingAnalysis,latest:{close:94},status:'SELL / EXIT'},{symbol:'TEST',entryPrice:100,shares:8});assert.equal(exit.state,'SELL / EXIT','thesis failure must outrank partial-profit management');

const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');assert.match(entry,/url\.pathname==='\/api\/trade-plan'/,'Worker entry must expose the trade-plan endpoint');assert.match(entry,/runPortfolioPricePulse\(env,\{maxPositions:1/,'spare five-minute lane must rotate one owned position');assert.match(entry,/app\.scheduled\(controller,env,ctx\)/,'candidate scheduler must continue running alongside the owned-position pulse');
const weekly=fs.readFileSync(new URL('../src/weekly.js',import.meta.url),'utf8');assert.match(weekly,/purpose:'portfolio-price-pulse-5m'/,'owned-position monitor must use the bounded 5-minute price feed');assert.doesNotMatch(weekly,/recordAnalysisEvidence\(env,analysis,\{source:'portfolio-price-pulse/,'five-minute position pulses must not inflate full-model evidence');
const push=fs.readFileSync(new URL('../src/push.js',import.meta.url),'utf8');assert.match(push,/TAKE PARTIAL PROFIT/,'partial-profit state must be push-alert eligible');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');assert.match(pwa,/trade-plan-ui\.js/,'PWA must load the trade plan card');
const ui=fs.readFileSync(new URL('../public/trade-plan-ui.js',import.meta.url),'utf8');assert.match(ui,/I Bought \/ Record Buy/,'trade plan must provide a direct record-buy handoff');assert.match(ui,/signalforge_capital_plan_v1/,'trade sizing must reuse the private on-device risk plan');
console.log('Stage 14.20 trade plan + hard authorization + post-buy manager regression passed.');
