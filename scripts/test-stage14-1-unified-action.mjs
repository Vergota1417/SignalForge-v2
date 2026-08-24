import assert from 'node:assert/strict';
import { unifiedActionState } from '../src/unified-action.js';

function signal(status,{readiness=70,ready=3,failed=['Entry engine'],reason=''}={}){
  const names=['trend','entry','probability','riskReward'];
  const engines=Object.fromEntries(names.map((name,i)=>[name,{ready:i<ready}]));
  return{status,analysis:{status,readiness,engines,criticalFailed:failed,reason}};
}

let u=unifiedActionState({signal:signal('BUY NOW',{readiness:94,ready:4,failed:[]}),earlyMovement:{state:'EARLY MOVEMENT — BUILDING',acceleration:86,reasons:['RVOL 1.8x']}});
assert.equal(u.state,'BUY NOW');
assert.equal(u.action,'BUY WINDOW OPEN');
assert.equal(u.gatesReady,4);

u=unifiedActionState({signal:signal('SETUP — READY SOON',{readiness:88,ready:3,failed:['Entry engine']}),earlyMovement:{state:'EARLY MOVEMENT — BUILDING',acceleration:82}});
assert.equal(u.state,'READY SOON');
assert.match(u.reason,/Entry engine/);
assert.notEqual(u.action,'BUY WINDOW OPEN');

u=unifiedActionState({signal:signal('WAIT — SETUP NOT READY',{readiness:62,ready:2,failed:['Probability engine','Entry engine']}),earlyMovement:{state:'EARLY MOVEMENT — BUILDING',acceleration:78,reasons:['discovery velocity +8','RVOL 1.6x']}});
assert.equal(u.state,'BUILDING');
assert.equal(u.action,'WATCH CLOSELY — NOT A BUY');
assert.equal(u.acceleration,78);

u=unifiedActionState({signal:null,earlyMovement:{state:'MOVEMENT WATCH',acceleration:55}});
assert.equal(u.state,'WATCH');
assert.equal(u.action,'MONITOR');

u=unifiedActionState({signal:signal('WAIT FOR PULLBACK',{readiness:81,ready:4,failed:[]}),earlyMovement:{state:'EARLY MOVEMENT — BUILDING',acceleration:90}});
assert.equal(u.state,'WAIT FOR PULLBACK');
assert.equal(u.action,'DO NOT CHASE');

u=unifiedActionState({signal:signal('AVOID',{reason:'Trend failed',ready:1}),earlyMovement:{state:'EARLY MOVEMENT — BUILDING',acceleration:95}});
assert.equal(u.state,'AVOID');
assert.equal(u.action,'DO NOT ENTER');

u=unifiedActionState({signal:signal('SELL / EXIT',{ready:0}),earlyMovement:{state:'EARLY MOVEMENT — BUILDING',acceleration:95}});
assert.equal(u.state,'SELL / EXIT');
assert.equal(u.action,'EXIT');

console.log('Stage 14.1 unified action regression checks passed.');
