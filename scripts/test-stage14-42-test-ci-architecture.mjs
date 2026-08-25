import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BASELINE_TESTS, HISTORICAL_DISABLED_TESTS, PRODUCTION_GUARDRAIL_TESTS, SYNTAX_ROOTS } from './test-manifest.mjs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const workflow=read('.github/workflows/guardrails.yml');
const runner=read('scripts/run-test-suite.mjs');
const legacyRunner=read('scripts/run-reliability-guardrails.mjs');
const build=read('public/build-info.js');

assert.equal(pkg.scripts.check,'node scripts/run-test-suite.mjs all','npm check must delegate to the central suite runner');
assert.equal(pkg.scripts['check:syntax'],'node scripts/run-test-suite.mjs syntax','syntax checking must use discovered files');
assert.equal(pkg.scripts['test:manifest'],'node scripts/run-test-suite.mjs manifest','manifest ownership must be directly runnable');
assert.equal(pkg.scripts['test:baseline'],'node scripts/run-test-suite.mjs baseline','baseline regression group must be directly runnable');
assert.equal(pkg.scripts['test:reliability'],'node scripts/run-test-suite.mjs reliability','production reliability group must be directly runnable');
assert.equal(pkg.scripts['test:historical'],'node scripts/run-test-suite.mjs historical','historical tests must remain explicitly opt-in');
assert.equal(Object.keys(pkg.scripts).filter(key=>/^test:stage/.test(key)).length,0,'package.json must not maintain a second per-stage orchestration list');

for(const command of ['test:manifest','check:syntax','test:baseline','test:reliability'])assert.ok(workflow.includes(`npm run ${command}`),`CI must expose ${command} as its own visible gate`);
assert.doesNotMatch(workflow,/run-reliability-guardrails\.mjs/,'CI must call the central npm reliability command instead of a second orchestration path');

assert.deepEqual([...SYNTAX_ROOTS],['src','public','scripts'],'syntax discovery must cover backend, production frontend, and test/tool scripts');
assert.match(runner,/function walk\(dir\)/,'central runner must discover files recursively');
assert.match(runner,/test-\.\*\\\.mjs/,'central runner must discover test files instead of trusting only the manifest');
assert.match(runner,/Unclassified test files/,'an orphan test must fail manifest validation');
assert.match(runner,/Manifest entries are not test files/,'stale manifest entries must fail validation');
assert.match(runner,/runSyntax\(\)/,'central runner must own automatic syntax checking');
assert.match(runner,/runGroup\('baseline'\)/,'all mode must execute baseline regressions');
assert.match(runner,/runGroup\('reliability'\)/,'all mode must execute production reliability guardrails');
assert.doesNotMatch(runner,/runGroup\('historical'\);\s*process\.exit\(0\);\s*}\s*if\(mode==='all'\)[\s\S]*runGroup\('historical'\)/,'all mode must not reactivate quarantined historical behavior');

const all=[...BASELINE_TESTS,...PRODUCTION_GUARDRAIL_TESTS,...HISTORICAL_DISABLED_TESTS];
assert.equal(new Set(all).size,all.length,'every test must have exactly one ownership classification');
assert.ok(PRODUCTION_GUARDRAIL_TESTS.includes('scripts/test-stage14-42-test-ci-architecture.mjs'),'Stage 14.42 must protect its own CI architecture');
for(const file of ['scripts/test-stage14-30-pattern-overlay-controls.mjs','scripts/test-stage14-31-live-pattern-context-bridge.mjs']){
  assert.ok(HISTORICAL_DISABLED_TESTS.includes(file),`${file} must remain explicitly historical/disabled`);
  assert.ok(!PRODUCTION_GUARDRAIL_TESTS.includes(file),`${file} must not be required production behavior`);
}
assert.match(legacyRunner,/run-test-suite\.mjs/,'legacy runner must remain only as a compatibility delegate');
assert.doesNotMatch(legacyRunner,/test-stage14-/,'legacy runner must not contain its own stage list');

const runtimeVersion=build.match(/version:'([^']+)'/)?.[1];
assert.equal(pkg.version,runtimeVersion,'package and visible runtime version must remain synchronized');

console.log('Stage 14.42 test/CI architecture regression passed.');
