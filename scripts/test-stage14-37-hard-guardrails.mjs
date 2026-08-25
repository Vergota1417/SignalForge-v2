import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateHardBuyGuardrails, MIN_BUY_REWARD_RISK } from '../src/hard-guardrails.js';

const allGood={
  rewardRisk:MIN_BUY_REWARD_RISK,
  targetResolved:true,
  thesisIntact:true,
  overextended:false,
  higherTimeframeReady:true,
  intradayConfirmation:{pass:true}
};

assert.equal(evaluateHardBuyGuardrails(allGood).pass,true,'1.80:1 with every hard gate passing must be eligible');
assert.equal(evaluateHardBuyGuardrails({...allGood,rewardRisk:1.79}).pass,false,'R/R below 1.80 must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,rewardRisk:1.799999}).rules.rewardRisk.pass,false,'floating values below 1.80 must not round into a BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,targetResolved:false}).pass,false,'unresolved target must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,thesisIntact:false}).pass,false,'broken thesis must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,overextended:true}).pass,false,'overextension must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,higherTimeframeReady:false}).pass,false,'uncleared higher-timeframe gates must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,intradayConfirmation:{pass:false}}).pass,false,'missing participation must hard-block BUY');

const analysis=fs.readFileSync(new URL('../src/analysis.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../src/entry.js',import.meta.url),'utf8');
const coordinator=fs.readFileSync(new URL('../public/api-request-coordinator.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/guardrails.yml',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('./run-reliability-guardrails.mjs',import.meta.url),'utf8');

assert.match(analysis,/dailyGatesReady&&hardBuyGuardrails\.pass\)\{status='BUY NOW'/,'BUY NOW must be directly gated by hardBuyGuardrails.pass');
assert.match(analysis,/!hardBuyGuardrails\.rules\.rewardRisk\.pass/,'analysis must explicitly block a failed R/R hard guardrail');
assert.match(analysis,/hardBuyGuardrails/,'hard guardrail state must be returned with analysis');
assert.match(entry,/minBuyRewardRisk:MIN_BUY_REWARD_RISK/,'health must expose the production minimum R/R');
assert.match(entry,/patternNetworkUiEnabled:false/,'health must prove the risky pattern network UI is disabled');
assert.match(coordinator,/FIVE_MINUTES=5\*60_000/,'browser background API reads must remain guarded at five minutes');
assert.match(coordinator,/THIRTY_MINUTES=30\*60_000/,'cache-only chart reads must remain guarded at thirty minutes');
assert.match(sw,/FIVE_MINUTES=5\*60_000/,'service worker must independently enforce the five-minute request guard');
assert.match(sw,/THIRTY_MINUTES=30\*60_000/,'service worker must independently enforce the cache-only chart guard');
assert.match(sw,/signalforge-shell-v30-37/,'guardrail release must evict older PWA shells');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-context-ui\.js'/,'pattern polling UI must remain disabled until rebuilt as passive-only');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-overlay-stable\.js'/,'pattern network overlay must remain disabled until rebuilt as passive-only');
assert.ok(index.indexOf('api-request-coordinator.js')<index.indexOf('app.js'),'API coordinator must load before application modules');
assert.match(build,/2\.30\.37/,'visible release must identify the hard-guardrails build');
assert.match(workflow,/npm run check/,'CI must execute the existing regression suite');
assert.match(workflow,/run-reliability-guardrails\.mjs/,'CI must execute the post-14.27 reliability guardrails');
for(const stage of ['14-28','14-29','14-30','14-31','14-33','14-35','14-36','14-37'])assert.match(runner,new RegExp(`test-stage${stage}`),`reliability runner must include Stage ${stage.replace('-', '.')}`);

console.log('Stage 14.37 hard trading, resource, health, and CI guardrail checks passed.');
