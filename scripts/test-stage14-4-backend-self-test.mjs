import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const entry=read('src/entry.js');
const selfTest=read('src/self-test.js');
const ui=read('public/self-test-ui.js');
const html=read('public/index.html');
const sw=read('public/service-worker.js');
const build=read('public/build-info.js');
const wrangler=read('wrangler.jsonc');

assert.match(wrangler,/"main"\s*:\s*"src\/entry\.js"/,'Wrangler must use the protected wrapper entry.');
assert.match(entry,/\/api\/backend-self-test/,'Wrapper must expose the backend self-test route.');
assert.match(entry,/authorizeDevice/,'Self-test route must require an authorized SignalForge device.');
assert.match(entry,/SELF_TEST_COOLDOWN_MS\s*=\s*60_000/,'Self-test must retain a one-minute cooldown.');
assert.match(entry,/return app\.fetch\(request,env,ctx\)/,'Wrapper must delegate unrelated requests unchanged.');
assert.match(entry,/return app\.scheduled\(controller,env,ctx\)/,'Wrapper must preserve scheduled execution.');
assert.match(selfTest,/purpose:'backend-self-test'/,'Provider usage must be labeled as backend self-test traffic.');
assert.match(selfTest,/contaminatesEvidence:false/,'Self-test must explicitly state that it does not contaminate investment evidence.');
assert.doesNotMatch(selfTest,/recordAnalysisEvidence|recordRadarEvidence|recordSignal\(/,'Self-test must not write synthetic investment evidence or signals.');
assert.match(ui,/method:'POST'/,'Phone UI must invoke the self-test with POST.');
assert.match(ui,/'x-sf-endpoint':auth\.endpoint/,'Phone UI must send the authorized push endpoint.');
assert.match(ui,/'x-sf-token':auth\.token/,'Phone UI must send the authorized device token.');
assert.match(ui,/Run Backend Test/,'Phone UI must expose a clear test action.');
assert.match(html,/self-test-ui\.js/,'The production shell must load the self-test UI.');
assert.match(sw,/signalforge-shell-v30-4/,'Stage 14.4 must advance the PWA shell cache.');
assert.match(sw,/self-test-ui\.js/,'The self-test UI must be included in the offline app shell.');
assert.match(build,/version:'2\.30\.4'/,'Stage 14.4 must expose version 2.30.4.');
assert.match(build,/shell:'v30-4'/,'Stage 14.4 must expose shell v30-4.');

console.log('Stage 14.4 backend self-test checks passed.');
