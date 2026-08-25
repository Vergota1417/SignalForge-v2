import { evaluateStrategy } from './strategy.js';

const PARTIAL_FRACTION=.25;

export function evaluateManagedPosition(analysis,holding,previousStrategy=null){
  const base=evaluateStrategy(analysis,holding,null,previousStrategy);if(!base||base.mode!=='HOLDING')return base;
  if(base.state==='SELL / EXIT')return withManagement(base,{action:'EXIT',urgency:'HIGH'});
  const target=positive(base.target),price=positive(base.price),shares=positive(base.shares),gainPct=Number(base.gainPct)||0,targetReached=Boolean(target&&price&&price>=target);
  if(targetReached&&gainPct>0){
    const partialShares=shares?round6(shares*PARTIAL_FRACTION):null;
    return withManagement({...base,state:'TAKE PARTIAL PROFIT',reason:'The structure target has been reached while the thesis remains intact. Take a partial profit and let the protected remainder continue only while structure holds.',partial:{fraction:PARTIAL_FRACTION,shares:partialShares,remainingShares:shares&&partialShares!=null?round6(Math.max(0,shares-partialShares)):null,targetReached:true,targetPrice:target}}, {action:'TAKE PARTIAL PROFIT',urgency:'HIGH'});
  }
  if(base.state==='REDUCE'){
    const partialShares=shares?round6(shares*PARTIAL_FRACTION):null;
    return withManagement({...base,state:'TAKE PARTIAL PROFIT',reason:`${base.reason} SignalForge's default partial-management step is 25% of the tracked shares.`,partial:{fraction:PARTIAL_FRACTION,shares:partialShares,remainingShares:shares&&partialShares!=null?round6(Math.max(0,shares-partialShares)):null,targetReached:false,targetPrice:target}}, {action:'TAKE PARTIAL PROFIT',urgency:'HIGH'});
  }
  if(base.state==='PROTECT PROFIT')return withManagement(base,{action:'PROTECT PROFIT',urgency:'MEDIUM'});
  return withManagement(base,{action:'HOLD',urgency:'NORMAL'});
}

function withManagement(strategy,{action,urgency}){return{...strategy,management:{action,urgency,checkedAt:Date.now(),policy:'sf-position-manager-v1',partialFraction:PARTIAL_FRACTION}};}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function round6(v){return Math.floor((Number(v)+1e-12)*1e6)/1e6;}
