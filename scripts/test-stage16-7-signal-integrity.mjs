import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateHardBuyGuardrails } from '../src/hard-guardrails.js';

const good=evaluateHardBuyGuardrails({rewardRisk:2.2,targetResolved:true,thesisIntact:true,overextended:false,higherTimeframeReady:true,intradayConfirmation:{pass:true,participationPass:true},riskPct:.012,riskAtr:.8});
assert.equal(good.pass,true,'meaningful stop distance must remain eligible when all hard gates pass');
const tightPct=evaluateHardBuyGuardrails({rewardRisk:12,targetResolved:true,thesisIntact:true,overextended:false,higherTimeframeReady:true,intradayConfirmation:{pass:true,participationPass:true},riskPct:.002,riskAtr:.8});
assert.equal(tightPct.rules.stopQuality.pass,false,'an ultra-tight percentage stop must block BUY even when raw R/R is huge');
assert.equal(tightPct.pass,false,'inflated R/R must never override stop-quality guardrail');
const tightAtr=evaluateHardBuyGuardrails({rewardRisk:12,targetResolved:true,thesisIntact:true,overextended:false,higherTimeframeReady:true,intradayConfirmation:{pass:true,participationPass:true},riskPct:.01,riskAtr:.2});
assert.equal(tightAtr.rules.stopQuality.pass,false,'an ultra-tight ATR-normalized stop must block BUY');

const analysis=read('../src/analysis.js');
const execution=read('../src/execution-confirmation.js');
const gateway=read('../src/market-data-gateway.js');
const trace=read('../src/execution-trace.js');
const traceUi=read('../public/execution-trace-ui.js');
const lastSymbol=read('../public/last-symbol-ui.js');
const integrityUi=read('../public/signal-integrity-ui.js');
const opportunities=read('../public/signalforge-opportunities-ui.js');
const index=read('../public/index.html');
const sw=read('../public/service-worker.js');
const build=read('../public/build-info.js');
const pkg=JSON.parse(read('../package.json'));

assert.match(analysis,/winRate:total\?wins\/total:null/,'zero walk-forward samples must not synthesize a 50% win rate');
assert.match(analysis,/value:wf\.sample\?.*:'NO SAMPLE'/s,'probability UI value must explicitly say NO SAMPLE when none exist');
assert.match(analysis,/NOT ESTABLISHED/,'zero-sample expectancy must be displayed as not established');
assert.match(analysis,/stopQualityPass/,'analysis must calculate stop-quality integrity');
assert.match(analysis,/artificially inflate reward\/risk/,'analysis must explain why an ultra-tight stop blocks BUY');
assert.match(execution,/STOP QUALITY/,'live execution refresh must preserve the stop-quality blocker');
assert.match(execution,/stopQualityPass/,'live price pulses must recompute stop quality instead of trusting stale R/R');

assert.match(gateway,/mode:'CACHE'/,'market gateway must identify cache-derived reads');
assert.match(gateway,/mode:'UPSTREAM'/,'market gateway must identify live upstream reads');
assert.match(gateway,/role:candidate===primary\?'PRIMARY':'FALLBACK'/,'AUTO provider fallback must be explicit in provenance');
assert.match(trace,/acquisition:'CACHED_SNAPSHOT'/,'execution trace must identify persisted market proof as a cached snapshot');
assert.match(trace,/upstreamVerifiedThisTrace:false/,'trace must not imply the provider was re-tested when reading D1 cache');
assert.match(traceUi,/CACHED SNAPSHOT · upstream not re-tested/,'trace implementation must display cached provenance plainly when reintroduced');

assert.match(lastSymbol,/window\.SignalForgeSelection/,'browser implementation must expose one canonical selected-symbol state when reintroduced');
assert.match(lastSymbol,/signalforge:selected-symbol/,'canonical selected-symbol changes must publish one event');
assert.match(lastSymbol,/input\.addEventListener\('blur'/,'abandoned search drafts must reset to the active displayed ticker');
assert.match(integrityUi,/LIVE UPSTREAM/,'provenance UI implementation must distinguish live upstream data');
assert.match(integrityUi,/CACHED SNAPSHOT/,'provenance UI implementation must distinguish cached data');
assert.match(integrityUi,/Weekly research review/,'Friday review timing must be labeled as research rather than a frozen trade decision');
assert.match(integrityUi,/Live action states can change during market-hour scans/,'UI implementation must explicitly state that live trade states continue changing before weekly research review');

assert.match(opportunities,/SignalForge · live discovery/,'opportunities implementation must use SignalForge branding');
assert.doesNotMatch(opportunities,/MarketPulse/,'SignalForge opportunities implementation must contain no MarketPulse branding');
assert.doesNotMatch(index,/marketpulse-opportunities-ui\.js/,'retired MarketPulse module must not be loaded');
assert.equal(fs.existsSync(new URL('../public/marketpulse-opportunities-ui.js',import.meta.url)),false,'retired MarketPulse UI file must be removed');

const patch=Number(String(pkg.version).split('.')[2]);
const buildPatch=Number(build.match(/version:'2\.30\.(\d+)'/)?.[1]);
const shellPatch=Number(build.match(/shell:'v30-(\d+)'/)?.[1]);
const swShell=Number(sw.match(/signalforge-shell-v30-(\d+)/)?.[1]);
const apiVersion=Number(sw.match(/signalforge-api-snapshots-v(\d+)/)?.[1]);
assert.ok(patch>=46&&buildPatch>=46&&shellPatch>=46&&swShell>=46,'Stage 16.7 integrity protections must survive later 2.30.x releases');
assert.equal(buildPatch,patch,'visible build and package versions must match');
assert.equal(shellPatch,swShell,'visible shell and service-worker shell must match');
assert.ok(apiVersion>=10,'Stage 16.7 integrity release must retain API snapshot v10 or newer');
assert.doesNotMatch(sw,/marketpulse-opportunities-ui\.js/);

console.log('Stage 16.7 SignalForge signal integrity regression: PASS');
function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
