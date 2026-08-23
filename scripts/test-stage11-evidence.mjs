import assert from 'node:assert/strict';
import { ANALYSIS_MODEL_VERSION, analysisEvidenceRow, radarEvidenceRow } from '../src/evidence.js';

const now=Date.UTC(2026,7,24,15,30,0);
const radar=radarEvidenceRow({symbol:'nvda',name:'NVIDIA',exchange:'NASDAQ',price:180,changePct:2.4,volume:20_000_000,averageVolume:10_000_000,relativeVolume:2,rollingDiscoveryScore:68,scoreVelocity:11,dollarVolume:3_600_000_000},{now});
assert.equal(radar.symbol,'NVDA');
assert.equal(radar.observationType,'RADAR');
assert.equal(radar.relativeVolume,2);
assert.equal(radar.discoveryScore,68);
assert.equal(radar.scoreVelocity,11);
assert.equal(radar.observedBucket%900_000,0,'Evidence must be idempotent within a 15-minute bucket.');

const engine=ready=>({ready});
const analysis=analysisEvidenceRow({
  symbol:'NVDA',latest:{close:181},changePct:.02,status:'SETUP — READY SOON',readiness:78,
  engines:{trend:engine(true),entry:engine(false),probability:engine(true),riskReward:engine(true)},
  preferredEntryLow:176,preferredEntryHigh:181,overextension:184,thesisBreak:169,target:201,rr:2.3,
  benchmark:{symbol:'SPY',bull:true,riskOff:false},criticalFailed:['ENTRY'],wf:{sample:22,winRate:.61,avgReturn:.034},relativeStrength20:.06,rsi:62
},{source:'test',timeframe:'6M',now});
assert.equal(analysis.modelVersion,ANALYSIS_MODEL_VERSION);
assert.equal(analysis.gatesReady,3);
assert.equal(analysis.gateTotal,4);
assert.equal(analysis.entryReady,false);
assert.equal(analysis.trendReady,true);
assert.equal(analysis.preferredEntryLow,176);
assert.equal(analysis.thesisBreak,169);
assert.equal(analysis.target,201);
assert.equal(analysis.payload.wf.sample,22);
assert.deepEqual(analysis.payload.criticalFailed,['ENTRY']);

console.log('Stage 11 evidence regression tests passed');
