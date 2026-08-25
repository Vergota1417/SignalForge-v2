export const ACTIVITY_RHYTHM_VERSION='sf-activity-rhythm-shadow-v1';
const FIFTEEN_MINUTES=15*60*1000;
const SESSION_START_MINUTE=9*60+30;
const SESSION_END_MINUTE=16*60;

export function assessActivityRhythm(candles){
  if(!Array.isArray(candles)||candles.length<30)return insufficient('Not enough 15-minute history to learn an intraday activity rhythm.');
  const completed=candles.slice(0,-1).filter(validCandle).filter(inRegularSession);
  const sessions=groupSessions(completed);
  if(sessions.length<3)return insufficient('At least three regular sessions are needed to compare this time of day with normal activity.');

  const current=sessions.at(-1),prior=sessions.slice(0,-1);
  if(!current?.bars?.length)return insufficient('Current regular-session bars are not available yet.');
  const historicalBuckets=buildHistoricalBuckets(prior);
  const profile=buildProfile(historicalBuckets,current.bars);
  if(!profile.length)return insufficient('Historical time-of-day buckets are still collecting.');

  const currentBar=current.bars.at(-1),currentKey=bucketKey(currentBar.time),currentRow=profile.find(row=>row.time===currentKey)||null;
  if(!currentRow||currentRow.historicalSample<2)return insufficient('The current 15-minute window does not yet have enough matched historical sessions.',profile,current.key,currentKey);

  const composite=activityMultiple(currentBar,currentRow);
  const score=Math.round(clamp(composite/2*100,0,100));
  const state=activityState(composite);
  const direction=priceDirection(currentBar);
  const priorRow=profile[profile.findIndex(row=>row.time===currentKey)-1]||null;
  const pace=priorRow?.today?.activityMultiple&&composite>priorRow.today.activityMultiple*1.08?'RISING':priorRow?.today?.activityMultiple&&composite<priorRow.today.activityMultiple*.92?'FADING':'STEADY';
  const nextActive=profile.find(row=>row.time>currentKey&&row.expectedIntensity>=70)||null;
  const historicalWindow=historicalWindowLabel(currentRow.expectedIntensity);
  const reason=reasonFor(state,currentRow,composite,pace,historicalWindow);

  return{
    version:ACTIVITY_RHYTHM_VERSION,
    shadowOnly:true,
    affectsBuyNow:false,
    state,
    score,
    reason,
    timeframe:'15m',
    sessionDate:current.key,
    currentTime:currentKey,
    currentPrice:Number(currentBar.close),
    currentVolume:Number(currentBar.volume)||0,
    currentRangePct:rangePct(currentBar),
    currentAbsMovePct:absMovePct(currentBar),
    relativeVolume:ratio(Number(currentBar.volume)||0,currentRow.expectedVolume),
    relativeRange:ratio(rangePct(currentBar),currentRow.expectedRangePct),
    relativeMove:ratio(absMovePct(currentBar),currentRow.expectedAbsMovePct),
    activityMultiple:composite,
    pace,
    direction,
    historicalWindow,
    nextHistoricallyActiveAt:nextActive?.time||null,
    historicalSample:currentRow.historicalSample,
    profile,
    thresholds:{quietMax:.70,normalMax:1.05,buildingMax:1.30,activeMax:1.75,surgeMin:1.75},
    weights:{volume:.55,range:.30,absoluteMove:.15}
  };
}

