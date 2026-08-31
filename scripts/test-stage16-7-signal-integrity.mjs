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
assert.match(traceUi,/CACHED SNAPSHOT · upstream not re-tested/,'phone trace must display cached provenance plainly');

assert.match(lastSymbol,/window\.SignalForgeSelection/,'browser must expose one canonical selected-symbol state');
assert.match(lastSymbol,/signalforge:selected-symbol/,'canonical selected-symbol changes must publish one event');
assert.match(lastSymbol,/input\.addEventListener\('blur'/,'abandoned search drafts must reset to the active displayed ticker');
assert.match(integrityUi,/LIVE UPSTREAM/,'chart provenance UI must distinguish live upstream data');
assert.match(integrityUi,/CACHED SNAPSHOT/,'chart provenance UI must distinguish cached data');
assert.match(integrityUi,/Weekly research review/,'Friday review timing must be labeled as research rather than a frozen trade decision');
assert.match(integrityUi,/Live action states can change during market-hour scans/,'UI must explicitly state that live trade states continue changing before weekly research review');

assert.match(opportunities,/SignalForge · live discovery/,'Top Opportunities must use SignalForge branding');
assert.doesNotMatch(opportunities,/MarketPulse/,'active opportunities UI must contain no MarketPulse branding');
assert.match(index,/signalforge-opportunities-ui\.js/,'app must load SignalForge opportunities module');
assert.match(index,/signal-integrity-ui\.js/,'app must load integrity presentation corrections');
assert.doesNotMatch(index,/marketpulse-opportunities-ui\.js/,'retired MarketPulse module must not be loaded');
assert.equal(fs.existsSync(new URL('../public/marketpulse-opportunities-ui.js',import.meta.url)),false,'retired MarketPulse UI file must be removed');

assert.equal(pkg.version,'2.30.46');
assert.match(build,/version:'2\.30\.46'/);
assert.match(build,/release:'signal-integrity'/);
assert.match(build,/shell:'v30-46'/);
assert.match(sw,/signalforge-shell-v30-46/);
assert.match(sw,/signalforge-api-snapshots-v10/,'integrity release must invalidate stale API snapshots');
assert.match(sw,/signalforge-opportunities-ui\.js/);
assert.match(sw,/signal-integrity-ui\.js/);
assert.doesNotMatch(sw,/marketpulse-opportunities-ui\.js/);

console.log('Stage 16.7 SignalForge signal integrity regression: PASS');
function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
