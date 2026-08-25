import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDecisionEpisodes } from '../src/decision-episodes.js';
import { evaluateEvidenceRows } from '../src/evaluation.js';
import { buildSetupLeaderboard } from '../src/strategy-optimizer.js';
import { buildChallengerRule, compareChampionChallenger } from '../src/challenger.js';

const start=Date.parse('2026-08-24T14:00:00Z');
const rows=[
  row('AAA','BUY NOW',start,.03),
  row('AAA','BUY NOW',start+15*60_000,.04),
  row('AAA','BUY NOW',start+30*60_000,-.02),
  row('AAA','BUY NOW',start+45*60_000,.01),
  row('AAA','SETUP — READY SOON',start+60*60_000,.025),
  row('AAA','BUY NOW',start+75*60_000,.035),
  row('AAA','BUY NOW',start+75*60_000+37*60*60_000,.02),
  row('AAA','BUY NOW',start+75*60_000+37*60*60_000+15*60_000,.05,{modelVersion:'sf-analysis-v5-test'})
];
const episodes=buildDecisionEpisodes(rows);
assert.equal(episodes.length,5,'repeated same-state checks should collapse until a status/model change or >36-hour gap');
assert.equal(episodes[0].episodeObservations,4,'four 15-minute BUY checks should be one contiguous BUY episode');
assert.equal(episodes[0].forwardReturn,.03,'episode outcome must use the first causal observation instead of cherry-picking a later snapshot');
assert.equal(episodes.filter(x=>x.status==='BUY NOW').length,4,'contiguous diagnostics should still expose BUY->READY->BUY, long-gap BUY, and new-model BUY state episodes');

const evaluation=evaluateEvidenceRows(rows,{horizon:10,minSample:5});
assert.equal(evaluation.rawObservationSampleSize,8);
assert.equal(evaluation.contiguousDecisionEpisodeSampleSize,5);
assert.equal(evaluation.sampleSize,4,'later thesis-level validation may collapse repeated state re-entry more strictly than contiguous episode diagnostics');
assert.equal(evaluation.setupSampleSize,3);
assert.equal(evaluation.collapsedObservationCount,4);
assert.equal(evaluation.calibration.buySampleSize,3,'repeated checks and BUY state re-entry inside one setup thesis must not inflate calibration');
assert.equal(evaluation.calibration.eligible,false,'repeated checks must not reach a five-sample calibration threshold');
assert.match(evaluation.calibration.reason,/independent BUY setup samples/);
assert.match(evaluation.episodePolicy,/36 hours/);

const board=buildSetupLeaderboard(rows,{minSample:5});
const buySetup=board.find(x=>x.profile?.status==='BUY NOW');
assert.ok(buySetup,'BUY setup should remain visible in optimizer evidence');
assert.equal(buySetup.sampleSize,3,'optimizer must use independent BUY setup-state samples');
assert.equal(buySetup.qualified,false,'three independent BUY setup samples must not qualify at a five-sample threshold');

const repeated=Array.from({length:30},(_,i)=>row('ONE','BUY NOW',start+i*15*60_000,.04));
const challengerRule=buildChallengerRule({statuses:['BUY NOW'],minReadiness:80,minRvol:1.5,minGates:4,requireStrongSector:true});
const repeatedComparison=compareChampionChallenger(repeated,challengerRule,{minSample:30});
assert.equal(repeatedComparison.rawObservationSampleSize,30);
assert.equal(repeatedComparison.decisionEpisodeSampleSize,1);
assert.equal(repeatedComparison.setupSampleSize,1);
assert.equal(repeatedComparison.checks.sample,false,'30 repeated checks of one BUY thesis must not satisfy a 30-sample challenger threshold');

const independent=Array.from({length:30},(_,i)=>row(`S${i}`,'BUY NOW',start+i*60_000,.04));
const independentComparison=compareChampionChallenger(independent,challengerRule,{minSample:30});
assert.equal(independentComparison.decisionEpisodeSampleSize,30);
assert.equal(independentComparison.setupSampleSize,30);
assert.equal(independentComparison.checks.sample,true,'30 distinct ticker setup episodes may satisfy the sample-size check');

const evidence=fs.readFileSync(new URL('../src/evidence.js',import.meta.url),'utf8');
const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.match(evidence,/rewardRiskMin:1\.8/,'1.80:1 production reward/risk threshold must remain unchanged');
assert.match(screener,/NEAR_READY_RECHECK_MS=15\*60\*1000/,'15-minute execution cadence must remain unchanged');
assert.match(build,new RegExp(`version:'${pkg.version.replaceAll('.','\\.')}'`),'build-info version must match package version');
assert.match(pkg.scripts.check,/test-stage14-26-decision-episode-validation\.mjs/);
console.log('Stage 14.26 decision episode validation regression passed');

function row(symbol,status,observedAt,forwardReturn,{modelVersion='sf-analysis-v4-adaptive-execution'}={}){
  return{symbol,status,source:'execution-recheck',observedAt,readiness:status==='BUY NOW'?90:78,relativeVolume:1.8,gatesReady:4,gateTotal:4,modelVersion,benchmarkRiskOff:0,forwardReturn,mfe:Math.max(.05,forwardReturn),mae:-.015,marketExcessReturn:forwardReturn-.01,sectorExcessReturn:forwardReturn-.015,payloadJson:JSON.stringify({benchmarkContext:{sectorBenchmark:'XLK',sectorRelativeStrength20:.04,marketRelativeStrength20:.02},gates:{trend:true,momentum:true,participation:true,structure:true}})};
}
