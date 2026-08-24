export function unifiedActionState({signal=null,earlyMovement=null}={}){
  const status=String(signal?.status||signal?.analysis?.status||'NOT ANALYZED');
  const analysis=signal?.analysis||null,movement=earlyMovement||{},acceleration=finite(movement.acceleration),readiness=analysis?finite(analysis.readiness):null;
  const gates=analysis?.engines?Object.values(analysis.engines).filter(Boolean):[],gatesReady=gates.filter(x=>x?.ready).length,gateTotal=gates.length||4;
  const failed=Array.isArray(analysis?.criticalFailed)?analysis.criticalFailed:[];
  if(status==='SELL / EXIT')return result('SELL / EXIT','EXIT','Saved analysis says the thesis is broken.',{acceleration,readiness,gatesReady,gateTotal,failed});
  if(status==='AVOID')return result('AVOID','DO NOT ENTER',analysis?.reason||'Deep analysis rejects a new entry.',{acceleration,readiness,gatesReady,gateTotal,failed});
  if(status==='BUY NOW')return result('BUY NOW','BUY WINDOW OPEN','All saved live critical gates are cleared.',{acceleration,readiness,gatesReady,gateTotal,failed});
  if(status==='WAIT FOR PULLBACK')return result('WAIT FOR PULLBACK','DO NOT CHASE','The setup is attractive but price is extended.',{acceleration,readiness,gatesReady,gateTotal,failed});
  if(status==='SETUP — READY SOON')return result('READY SOON','PREPARE — WAIT FOR FINAL GATE',failed.length?`Waiting on: ${failed.join(', ')}.`:'One final confirmation remains.',{acceleration,readiness,gatesReady,gateTotal,failed});
  if(movement.state==='EARLY MOVEMENT — BUILDING')return result('BUILDING','WATCH CLOSELY — NOT A BUY',movement.reasons?.length?movement.reasons.join(' · '):'Participation is accelerating before the full setup is ready.',{acceleration,readiness,gatesReady,gateTotal,failed});
  if(movement.state==='MOVEMENT WATCH')return result('WATCH','MONITOR','Participation is improving, but evidence is not strong enough for action.',{acceleration,readiness,gatesReady,gateTotal,failed});
  return result(analysis?'WAIT':'QUIET',analysis?'WAIT FOR SETUP':'NO ACTION',failed.length?`Waiting on: ${failed.join(', ')}.`:'No meaningful early movement is confirmed yet.',{acceleration,readiness,gatesReady,gateTotal,failed});
}
function result(state,action,reason,details){return{state,action,reason,...details};}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
