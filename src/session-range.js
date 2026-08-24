export const SESSION_RANGE_SHADOW_VERSION='sf-session-range-shadow-v1';
const FIFTEEN_MINUTES=15*60*1000;

export function assessSessionRange(candles,{atr=null,currentPrice=null}={}){
  if(!Array.isArray(candles)||candles.length<30)return insufficient('Not enough 15-minute history to estimate session range.');
  const completed=candles.slice(0,-1).filter(validCandle);
  const sessions=groupSessions(completed);
  if(sessions.length<3)return insufficient('At least three regular sessions are needed for a room-to-run shadow estimate.');

  const current=sessions.at(-1),prior=sessions.slice(0,-1),currentSummary=summarize(current.bars,currentPrice);
  if(!currentSummary)return insufficient('Current regular-session range could not be resolved.');
  const fullPrior=prior.map(s=>summarize(s.bars)).filter(Boolean).filter(s=>s.bars>=16);
  const sameTimePrior=prior.map(s=>summarize(s.bars.slice(0,Math.max(1,currentSummary.bars)))).filter(Boolean);
  if(fullPrior.length<2||sameTimePrior.length<2)return insufficient('Historical session-range sample is still too small.');

  const fullRanges=fullPrior.map(s=>s.rangePct),sameTimeRanges=sameTimePrior.map(s=>s.rangePct);
  const medianFullRangePct=median(fullRanges),p80FullRangePct=quantile(fullRanges,.8),sameTimeMedianRangePct=median(sameTimeRanges);
  const atrValue=positive(atr),price=positive(currentPrice)||currentSummary.close;
  const atrUsage=atrValue?currentSummary.range/atrValue:null;
  const medianRangeUsage=medianFullRangePct>0?currentSummary.rangePct/medianFullRangePct:null;
  const p80RangeUsage=p80FullRangePct>0?currentSummary.rangePct/p80FullRangePct:null;
  const sameTimePace=sameTimeMedianRangePct>0?currentSummary.rangePct/sameTimeMedianRangePct:null;
  const rangePosition=currentSummary.range>0?clamp((price-currentSummary.low)/currentSummary.range,0,1):.5;
  const remainingAtrPct=atrValue&&price?Math.max(0,atrValue-currentSummary.range)/price:null;
  const remainingMedianPct=Math.max(0,medianFullRangePct-currentSummary.rangePct);
  const rangeHeavy=(atrUsage!=null&&atrUsage>=.90)||(medianRangeUsage!=null&&medianRangeUsage>=.95);
  const fastPace=sameTimePace!=null&&sameTimePace>=1.50;
  const stretched=rangeHeavy&&rangePosition>=.80;
  const good=(atrUsage==null||atrUsage<.65)&&(medianRangeUsage==null||medianRangeUsage<.75)&&(sameTimePace==null||sameTimePace<1.35);
  const state=stretched?'STRETCHED':rangeHeavy||fastPace?'CAUTION':good?'GOOD':'NORMAL';
  const reason=state==='STRETCHED'
    ?'Price is near the top of a session that has already consumed most of its normal range. Shadow model flags chase risk.'
    :state==='CAUTION'
      ?'The session range is expanding faster or farther than normal. Shadow model sees less clean room remaining.'
      :state==='GOOD'
        ?'The session has used a relatively small share of its normal range, leaving favorable room-to-run in the shadow model.'
        :'Session range usage is near normal. The shadow model is neutral.';

  return{
    version:SESSION_RANGE_SHADOW_VERSION,
    shadowOnly:true,
    affectsBuyNow:false,
    state,
    reason,
    sessionDate:current.key,
    barsElapsed:currentSummary.bars,
    historicalSample:fullPrior.length,
    sameTimeSample:sameTimePrior.length,
    currentRange:currentSummary.range,
    currentRangePct:currentSummary.rangePct,
    sessionOpen:currentSummary.open,
    sessionHigh:currentSummary.high,
    sessionLow:currentSummary.low,
    rangePosition,
    atr:atrValue,
    atrUsage,
    medianFullRangePct,
    p80FullRangePct,
    medianRangeUsage,
    p80RangeUsage,
    sameTimeMedianRangePct,
    sameTimePace,
    remainingAtrPct,
    remainingMedianPct,
    thresholds:{goodAtrUsageMax:.65,goodMedianUsageMax:.75,cautionAtrUsage:.90,cautionMedianUsage:.95,fastPace:1.50,stretchedRangePosition:.80}
  };
}