export async function recordActivityRhythmShadow(env,analysis,{source='execution-recheck',now=Date.now()}={}){
  const rhythm=analysis?.sessionRangeShadow?.activityRhythm||analysis?.activityRhythm,symbol=sanitizeSymbol(analysis?.symbol);
  if(!env?.DB||!symbol||!rhythm||rhythm.state==='INSUFFICIENT')return null;
  await ensureSchema(env);
  const observedAt=Number(now)||Date.now(),observedBucket=Math.floor(observedAt/FIFTEEN_MINUTES)*FIFTEEN_MINUTES;
  await env.DB.prepare(`INSERT OR IGNORE INTO activity_rhythm_shadow_observations(
    symbol,model_version,source,observed_at,observed_bucket,production_status,price,activity_state,
    activity_score,activity_multiple,relative_volume,relative_range,relative_move,historical_window,
    current_time,historical_sample,payload_json,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    symbol,String(rhythm.version||ACTIVITY_RHYTHM_VERSION),String(source||'execution-recheck'),observedAt,observedBucket,String(analysis.status||''),numOrNull(analysis?.latest?.close),String(rhythm.state||'NORMAL'),
    numOrNull(rhythm.score),numOrNull(rhythm.activityMultiple),numOrNull(rhythm.relativeVolume),numOrNull(rhythm.relativeRange),numOrNull(rhythm.relativeMove),String(rhythm.historicalWindow||''),
    String(rhythm.currentTime||''),Number(rhythm.historicalSample)||0,JSON.stringify(rhythm),Date.now()
  ).run();
  return{symbol,observedAt,observedBucket,state:String(rhythm.state||'NORMAL'),score:Number(rhythm.score)||0,modelVersion:String(rhythm.version||ACTIVITY_RHYTHM_VERSION)};
}

export async function getActivityRhythmShadowStatus(env){
  await ensureSchema(env);
  const [total,states,last]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM activity_rhythm_shadow_observations`).first(),
    env.DB.prepare(`SELECT activity_state AS state,COUNT(*) AS count FROM activity_rhythm_shadow_observations GROUP BY activity_state ORDER BY activity_state`).all(),
    env.DB.prepare(`SELECT symbol,production_status AS productionStatus,activity_state AS activityState,activity_score AS activityScore,current_time AS currentTime,observed_at AS observedAt FROM activity_rhythm_shadow_observations ORDER BY observed_at DESC,id DESC LIMIT 1`).first()
  ]);
  return{modelVersion:ACTIVITY_RHYTHM_VERSION,totalObservations:Number(total?.count)||0,byState:Object.fromEntries((states.results||[]).map(r=>[r.state,Number(r.count)||0])),last:last?{...last,activityScore:Number(last.activityScore)||0,observedAt:Number(last.observedAt)||0}:null};
}

