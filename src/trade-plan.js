const BUY_RR_MIN=1.8;
const STRETCH_R=2.5;

export function buildTradePlan(analysis){
  if(!analysis||typeof analysis!=='object')return null;
  const price=positive(analysis.latest?.close),entryLow=positive(analysis.preferredEntryLow),entryHigh=positive(analysis.preferredEntryHigh),stop=positive(analysis.thesisBreak),target1=positive(analysis.target),overextension=positive(analysis.overextension);
  if(!price)return null;
  const maxRrEntry=stop&&target1&&target1>stop?(target1+BUY_RR_MIN*stop)/(1+BUY_RR_MIN):null;
  const maxLocationEntry=entryHigh?entryHigh*1.03:null;
  const doNotEnterAbove=minPositive(maxRrEntry,maxLocationEntry,overextension);
  const target1Open=Boolean(target1&&target1>price),riskNow=stop&&price>stop?price-stop:null,rewardNow=target1Open?target1-price:null,currentRr=riskNow&&rewardNow!=null?rewardNow/riskNow:0;
  const entryReference=choosePlanningEntry({price,entryLow,entryHigh,doNotEnterAbove});
  const riskPerShare=stop&&entryReference&&entryReference>stop?entryReference-stop:null;
  const target2=riskPerShare?entryReference+STRETCH_R*riskPerShare:null;
  const horizon=Math.max(3,Math.round(Number(analysis.wf?.horizon)||5)),minSessions=Math.max(2,horizon-1),maxSessions=Math.min(20,Math.max(horizon+2,horizon*2));
  const status=String(analysis.status||'WAIT — SETUP NOT READY');
  const invalid=status==='AVOID'||status==='SELL / EXIT'||Boolean(stop&&price<=stop);
  const executionOpen=status==='BUY NOW'&&currentRr>=BUY_RR_MIN&&Boolean(doNotEnterAbove&&price<=doNotEnterAbove);
  const state=invalid?'INVALID':executionOpen?'OPEN':status==='SETUP — READY SOON'?'PREPARE':'WAIT';
  const blockers=[];
  if(!entryLow||!entryHigh)blockers.push('ENTRY ZONE');
  if(!stop)blockers.push('THESIS STOP');
  if(!target1Open)blockers.push('STRUCTURE TARGET');
  if(currentRr<BUY_RR_MIN)blockers.push('RISK / REWARD');
  if(doNotEnterAbove&&price>doNotEnterAbove)blockers.push('MAX ENTRY');
  if(status!=='BUY NOW')blockers.push('BUY NOW PERMISSION');
  const reason=state==='OPEN'
    ?'BUY NOW is open and the current price still preserves the production entry and reward/risk limits.'
    :state==='PREPARE'
      ?'The setup is close, but this plan is preparation only until SignalForge changes the live action to BUY NOW.'
      :state==='INVALID'
        ?'The current thesis is not valid for a new entry.'
        :'Keep the plan ready, but do not enter until the remaining production blockers clear.';
  return{
    symbol:String(analysis.symbol||'').toUpperCase(),state,reason,status,currentPrice:price,
    entry:{low:entryLow,high:entryHigh,reference:entryReference,doNotEnterAbove,maxRrEntry,maxLocationEntry},
    risk:{stop,riskPerShare,currentRr,requiredRr:BUY_RR_MIN},
    targets:{target1,target1Source:String(analysis.structure?.targetSource||'structure target'),target2,target2Type:`stretch ${STRETCH_R.toFixed(1)}R target`,stretchR:STRETCH_R},
    holdWindow:{minSessions,maxSessions,walkForwardHorizon:horizon,label:`Review over roughly ${minSessions}–${maxSessions} market sessions`},
    blockers:[...new Set(blockers)],permissionRequired:'BUY NOW',generatedAt:Date.now()
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
