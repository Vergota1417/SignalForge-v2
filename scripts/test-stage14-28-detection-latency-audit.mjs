import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateDetectionLatencyRows } from '../src/detection-latency.js';
import { broadDiscoveryCoverage, isBroadDiscoverySlot, isWeeklyResearchSlot } from '../src/scanner-schedule.js';

const t=Date.parse('2026-08-25T13:45:00Z'),m15=15*60_000;
const participation={criticalFailed:['entry'],participation:{pass:true,participationPass:true}};
const rows=[
  row('RADAR',t,100,.1,'QUIET'),
  row('RADAR',t+m15,100.5,.6,'MOVEMENT WATCH'),
  row('RADAR',t+2*m15,101,1.1,'EARLY MOVEMENT — BUILDING'),
  row('ANALYSIS',t+3*m15,101.2,1.2,'WAIT — SETUP NOT READY',{readiness:70,rr:1.9,gatesReady:3,payload:participation}),
  row('ANALYSIS',t+5*m15,102,2,'SETUP — READY SOON',{readiness:85,rr:1.2,gatesReady:3,payload:participation}),
  row('ANALYSIS',t+6*m15,101.8,1.8,'SETUP — READY SOON',{readiness:83,rr:.35,gatesReady:3,payload:participation}),
  row('RADAR',t+100*60_000,102.5,2.5,'EARLY MOVEMENT — BUILDING')
];
const audit=evaluateDetectionLatencyRows(rows,{symbol:'BAC',lookbackDays:3,now:t+2*60*60_000});
assert.equal(audit.assessment.detection.code,'READY_LATE');
assert.equal(audit.assessment.execution.code,'NO_BUY_RR_BLOCKED');
assert.equal(audit.latency.movementToReadyMinutes,60);
assert.ok(audit.latency.observedMoveConsumedBeforeReadyRate>.7);
assert.equal(audit.assessment.validBuyMissed,null,'late price movement must not be mislabeled as a proven missed valid BUY');
assert.ok(audit.findings.some(x=>x.code==='READY_LATE'));
assert.equal(audit.dataPolicy.providerRequests,0);

const missed=evaluateDetectionLatencyRows([row('RADAR',t,101.4,1.4,'QUIET'),row('RADAR',t+m15,101.8,1.8,'QUIET')],{symbol:'BAC'});
assert.equal(missed.assessment.detection.code,'MOVEMENT_TRIGGER_MISSED');

const eligible=evaluateDetectionLatencyRows([row('RADAR',t,100,.2,'MOVEMENT WATCH'),row('ANALYSIS',t+m15,100.2,.4,'SETUP — READY SOON',{readiness:95,rr:2,gatesReady:4,allGates:true,payload:{participation:{pass:true,participationPass:true}}})],{symbol:'BAC'});
assert.equal(eligible.assessment.execution.code,'POSSIBLE_MISSED_VALID_BUY');
assert.equal(eligible.assessment.validBuyMissed,'POSSIBLE_ENGINE_INCONSISTENCY');

assert.equal(isBroadDiscoverySlot('Tue',585),true);
assert.equal(isBroadDiscoverySlot('Tue',590),false);
assert.equal(isBroadDiscoverySlot('Fri',585),true,'Friday broad discovery must start at 09:45 with the rest of the week');
assert.equal(isBroadDiscoverySlot('Fri',930),true,'Friday broad discovery must remain active through 15:30');
assert.equal(isWeeklyResearchSlot('Fri',840),false,'weekly research must not displace live Friday afternoon discovery');
assert.equal(isWeeklyResearchSlot('Sat',675),true,'weekly research should begin Saturday after the live week is complete');
const coverage=broadDiscoveryCoverage();
assert.equal(coverage.startEt,'09:45');
assert.equal(coverage.endEt,'15:30');
assert.equal(coverage.extendedHours,false);
assert.equal(coverage.fridayBroadDiscovery,true);
assert.equal(coverage.maxScheduledRadarQuoteRequestsPerMarketDay,135);
assert.match(coverage.weeklyResearchWindow,/Sat/);

const evidence=fs.readFileSync(new URL('../src/evidence.js',import.meta.url),'utf8');
const latency=fs.readFileSync(new URL('../src/detection-latency.js',import.meta.url),'utf8');
const scheduler=fs.readFileSync(new URL('../src/scheduler.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');
const dormantUi=fs.readFileSync(new URL('../public/detection-latency-ui.js',import.meta.url),'utf8');
assert.match(evidence,/import \{ MIN_BUY_REWARD_RISK \} from '\.\/hard-guardrails\.js'/,'evidence must consume the authoritative 1.80:1 BUY policy');
assert.match(evidence,/rewardRiskMin:MIN_BUY_REWARD_RISK/,'evidence must persist the authoritative BUY threshold');
assert.match(latency,/rewardRiskMin:MIN_BUY_REWARD_RISK/,'Stage 14.28 must consume the same authoritative BUY threshold');
assert.match(scheduler,/isBroadDiscoverySlot\(weekday,minutes\)/,'central scheduler must own broad discovery timing');
assert.match(entry,/runScheduledCycle/,'production entry must delegate scheduled work to the central scheduler');
assert.match(dormantUi,/Missed Opportunity Audit/,'detection-latency UI implementation must remain available for later block-by-block reintroduction');
console.log('Stage 14.28 detection latency audit regression passed');

function row(type,at,price,changePct,status,o={}){const all=o.allGates===true;return{id:Math.round(at/1000),symbol:'BAC',observationType:type,source:type==='RADAR'?'scheduled-radar':'screener-promotion',observedAt:at,price,changePct,status,readiness:o.readiness??null,rr:o.rr??null,gatesReady:o.gatesReady??0,gateTotal:4,trendReady:all?1:0,entryReady:all?1:0,probabilityReady:all?1:0,riskRewardReady:all?1:0,payloadJson:JSON.stringify(o.payload||{})};}
