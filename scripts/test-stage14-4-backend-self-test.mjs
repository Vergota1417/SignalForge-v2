import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const entry=read('src/entry.js');
const selfTest=read('src/self-test.js');
const ui=read('public/self-test-ui.js');
const sw=read('public/service-worker.js');
const build=read('public/build-info.js');
const wrangler=read('wrangler.jsonc');

assert.match(wrangler,/"main"\s*:\s*"src\/entry\.js"/,'Wrangler must use the protected wrapper entry.');
assert.match(entry,/\/api\/backend-self-test/,'Wrapper must expose the backend self-test route.');
assert.match(entry,/authorizeDevice/,'Self-test route must require an authorized SignalForge device.');
assert.match(entry,/SELF_TEST_COOLDOWN_MS\s*=\s*60_000/,'Self-test must retain a one-minute cooldown.');
assert.match(entry,/return app\.fetch\(request,env,ctx\)/,'Wrapper must delegate unrelated requests unchanged.');
assert.match(entry,/runScheduledCycle/,'Wrapper must preserve scheduled execution through the central scheduler owner.');
assert.doesNotMatch(entry,/app\.scheduled\(/,'Wrapper must not maintain a second delegated scheduler path.');
assert.match(selfTest,/purpose:'backend-self-test'/,'Provider usage must be labeled as backend self-test traffic.');
assert.match(selfTest,/contaminatesEvidence:false/,'Self-test must explicitly state that it does not contaminate investment evidence.');
assert.doesNotMatch(selfTest,/recordAnalysisEvidence|recordRadarEvidence|recordSignal\(/,'Self-test must not write synthetic investment evidence or signals.');
assert.match(ui,/method:'POST'/,'Dormant self-test UI implementation must still invoke the endpoint with POST when reintroduced.');
assert.match(ui,/'x-sf-endpoint':auth\.endpoint/,'Dormant self-test UI must retain authorized push endpoint handling.');
assert.match(ui,/'x-sf-token':auth\.token/,'Dormant self-test UI must retain authorized device token handling.');
assert.match(sw,/signalforge-shell-v30-\d+/,'Production must retain a versioned PWA shell cache.');
assert.match(build,/version:'2\.30\.\d+'/,'Production must expose a SignalForge 2.30.x build version.');
assert.match(build,/shell:'v30-\d+'/,'Production must expose a matching versioned shell.');

console.log('Stage 14.4 backend self-test checks passed.');
