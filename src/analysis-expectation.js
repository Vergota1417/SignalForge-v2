const DISCOVERY_SLOTS=[615,675,735,795,855,915]; // 10:15 through 15:15 ET, Mon-Thu.
const WEEKLY_START=840; // Friday 14:00 ET.
const WEEKLY_BATCH_MINUTES=15;
const WEEKLY_BATCH_SIZE=6;

export async function buildAnalysisExpectations(env,{symbols=[],pool=[],cursor=0,now=Date.now()}={}){
  const currentWeek=investmentWeekKey(new Date(now));
  const [weeklyRows,researchRows]=await Promise.all([
    env.DB.prepare(`SELECT symbol,position,source FROM discovery_weekly_universe WHERE week_key=? ORDER BY position`).bind(currentWeek).all(),
    env.DB.prepare(`SELECT symbol,updated_at AS updatedAt FROM weekly_research WHERE week_key=?`).bind(currentWeek).all()
  ]);
  const weeklyMap=new Map((weeklyRows.results||[]).map(r=>[r.symbol,{position:Number(r.position)||0,source:r.source||'promoted'}]));
  const researched=new Map((researchRows.results||[]).map(r=>[r.symbol,Number(r.updatedAt)||0]));
  const weeklyLocked=(weeklyRows.results||[]).length>0;
  const poolIndex=new Map((pool||[]).map((symbol,index)=>[symbol,index]));
  const nextPromotion=nextPromotionDecision(now,weeklyLocked);
  const result={};

  for(const symbol of symbols||[]){
    const weekly=weeklyMap.get(symbol),researchedAt=researched.get(symbol)||0;
    const discovery=estimateDiscoveryScan({index:poolIndex.get(symbol),cursor,poolSize:pool.length,now});
    let deepAnalysis;
    if(researchedAt){
      deepAnalysis={state:'ANALYZED',estimated:false,at:researchedAt,label:'Deep analysis completed',reason:'A saved weekly deep analysis exists for this week.'};
    }else if(weekly){
      const at=weeklyBatchTime(currentWeek,weekly.position);
      deepAnalysis={state:at<=now?'DUE / RETRY':'SCHEDULED',estimated:true,at,label:at<=now?'Deep analysis due / retry pending':'Deep analysis scheduled',reason:`Promoted to this week's research shortlist (${weekly.source}). Provider failures can delay the exact batch.`};
    }else if(weeklyLocked){
      deepAnalysis={state:'NOT SELECTED THIS WEEK',estimated:true,at:nextPromotion,label:'Next promotion opportunity',reason:'This symbol was not promoted into the locked weekly deep-research shortlist. It can still move in Discovery and be reconsidered next week.'};
    }else{
      deepAnalysis={state:'PROMOTION PENDING',estimated:true,at:nextPromotion,label:'Promotion decision expected',reason:'Discovery activity determines whether this symbol is promoted into Friday deep research. Promotion is not guaranteed.'};
    }
    result[symbol]={discovery,deepAnalysis,marketDriven:true,note:'The schedule determines when SignalForge checks. Market data determines whether the state actually changes.'};
  }
  return result;
}

export function estimateDiscoveryScan({index,cursor=0,poolSize=0,now=Date.now(),batchSize=5}={}){
  if(!(poolSize>0)||!Number.isInteger(index)||index<0)return{state:'UNKNOWN',estimated:true,at:nextDiscoveryRun(now,0),label:'Next discovery window',reason:'This symbol is not in the current frozen discovery pool.'};
  const normalizedCursor=((Number(cursor)||0)%poolSize+poolSize)%poolSize;
  const distance=(index-normalizedCursor+poolSize)%poolSize;
  const batchesAhead=Math.floor(distance/Math.max(1,batchSize));
  const at=nextDiscoveryRun(now,batchesAhead);
  return{state:'SCHEDULED',estimated:true,at,label:'Estimated next discovery scan',batchesAhead,reason:'Estimated from the symbol position in the frozen 120-name pool and the five-symbol Radar batch schedule.'};
}

export function nextDiscoveryRun(now=Date.now(),runsAhead=0){
  let remaining=Math.max(0,Number(runsAhead)||0),cursor=Number(now);
  for(let guard=0;guard<40;guard++){
    const parts=easternParts(new Date(cursor)),weekday=weekdayIndex(parts.weekday),minutes=Number(parts.hour)*60+Number(parts.minute);
    if(weekday>=1&&weekday<=4){
      for(const slot of DISCOVERY_SLOTS){
        if(slot>minutes||guard>0||cursor===0){
          if(remaining===0)return easternLocalToUtc(Number(parts.year),Number(parts.month),Number(parts.day),Math.floor(slot/60),slot%60);
          remaining--;
        }
      }
    }
    const next=addEasternDays(parts,1);cursor=easternLocalToUtc(next.year,next.month,next.day,0,0);
  }
  return 0;
}

export function nextPromotionDecision(now=Date.now(),weeklyLocked=false){
  const p=easternParts(new Date(now)),weekday=weekdayIndex(p.weekday),minutes=Number(p.hour)*60+Number(p.minute);
  if(!weeklyLocked&&weekday<=5&&!(weekday===5&&minutes>=WEEKLY_START)){
    const days=5-weekday,friday=addEasternDays(p,days);return easternLocalToUtc(friday.year,friday.month,friday.day,14,0);
  }
  const days=weekday<5?5-weekday:12-weekday,friday=addEasternDays(p,days||7);return easternLocalToUtc(friday.year,friday.month,friday.day,14,0);
}

export function weeklyBatchTime(weekKey,position){
  const [year,month,day]=String(weekKey).split('-').map(Number),monday={year,month,day};
  const friday=addEasternDays({...monday,weekday:'Mon'},4),batch=Math.floor((Number(position)||0)/WEEKLY_BATCH_SIZE),minutes=WEEKLY_START+batch*WEEKLY_BATCH_MINUTES;
  return easternLocalToUtc(friday.year,friday.month,friday.day,Math.floor(minutes/60),minutes%60);
}

export function investmentWeekKey(date=new Date()){
  const p=easternParts(date),base=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))),weekday=(base.getUTCDay()+6)%7;base.setUTCDate(base.getUTCDate()-weekday);return base.toISOString().slice(0,10);
}

function easternParts(date){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
function weekdayIndex(v){return{Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[v]??0;}
function addEasternDays(parts,days){const d=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)+days));return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};}
function easternLocalToUtc(year,month,day,hour,minute){
  const desired=Date.UTC(year,month-1,day,hour,minute);let guess=desired;
  for(let i=0;i<3;i++){
    const p=easternParts(new Date(guess)),actual=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));guess+=desired-actual;
  }
  return guess;
}