function buildHistoricalBuckets(sessions){
  const map=new Map();
  for(const session of sessions){
    for(const bar of session.bars){
      const key=bucketKey(bar.time);if(!key)continue;
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(bar);
    }
  }
  return map;
}
function buildProfile(historicalBuckets,currentBars){
  const currentMap=new Map(currentBars.map(bar=>[bucketKey(bar.time),bar]));
  const rows=[];
  for(const [time,bars] of [...historicalBuckets.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
    if(bars.length<2)continue;
    rows.push({
      time,
      expectedVolume:median(bars.map(b=>Number(b.volume)||0).filter(v=>v>0)),
      expectedRangePct:median(bars.map(rangePct).filter(v=>v>0)),
      expectedAbsMovePct:median(bars.map(absMovePct).filter(v=>v>=0)),
      historicalSample:bars.length
    });
  }
  const raw=rows.map(r=>baselineRaw(r)),min=Math.min(...raw),max=Math.max(...raw),span=Math.max(1e-9,max-min);
  return rows.map((row,index)=>{
    const expectedIntensity=Math.round(clamp(((raw[index]-min)/span)*100,0,100));
    const bar=currentMap.get(row.time)||null;
    return{...row,expectedIntensity,today:bar?{volume:Number(bar.volume)||0,rangePct:rangePct(bar),absMovePct:absMovePct(bar),activityMultiple:activityMultiple(bar,row),score:Math.round(clamp(activityMultiple(bar,row)/2*100,0,100)),direction:priceDirection(bar)}:null};
  });
}
function baselineRaw(row){
  const volume=Math.log1p(Math.max(0,row.expectedVolume||0));
  const range=Math.max(0,row.expectedRangePct||0)*100;
  const move=Math.max(0,row.expectedAbsMovePct||0)*100;
  return volume+.9*range+.45*move;
}
function activityMultiple(bar,row){
  const volumeRatio=capRatio(ratio(Number(bar.volume)||0,row.expectedVolume));
  const rangeRatio=capRatio(ratio(rangePct(bar),row.expectedRangePct));
  const moveRatio=capRatio(ratio(absMovePct(bar),row.expectedAbsMovePct));
  return .55*volumeRatio+.30*rangeRatio+.15*moveRatio;
}
function activityState(value){if(value<.70)return'QUIET';if(value<1.05)return'NORMAL';if(value<1.30)return'BUILDING';if(value<1.75)return'ACTIVE';return'SURGE';}
function historicalWindowLabel(intensity){if(intensity>=75)return'HISTORICALLY HIGH';if(intensity<=25)return'HISTORICALLY QUIET';return'HISTORICALLY NORMAL';}
function reasonFor(state,row,multiple,pace,historicalWindow){
  const vr=ratio(row.today?.volume||0,row.expectedVolume),rr=ratio(row.today?.rangePct||0,row.expectedRangePct);
  if(state==='SURGE')return`Activity is ${multiple.toFixed(2)}x its normal composite pace for this 15-minute window. Volume is ${vr.toFixed(2)}x normal and range is ${rr.toFixed(2)}x normal.`;
  if(state==='ACTIVE')return`Trading activity is clearly above normal for this time of day (${multiple.toFixed(2)}x composite) and is ${pace.toLowerCase()}.`;
  if(state==='BUILDING')return`Participation is beginning to run above this ticker's normal time-of-day rhythm (${multiple.toFixed(2)}x composite).`;
  if(state==='QUIET')return`This window is trading below its normal activity rhythm (${multiple.toFixed(2)}x composite). ${historicalWindow}.`;
  return`Activity is near this ticker's normal time-of-day rhythm (${multiple.toFixed(2)}x composite). ${historicalWindow}.`;
}
function groupSessions(candles){
  const map=new Map();
  for(const candle of candles){const key=sessionKey(candle.time);if(!key)continue;if(!map.has(key))map.set(key,[]);map.get(key).push(candle);}
  return[...map.entries()].map(([key,bars])=>({key,bars:bars.sort((a,b)=>Number(a.time)-Number(b.time))}));
}
function inRegularSession(candle){const minute=easternMinute(candle?.time);return minute>=SESSION_START_MINUTE&&minute<SESSION_END_MINUTE;}
function sessionKey(time){const p=easternParts(time);if(!p||p.weekday==='Sat'||p.weekday==='Sun')return'';return`${p.year}-${p.month}-${p.day}`;}
function bucketKey(time){const p=easternParts(time);return p?`${p.hour}:${p.minute}`:'';}
function easternMinute(time){const p=easternParts(time);return p?Number(p.hour)*60+Number(p.minute):-1;}
function easternParts(time){const ms=Number(time);if(!Number.isFinite(ms))return null;const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
function rangePct(bar){const open=positive(bar?.open),high=positive(bar?.high),low=positive(bar?.low);return open&&high&&low?Math.max(0,(high-low)/open):0;}
function absMovePct(bar){const open=positive(bar?.open),close=positive(bar?.close);return open&&close?Math.abs(close/open-1):0;}
function priceDirection(bar){const open=Number(bar?.open),close=Number(bar?.close);if(!Number.isFinite(open)||!Number.isFinite(close))return'FLAT';return close>open?'UP':close<open?'DOWN':'FLAT';}
function ratio(value,expected){const v=Number(value),e=Number(expected);return Number.isFinite(v)&&Number.isFinite(e)&&e>0?v/e:1;}
function capRatio(v){return clamp(Number.isFinite(v)?v:1,.05,3);}
function median(values){const a=(values||[]).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const mid=Math.floor(a.length/2);return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;}
function validCandle(c){return Number.isFinite(Number(c?.time))&&positive(c?.open)&&positive(c?.high)&&positive(c?.low)&&positive(c?.close)&&Number(c.high)>=Number(c.low);}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function numOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function insufficient(reason,profile=[],sessionDate=null,currentTime=null){return{version:ACTIVITY_RHYTHM_VERSION,shadowOnly:true,affectsBuyNow:false,state:'INSUFFICIENT',score:null,reason,timeframe:'15m',sessionDate,currentTime,historicalSample:0,profile};}
