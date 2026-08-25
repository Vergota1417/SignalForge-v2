import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateHardBuyGuardrails, MIN_BUY_REWARD_RISK } from '../src/hard-guardrails.js';
import { HISTORICAL_DISABLED_TESTS, PRODUCTION_GUARDRAIL_TESTS } from './test-manifest.mjs';
await import('../public/api-request-policy.js');
const requestPolicy=globalThis.SignalForgeApiRequestPolicy;

const allGood={
  rewardRisk:MIN_BUY_REWARD_RISK,
  targetResolved:true,
  thesisIntact:true,
  overextended:false,
  higherTimeframeReady:true,
  intradayConfirmation:{pass:true,participationPass:true}
};

assert.equal(evaluateHardBuyGuardrails(allGood).pass,true,'1.80:1 with every hard gate passing must be eligible');
assert.equal(evaluateHardBuyGuardrails({...allGood,rewardRisk:1.79}).pass,false,'R/R below 1.80 must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,rewardRisk:1.799999}).rules.rewardRisk.pass,false,'floating values below 1.80 must not round into a BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,targetResolved:false}).pass,false,'unresolved target must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,thesisIntact:false}).pass,false,'broken thesis must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,overextended:true}).pass,false,'overextension must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,higherTimeframeReady:false}).pass,false,'uncleared higher-timeframe gates must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,intradayConfirmation:{pass:false,participationPass:true}}).pass,false,'failed final execution confirmation must hard-block BUY');
assert.equal(evaluateHardBuyGuardrails({...allGood,intradayConfirmation:{pass:true,participationPass:false}}).pass,false,'failed participation core must hard-block BUY');

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
assert.equal(requestPolicy.backgroundReadMs,5*60_000,'browser background API reads must remain guarded at five minutes');
assert.equal(requestPolicy.cacheOnlyMarketDataMs,30*60_000,'cache-only chart reads must remain guarded at thirty minutes');
assert.match(coordinator,/SignalForgeApiRequestPolicy/,'browser coordinator must consume the shared request guard');
assert.match(sw,/SignalForgeApiRequestPolicy/,'service worker must independently consume the shared request guard');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-context-ui\.js'/,'pattern polling UI must remain disabled until rebuilt as passive-only');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-overlay-(?:stable|reliability)\.js'/,'pattern network overlay must remain disabled until rebuilt as passive-only');
assert.ok(index.indexOf('api-request-coordinator.js')<index.indexOf('app.js'),'API coordinator must load before application modules');
assert.match(build,/version:'2\.30\.\d+'/,'visible release must remain in the SignalForge 2.30.x line');
const shell=build.match(/shell:'(v30-\d+)'/)?.[1];assert.ok(shell,'visible release must expose a versioned v30 shell');
assert.ok(sw.includes(`signalforge-shell-${shell}`),'service-worker shell must match the visible release');

for(const command of ['test:manifest','check:syntax','test:baseline','test:reliability'])assert.match(workflow,new RegExp(command.replace(':','\\:')),`CI must execute ${command}`);
assert.match(runner,/run-test-suite\.mjs/,'legacy reliability entry point must delegate to the central test runner');
assert.match(runner,/reliability/,'legacy reliability entry point must select the production reliability group');
for(const stage of ['14-28','14-29','14-33','14-35','14-36','14-37'])assert.ok(PRODUCTION_GUARDRAIL_TESTS.some(file=>file.includes(`test-stage${stage}`)),`production manifest must include Stage ${stage.replace('-', '.')}`);
for(const disabled of ['14-30','14-31']){
  assert.ok(HISTORICAL_DISABLED_TESTS.some(file=>file.includes(`test-stage${disabled}`)),`disabled Pattern-network Stage ${disabled.replace('-', '.')} must be explicitly classified as historical`);
  assert.ok(!PRODUCTION_GUARDRAIL_TESTS.some(file=>file.includes(`test-stage${disabled}`)),`disabled Pattern-network Stage ${disabled.replace('-', '.')} must not be required production behavior`);
}

console.log('Stage 14.37/current hard trading, resource, health, and CI guardrail checks passed.');
