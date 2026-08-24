export function unifiedActionState({signal=null,earlyMovement=null}={}){
  const status=String(signal?.status||signal?.analysis?.status||'NOT ANALYZED');
  const analysis=signal?.analysis||null,movement=earlyMovement||{},acceleration=finite(movement.acceleration),readiness=analysis?finite(analysis.readiness):null;
  const gates=analysis?.engines?Object.values(analysis.engines).filter(Boolean):[],gatesReady=gates.filter(x=>x?.ready).length,gateTotal=gates.length||4;
  const failed=Array.isArray(analysis?.criticalFailed)?analysis.criticalFailed:[],confirmation=analysis?.intradayConfirmation||null;
  const participation={checked:Boolean(confirmation),pass:Boolean(confirmation?.pass),corePass:Boolean(confirmation?.participationPass),passes:confirmation?finite(confirmation.passes):0,total:confirmation?finite(confirmation.total)||5:5,relativeVolume:confirmation?finite(confirmation.relativeVolume):null,momentum4:confirmation?finite(confirmation.momentum4):null,state:String(confirmation?.state||'NOT CHECKED'),reason:String(confirmation?.reason||'Participation/execution confirmation has not been checked yet.')};
  const details={acceleration,readiness,gatesReady,gateTotal,failed,participation};
  if(status==='SELL / EXIT')return result('SELL / EXIT','EXIT','Saved analysis says the thesis is broken.',details);
  if(status==='AVOID')return result('AVOID','DO NOT ENTER',analysis?.reason||'Deep analysis rejects a new entry.',details);
  if(status==='BUY NOW'&&participation.pass)return result('BUY NOW','BUY WINDOW OPEN','Higher-timeframe gates and live participation/execution confirmation are aligned.',details);
  if(status==='BUY NOW')return result('READY SOON','WAIT FOR PARTICIPATION',participation.reason,details);
  if(status==='WAIT FOR PULLBACK')return result('WAIT FOR PULLBACK','DO NOT CHASE','The setup is attractive but price is extended.',details);
  if(status==='SETUP — READY SOON')return result('READY SOON','PREPARE — WAIT FOR FINAL GATE',failed.length?`Waiting on: ${failed.join(', ')}.`:analysis?.reason||participation.reason,details);
  if(movement.state==='EARLY MOVEMENT — BUILDING')return result('BUILDING','WATCH CLOSELY — NOT A BUY',movement.reasons?.length?movement.reasons.join(' · '):'Participation is accelerating before the full setup is ready.',details);
  if(movement.state==='MOVEMENT WATCH')return result('WATCH','MONITOR','Participation is improving, but evidence is not strong enough for action.',details);
  return result(analysis?'WAIT':'QUIET',analysis?'WAIT FOR SETUP':'NO ACTION',failed.length?`Waiting on: ${failed.join(', ')}.`:'No meaningful early movement is confirmed yet.',details);
}
function result(state,action,reason,details){return{state,action,reason,...details};}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:0;}