export async function recordSessionRangeShadow(env,analysis,{source='execution-recheck',now=Date.now()}={}){
  const range=analysis?.sessionRangeShadow,symbol=sanitizeSymbol(analysis?.symbol);
  if(!env?.DB||!symbol||!range)return null;
  await ensureShadowSchema(env);
  const observedAt=Number(now)||Date.now(),observedBucket=Math.floor(observedAt/FIFTEEN_MINUTES)*FIFTEEN_MINUTES;
  await env.DB.prepare(`INSERT OR IGNORE INTO session_range_shadow_observations(
    symbol,model_version,source,observed_at,observed_bucket,production_status,price,shadow_state,
    atr_usage,median_range_usage,p80_range_usage,same_time_pace,range_position,current_range_pct,
    remaining_atr_pct,historical_sample,payload_json,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    symbol,String(range.version||SESSION_RANGE_SHADOW_VERSION),String(source||'execution-recheck'),observedAt,observedBucket,String(analysis.status||''),numOrNull(analysis?.latest?.close),String(range.state||'INSUFFICIENT'),
    numOrNull(range.atrUsage),numOrNull(range.medianRangeUsage),numOrNull(range.p80RangeUsage),numOrNull(range.sameTimePace),numOrNull(range.rangePosition),numOrNull(range.currentRangePct),
    numOrNull(range.remainingAtrPct),Number(range.historicalSample)||0,JSON.stringify(range),Date.now()
  ).run();
  return{symbol,observedAt,observedBucket,state:String(range.state||'INSUFFICIENT'),modelVersion:String(range.version||SESSION_RANGE_SHADOW_VERSION)};
}

export async function getSessionRangeShadowStatus(env){
  await ensureShadowSchema(env);
  const [total,states,last]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM session_range_shadow_observations`).first(),
    env.DB.prepare(`SELECT shadow_state AS state,COUNT(*) AS count FROM session_range_shadow_observations GROUP BY shadow_state ORDER BY shadow_state`).all(),
    env.DB.prepare(`SELECT symbol,production_status AS productionStatus,shadow_state AS shadowState,observed_at AS observedAt FROM session_range_shadow_observations ORDER BY observed_at DESC,id DESC LIMIT 1`).first()
  ]);
  return{modelVersion:SESSION_RANGE_SHADOW_VERSION,totalObservations:Number(total?.count)||0,byState:Object.fromEntries((states.results||[]).map(r=>[r.state,Number(r.count)||0])),last:last?{...last,observedAt:Number(last.observedAt)||0}:null};
}

async function ensureShadowSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS session_range_shadow_observations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    model_version TEXT NOT NULL,
    source TEXT NOT NULL,
    observed_at INTEGER NOT NULL,
    observed_bucket INTEGER NOT NULL,
    production_status TEXT NOT NULL DEFAULT '',
    price REAL,
    shadow_state TEXT NOT NULL,
    atr_usage REAL,
    median_range_usage REAL,
    p80_range_usage REAL,
    same_time_pace REAL,
    range_position REAL,
    current_range_pct REAL,
    remaining_atr_pct REAL,
    historical_sample INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    UNIQUE(symbol,model_version,observed_bucket)
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_session_range_shadow_time ON session_range_shadow_observations(observed_at DESC)`).run();
}
function groupSessions(candles){
  const map=new Map();
  for(const candle of candles){
    const key=easternSessionKey(candle.time);if(!key)continue;
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(candle);
  }
  return[...map.entries()].map(([key,bars])=>({key,bars:bars.sort((a,b)=>Number(a.time)-Number(b.time))}));
}
function summarize(bars,currentPrice=null){
  if(!Array.isArray(bars)||!bars.length)return null;
  const open=positive(bars[0]?.open),close=positive(currentPrice)||positive(bars.at(-1)?.close);
  const highs=bars.map(b=>Number(b.high)).filter(Number.isFinite),lows=bars.map(b=>Number(b.low)).filter(Number.isFinite);
  if(!open||!close||!highs.length||!lows.length)return null;
  const high=Math.max(...highs),low=Math.min(...lows),range=Math.max(0,high-low);
  return{open,close,high,low,range,rangePct:open?range/open:0,bars:bars.length};
}
function easternSessionKey(time){
  const ms=Number(time);if(!Number.isFinite(ms))return'';
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date(ms));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  if(p.weekday==='Sat'||p.weekday==='Sun')return'';
  return`${p.year}-${p.month}-${p.day}`;
}
function quantile(values,q){const a=(values||[]).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;if(a.length===1)return a[0];const pos=(a.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos),w=pos-lo;return a[lo]*(1-w)+a[hi]*w;}
function median(values){return quantile(values,.5);}
function validCandle(c){return Number.isFinite(Number(c?.time))&&positive(c?.open)&&positive(c?.high)&&positive(c?.low)&&positive(c?.close)&&Number(c.high)>=Number(c.low);}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function numOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function insufficient(reason){return{version:SESSION_RANGE_SHADOW_VERSION,shadowOnly:true,affectsBuyNow:false,state:'INSUFFICIENT',reason,historicalSample:0,sameTimeSample:0};}
