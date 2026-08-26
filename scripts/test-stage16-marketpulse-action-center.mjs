import assert from 'node:assert/strict';
import fs from 'node:fs';
import { paperActionEligible, PAPER_ACTION_MAX_OPEN, PAPER_ACTION_MIN_READINESS, PAPER_ACTION_MIN_RR } from '../src/paper-action.js';

const strong={
  status:'SETUP — READY SOON',readiness:78,latest:{close:100},thesisBreak:95,target:112,overextension:106,
  engines:{trend:{ready:true},entry:{ready:true},probability:{ready:true},riskReward:{ready:false}},hardBuyGuardrails:{pass:false}
};
const testable=paperActionEligible({status:strong.status,analysis:strong,price:100});
assert.equal(testable.eligible,true,'a strong 3-of-4 near-ready setup should be allowed into paper-only testing');
assert.equal(testable.gatesReady,3);
assert.ok(testable.rr>=PAPER_ACTION_MIN_RR);
assert.match(testable.reason,/paper testing/i);

assert.equal(paperActionEligible({status:'AVOID',analysis:{...strong,status:'AVOID'},price:100}).eligible,false,'AVOID must never enter the paper action lane');
assert.equal(paperActionEligible({status:'SELL / EXIT',analysis:{...strong,status:'SELL / EXIT'},price:100}).eligible,false,'SELL / EXIT must never open a paper position');
assert.equal(paperActionEligible({status:strong.status,analysis:{...strong,readiness:PAPER_ACTION_MIN_READINESS-1},price:100}).eligible,false,'paper risk still requires the readiness floor');
assert.equal(paperActionEligible({status:strong.status,analysis:{...strong,engines:{trend:{ready:true},entry:{ready:true},probability:{ready:false},riskReward:{ready:false}}},price:100}).eligible,false,'paper risk still requires at least three engines');
assert.equal(paperActionEligible({status:strong.status,analysis:{...strong,overextension:99},price:100}).eligible,false,'paper risk must still respect the no-chase level');
assert.equal(paperActionEligible({status:strong.status,analysis:{...strong,target:106,thesisBreak:95},price:100}).eligible,false,'poor reward/risk must not be paper-entered just to manufacture activity');
assert.equal(PAPER_ACTION_MAX_OPEN,3,'paper action exposure must stay capped at three simultaneous positions');

const action=read('../src/paper-action.js'),scheduler=read('../src/scheduler.js'),entry=read('../src/entry.js'),push=read('../src/push.js'),ui=read('../public/marketpulse-action-center.js'),index=read('../public/index.html'),sw=read('../public/service-worker.js'),build=read('../public/build-info.js'),analysis=read('../src/analysis.js'),pkg=JSON.parse(read('../package.json'));
assert.match(action,/PAPER_ACTION_RISK_PER_TRADE=\.01/,'paper action sizing must risk only 1% of paper equity per trade');
assert.match(action,/PAPER_ACTION_MAX_POSITION_PCT=\.25/,'paper position allocation must remain capped');
assert.match(action,/oneNewEntryPerCycle:true/,'paper action must avoid opening a burst of new positions in one scheduler cycle');
assert.match(action,/realTradingAuthority:false/,'paper action snapshot must explicitly deny real-trading authority');
assert.doesNotMatch(action,/Robinhood|brokerage order|placeOrder|submitOrder/i,'paper action code must not place real brokerage orders');
assert.match(scheduler,/runPaperActionCycle/,'existing scheduler owner must run the paper action loop');
assert.match(scheduler,/paperAction:\{enabled:true,paperOnly:true,maxOpen:3,realTradingAuthority:false\}/,'scheduler coverage must expose the paper-only execution lane');
assert.match(entry,/\/api\/paper-actions/,'production must expose the visible paper action snapshot');
assert.match(entry,/paperActionCannotAuthorizeRealTrade:true/,'health must preserve the paper-vs-real firewall');
assert.match(push,/broadcastPaperActionPush/,'paper entries and exits must be able to produce phone alerts');
assert.match(ui,/What is MarketPulse doing right now\?/,'dashboard must visibly surface system activity');
assert.match(ui,/PAPER BUY — TESTING/,'dashboard must label simulated entries clearly');
assert.match(ui,/AGGRESSIVE CANDIDATE · PAPER/,'dashboard must show near-ready setups that are being considered for calculated paper risk');
assert.match(ui,/setInterval\(load,60_000\)/,'action center must refresh automatically without manual reload');
assert.match(index,/marketpulse-action-center\.js/,'app shell must load the visible action center');
assert.match(sw,/marketpulse-action-center\.js/,'PWA shell must cache the visible action center');
assert.match(sw,/signalforge-shell-v30-40/,'visible action release must advance the phone shell');
assert.match(build,/version:'2\.30\.40'/);
assert.match(build,/shell:'v30-40'/);
assert.equal(pkg.version,'2.30.40');
assert.match(analysis,/dailyGatesReady&&hardBuyGuardrails\.pass\)\{status='BUY NOW'/,'strict BUY NOW authorization must remain unchanged while paper mode takes earlier risk');

console.log('Stage 16 MarketPulse visible paper action center checks passed.');

function read(relative){return fs.readFileSync(new URL(relative,import.meta.url),'utf8');}
