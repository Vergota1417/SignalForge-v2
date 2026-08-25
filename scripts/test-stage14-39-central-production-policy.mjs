import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MIN_BUY_REWARD_RISK, evaluateHardBuyGuardrails } from '../src/hard-guardrails.js';

assert.equal(MIN_BUY_REWARD_RISK,1.8,'production BUY reward/risk floor must remain 1.80:1');

const files={
  analysis:fs.readFileSync(new URL('../src/analysis.js',import.meta.url),'utf8'),
  strategy:fs.readFileSync(new URL('../src/strategy.js',import.meta.url),'utf8'),
  evidence:fs.readFileSync(new URL('../src/evidence.js',import.meta.url),'utf8'),
  latency:fs.readFileSync(new URL('../src/detection-latency.js',import.meta.url),'utf8'),
  execution:fs.readFileSync(new URL('../src/execution-confirmation.js',import.meta.url),'utf8'),
  tradePlan:fs.readFileSync(new URL('../src/trade-plan.js',import.meta.url),'utf8')
};

for(const [name,text] of Object.entries(files)){
  assert.match(text,/MIN_BUY_REWARD_RISK/,`${name} must consume the authoritative BUY reward/risk policy`);
}
assert.doesNotMatch(files.analysis,/rr\s*>=\s*1\.8(?:0)?\b/,'analysis must not redefine the BUY floor numerically');
assert.doesNotMatch(files.strategy,/rr\s*>=\s*1\.8(?:0)?\b/,'strategy must not redefine the BUY floor numerically');
assert.doesNotMatch(files.evidence,/rewardRiskMin\s*:\s*1\.8(?:0)?\b/,'evidence must persist the authoritative policy value');
assert.doesNotMatch(files.latency,/rewardRiskMin\s*:\s*1\.8(?:0)?\b/,'latency audit must consume the authoritative policy value');
assert.match(files.strategy,/gates\.rr>=1\.35/,'softer BUY CANDIDATE research/ranking threshold must remain distinct from executable BUY authorization');
assert.match(files.strategy,/participation\?\.pass&&participation\?\.participationPass/,'strategy BUY WINDOW must require both final execution confirmation and participation core');

const good=evaluateHardBuyGuardrails({rewardRisk:MIN_BUY_REWARD_RISK,targetResolved:true,thesisIntact:true,overextended:false,higherTimeframeReady:true,intradayConfirmation:{pass:true,participationPass:true}});
assert.equal(good.pass,true);
assert.equal(evaluateHardBuyGuardrails({...good,rewardRisk:1.79}).pass,false);

console.log('Stage 14.39 central production policy regression passed.');
