import { MIN_BUY_REWARD_RISK } from './hard-guardrails.js';

const BUY_RR_MIN=MIN_BUY_REWARD_RISK;
const STRETCH_R=2.5;

export function buildTradePlan(analysis){
  if(!analysis||typeof analysis!=='object')return null;
  const price=positive(analysis.latest?.close),entryLow=positive(analysis.preferredEntryLow),entryHigh=positive(analysis.preferredEntryHigh),stop=positive(analysis.thesisBreak),target1=positive(analysis.target),overextension=positive(analysis.overextension);
  if(!price)return null;
  const hardAuthorized=analysis?.hardBuyGuardrails?.pass===true;
  const maxRrEntry=stop&&target1&&target1>stop?(target1+BUY_RR_MIN*stop)/(1+BUY_RR_MIN):null;
  const maxLocationEntry=entryHigh?entryHigh*1.03:null;
  const doNotEnterAbove=minPositive(maxRrEntry,maxLocationEntry,overextension);
  const target1Open=Boolean(target1&&target1>price),riskNow=stop&&price>stop?price-stop:null,rewardNow=target1Open?target1-price:null,currentRr=riskNow&&rewardNow!=null?rewardNow/riskNow:0;
  const entryReference=choosePlanningEntry({price,entryLow,entryHigh,doNotEnterAbove});
  const riskPerShare=stop&&entryReference&&entryReference>stop?entryReference-stop:null;
  const stretchTarget=riskPerShare?entryReference+STRETCH_R*riskPerShare:null,target2=stretchTarget&&(!target1||stretchTarget>target1)?stretchTarget:null;
  const horizon=Math.max(3,Math.round(Number(analysis.wf?.horizon)||5)),minSessions=Math.max(2,horizon-1),maxSessions=Math.min(20,Math.max(horizon+2,horizon*2));
  const status=String(analysis.status||'WAIT — SETUP NOT READY');
  const invalid=status==='AVOID'||status==='SELL / EXIT'||Boolean(stop&&price<=stop);
  const executionOpen=status==='BUY NOW'&&hardAuthorized&&currentRr>=BUY_RR_MIN&&Boolean(doNotEnterAbove&&price<=doNotEnterAbove);
  const state=invalid?'INVALID':executionOpen?'OPEN':status==='SETUP — READY SOON'||status==='BUY NOW'?'PREPARE':'WAIT';
  const blockers=[];
  if(!entryLow||!entryHigh)blockers.push('ENTRY ZONE');
  if(!stop)blockers.push('THESIS STOP');
  if(!target1Open)blockers.push('STRUCTURE TARGET');
  if(currentRr<BUY_RR_MIN)blockers.push('RISK / REWARD');
  if(doNotEnterAbove&&price>doNotEnterAbove)blockers.push('MAX ENTRY');
  if(!hardAuthorized)blockers.push('HARD BUY AUTHORIZATION');
  if(status!=='BUY NOW')blockers.push('BUY NOW PERMISSION');
  const reason=state==='OPEN'
    ?'BUY NOW is open, hard authorization is verified, and the current price still preserves the production entry and reward/risk limits.'
    :state==='PREPARE'
      ?'This plan is preparation only. A live BUY NOW label is not executable unless the non-negotiable hard-guardrail proof is also present.'
      :state==='INVALID'
        ?'The current thesis is not valid for a new entry.'
        :'Keep the plan ready, but do not enter until the remaining production blockers clear.';
  return{
    symbol:String(analysis.symbol||'').toUpperCase(),state,reason,status,hardAuthorized,currentPrice:price,
    entry:{low:entryLow,high:entryHigh,reference:entryReference,doNotEnterAbove,maxRrEntry,maxLocationEntry},
    risk:{stop,riskPerShare,currentRr,requiredRr:BUY_RR_MIN},
    targets:{target1,target1Source:String(analysis.structure?.targetSource||'structure target'),target2,target2Type:target2?`stretch ${STRETCH_R.toFixed(1)}R target`:'structure target already exceeds stretch objective',stretchR:STRETCH_R},
    holdWindow:{minSessions,maxSessions,walkForwardHorizon:horizon,label:`Review over roughly ${minSessions}–${maxSessions} market sessions`},
    blockers:[...new Set(blockers)],permissionRequired:'BUY NOW + HARD GUARDRAILS',generatedAt:Date.now()
  };
}

function choosePlanningEntry({price,entryLow,entryHigh,doNotEnterAbove}){
  if(entryLow&&entryHigh){
    if(price>=entryLow&&price<=entryHigh)return price;
    if(price<entryLow)return entryLow;
    const capped=Math.min(entryHigh,doNotEnterAbove||entryHigh);return capped>0?capped:entryHigh;
  }
  return doNotEnterAbove?Math.min(price,doNotEnterAbove):price;
}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function minPositive(...values){const rows=values.map(positive).filter(Boolean);return rows.length?Math.min(...rows):null;}
