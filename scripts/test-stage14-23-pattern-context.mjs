import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessPatternContext } from '../src/pattern-context.js';

function makeDoubleBottom(){
  const rows=[];let close=100;
  for(let i=0;i<60;i++){
    let target=100+Math.sin(i/3)*1.2;
    if(i===14)target=91;if(i===15)target=90.8;if(i===16)target=91.3;
    if(i===23)target=101.5;
    if(i===31)target=91.1;if(i===32)target=90.9;if(i===33)target=91.4;
    if(i>40)target=101+(i-40)*.15;
    const open=close,hi=Math.max(open,target)+(i===23?1.2:.7),lo=Math.min(open,target)-((i===15||i===32)?.8:.7);
    rows.push({time:Date.UTC(2026,0,i+1),open,high:hi,low:lo,close:target,volume:1_000_000+i*1000});close=target;
  }
  return rows;
}

const context=assessPatternContext(makeDoubleBottom(),{atr:2,symbol:'TEST'});
assert.equal(context.shadowOnly,true,'Pattern context must start shadow-only');
assert.equal(context.affectsBuyNow,false,'Pattern context must not alter BUY NOW');
assert.ok(context.support?.price>0,'support should resolve');
assert.ok(context.structureConfidence>=0&&context.structureConfidence<=100,'structure confidence must be bounded');
assert.ok(Array.isArray(context.patterns),'patterns must be an array');
const doubleBottom=context.patterns.find(p=>p.type==='DOUBLE BOTTOM');
assert.ok(doubleBottom,'synthetic W structure should detect a double bottom');
assert.ok(['DETECTED','TESTING','CONFIRMED','FAILED'].includes(doubleBottom.state),'pattern state must be explicit');
assert.ok(doubleBottom.confidence>=48,'double bottom confidence threshold should be enforced');

const engine=fs.readFileSync(new URL('../src/pattern-context.js',import.meta.url),'utf8');
const evidence=fs.readFileSync(new URL('../src/pattern-evidence.js',import.meta.url),'utf8');
const analysis=fs.readFileSync(new URL('../src/analysis.js',import.meta.url),'utf8');
const dormantUi=fs.readFileSync(new URL('../public/pattern-context-ui.js',import.meta.url),'utf8');
const hook=fs.readFileSync(new URL('../public/pattern-chart-hook.js',import.meta.url),'utf8');
const pwa=fs.readFileSync(new URL('../public/pwa.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../public/build-info.js',import.meta.url),'utf8');

for(const label of ['ASCENDING TRIANGLE','DESCENDING TRIANGLE','SYMMETRICAL TRIANGLE','RISING WEDGE','FALLING WEDGE','DOUBLE TOP','DOUBLE BOTTOM','HEAD & SHOULDERS','INVERSE HEAD & SHOULDERS'])assert.ok(engine.includes(label),`${label} detector should exist`);
assert.match(engine,/UP CHANNEL/);assert.match(engine,/DOWN CHANNEL/);assert.match(engine,/SIDEWAYS RANGE/);assert.match(engine,/BREAKOUT CONFIRMED/);assert.match(engine,/BREAKDOWN CONFIRMED/);
assert.match(analysis,/patternContext=assessPatternContext/,'daily analysis must calculate saved Pattern Context');
assert.match(analysis,/structure,patternContext,engines/,'saved analysis must retain Pattern Context without changing gate list');
assert.match(evidence,/UNIQUE\(symbol,model_version,analysis_at\)/,'shadow evidence must dedupe repeated execution rechecks');

assert.match(dormantUi,/data-toggle="support"/);assert.match(dormantUi,/data-toggle="resistance"/);assert.match(dormantUi,/data-toggle="channel"/);assert.match(dormantUi,/data-toggle="breakout"/);
assert.match(dormantUi,/data-toggle="double"/);assert.match(dormantUi,/data-toggle="triangles"/);assert.match(dormantUi,/data-toggle="headShoulders"/);assert.match(dormantUi,/data-toggle="wedges"/);
assert.match(dormantUi,/Priority only/);assert.match(dormantUi,/DETECTED, TESTING, CONFIRMED, or FAILED/);assert.match(dormantUi,/cannot authorize or block BUY NOW/);
assert.doesNotMatch(dormantUi,/fetch\(`\$\{API\}\/api\/market-data/,'dormant pattern buttons must not issue market-data requests');
assert.match(hook,/SignalForgeChartBridge/,'chart hook must expose the zero-network Lightweight Charts overlay bridge');
assert.ok(pwa.indexOf("/pattern-chart-hook.js")<pwa.indexOf("/chart-adapter.js"),'dormant zero-network chart hook ordering must remain correct for later reintroduction');
assert.match(pwa,/Structure \+ Patterns network UI is intentionally disabled/,'dormant PWA loader must document the request-amplification quarantine');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-context-ui\.js'/,'Pattern Context network UI must remain disabled');
assert.doesNotMatch(pwa,/loadScriptThen\('\/pattern-overlay-(?:stable|reliability)\.js'/,'Pattern overlay network controllers must remain disabled');
assert.match(sw,/signalforge-shell-v30-/);
assert.doesNotMatch(sw,/'\/pattern-context-ui\.js'/,'PWA must not precache the disabled Pattern Context network UI');
assert.doesNotMatch(sw,/'\/pattern-overlay-(?:stable|reliability)\.js'/,'PWA must not precache disabled Pattern overlay network controllers');
assert.match(build,/SIGNALFORGE_BUILD/,'current release must keep visible build metadata');

console.log('Stage 14.23 pattern engine + disabled network UI regression passed.');
