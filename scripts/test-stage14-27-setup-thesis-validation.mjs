import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDecisionEpisodes, buildSetupStateSamples, setupThesisDiagnostics } from '../src/decision-episodes.js';
import { evaluateEvidenceRows } from '../src/evaluation.js';
import { buildSetupLeaderboard } from '../src/strategy-optimizer.js';
import { buildChallengerRule, compareChampionChallenger } from '../src/challenger.js';
import { BASELINE_TESTS } from './suite-manifest.mjs';

const start=Date.parse('2026-08-25T14:00:00Z'),m15=15*60_000,d8=8*24*60*60_000;
const rows=[
  row('AAA','WAIT — SETUP NOT READY',start,.01),
  row('AAA','BUY NOW',start+m15,.04),
  row('AAA','SETUP — READY SOON',start+2*m15,.025),
  row('AAA','BUY NOW',start+3*m15,-.03),
  row('AAA','AVOID',start+4*m15,-.02),
  row('AAA','AVOID',start+5*m15,.03),
  row('AAA','WAIT — SETUP NOT READY',start+6*m15,.02),
  row('AAA','BUY NOW',start+7*m15,.05),
  row('AAA','BUY NOW',start+8*m15,.045,{modelVersion:'sf-analysis-v5-test'}),
  row('AAA','BUY NOW',start+8*m15+d8,.055,{modelVersion:'sf-analysis-v5-test'})
];

const contiguous=buildDecisionEpisodes(rows);
assert.ok(contiguous.filter(x=>x.status==='BUY NOW').length>4,'contiguous state episodes should still expose BUY state flicker diagnostically');
const samples=buildSetupStateSamples(rows),diagnostics=setupThesisDiagnostics(rows);
assert.equal(diagnostics.setupEpisodeCount,4,'terminal reset, model change, and >7-day observation gap should create new setup theses');
assert.equal(samples.length,8,'each setup thesis may contribute each decision state only once');
assert.equal(samples.filter(x=>x.status==='BUY NOW').length,4,'BUY re-entry inside the first thesis must not create a second BUY validation sample');
assert.equal(samples.find(x=>x.status==='BUY NOW').forwardReturn,.04,'first causal BUY occurrence must represent that setup thesis');
assert.equal(samples.filter(x=>x.status==='AVOID').length,1,'repeated terminal AVOID observations must remain one state sample until the setup resets');
assert.match(diagnostics.policy,/BUY → READY → BUY/);
assert.match(diagnostics.policy,/7 days/);
assert.match(diagnostics.policy,/weekends/);

const evaluation=evaluateEvidenceRows(rows,{horizon:10,minSample:5});
assert.equal(evaluation.rawObservationSampleSize,10);
assert.equal(evaluation.setupSampleSize,4);
assert.equal(evaluation.decisionStateSampleSize,8);
assert.equal(evaluation.calibration.buySampleSize,4);
assert.equal(evaluation.calibration.eligible,false,'BUY flicker inside one thesis must not manufacture the fifth independent BUY sample');
assert.match(evaluation.calibration.reason,/independent BUY setup samples/);

const board=buildSetupLeaderboard(rows,{minSample:5});
const buy=board.find(x=>x.profile?.status==='BUY NOW');
assert.ok(buy);
assert.equal(buy.sampleSize,4);
assert.equal(buy.qualified,false);

const flicker=Array.from({length:30},(_,i)=>row('FLKR',i%2===0?'BUY NOW':'SETUP — READY SOON',start+i*m15,.04));
const rule=buildChallengerRule({statuses:['BUY NOW'],minReadiness:80,minRvol:1.5,minGates:4,requireStrongSector:true});
const flickerComparison=compareChampionChallenger(flicker,rule,{minSample:30});
assert.equal(flickerComparison.setupSampleSize,1);
assert.equal(flickerComparison.champion.sampleSize,1,'15 BUY re-entries inside one setup thesis must remain one Champion BUY sample');
assert.equal(flickerComparison.checks.sample,false);

const independent=Array.from({length:30},(_,i)=>row(`I${i}`,'BUY NOW',start+i*m15,.04));
const independentComparison=compareChampionChallenger(independent,rule,{minSample:30});
assert.equal(independentComparison.setupSampleSize,30);
assert.equal(independentComparison.champion.sampleSize,30);
assert.equal(independentComparison.checks.sample,true);

const evidence=fs.readFileSync(new URL('../src/evidence.js',import.meta.url),'utf8');
const screener=fs.readFileSync(new URL('../src/screener.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.match(evidence,/import \{ MIN_BUY_REWARD_RISK \} from '\.\/hard-guardrails\.js'/,'evidence must import the authoritative production reward/risk policy');
assert.match(evidence,/rewardRiskMin:MIN_BUY_REWARD_RISK/,'setup-thesis evidence must persist the authoritative production reward/risk policy');
assert.match(screener,/NEAR_READY_RECHECK_MS=15\*60\*1000/);
assert.match(screener,/PRIORITY_PULSE_MS=5\*60\*1000/);
assert.match(build,new RegExp(`version:'${pkg.version.replaceAll('.','\\.')}'`));
const shell=build.match(/shell:'([^']+)'/)?.[1];assert.ok(shell);assert.ok(sw.includes(`signalforge-shell-${shell}`));
assert.ok(BASELINE_TESTS.includes('scripts/test-stage14-27-setup-thesis-validation.mjs'),'Stage 14.27 must remain in the baseline regression manifest');
console.log('Stage 14.27 setup thesis validation regression passed');

function row(symbol,status,observedAt,forwardReturn,{modelVersion='sf-analysis-v4-adaptive-execution'}={}){
  return{symbol,status,source:'execution-recheck',observedAt,readiness:status==='BUY NOW'?90:status==='SETUP — READY SOON'?78:55,relativeVolume:1.8,gatesReady:status==='BUY NOW'?4:3,gateTotal:4,modelVersion,benchmarkRiskOff:0,forwardReturn,mfe:Math.max(.06,forwardReturn),mae:-.02,marketExcessReturn:forwardReturn-.01,sectorExcessReturn:forwardReturn-.015,payloadJson:JSON.stringify({benchmarkContext:{sectorBenchmark:'XLK',sectorRelativeStrength20:.04,marketRelativeStrength20:.02},gates:{trend:true,momentum:true,participation:true,structure:true}})};
}
