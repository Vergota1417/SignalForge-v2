export const OPENING_RANGE_SHADOW_VERSION='sf-opening-range-shadow-v1';
const FIFTEEN_MINUTES=15*60*1000;
const OR30_BARS=2;
const OR60_BARS=4;
const ACCEPT_CLOSES_REQUIRED=2;
const ACCEPT_LOOKBACK=3;
const LEVEL_TOLERANCE=.0015;

export function assessOpeningRange(candles,{currentPrice=null}={}){
  if(!Array.isArray(candles)||candles.length<20)return insufficient('Not enough completed 15-minute candles to assess opening structure.');
  const completed=candles.slice(0,-1).filter(validCandle),sessions=groupSessions(completed);
  if(sessions.length<2)return insufficient('At least two regular sessions are needed for opening-range context.');
  const current=sessions.at(-1),prior=sessions.at(-2),bars=current.bars;
  if(bars.length<OR30_BARS)return insufficient('The first 30 minutes have not completed yet.');

  const or30=rangeOf(bars.slice(0,Math.min(OR30_BARS,bars.length)));
  const or60=bars.length>=OR60_BARS?rangeOf(bars.slice(0,OR60_BARS)):null;
  const activeRange=or60||or30,activeWindow=or60?'60m':'30m',postBars=bars.slice(or60?OR60_BARS:OR30_BARS);
  const latestPrice=positive(currentPrice)||positive(bars.at(-1)?.close),priorSummary=rangeOf(prior.bars);
  if(!activeRange||!latestPrice||!priorSummary)return insufficient('Opening-range reference levels could not be resolved.');

  const upside=assessSide(postBars,activeRange.high,'UP');
  const downside=assessSide(postBars,activeRange.low,'DOWN');
  const above=latestPrice>activeRange.high,bellow=latestPrice<activeRange.low;
  let state='INSIDE RANGE',direction='NONE',reason='Price remains inside the opening range; no directional acceptance has been proven yet.';
  if(upside.retestHeld){state='RETEST HELD';direction='UP';reason='Price broke above the opening range, retested the breakout area, and closed back above it. Shadow structure shows constructive acceptance.';}
  else if(downside.retestHeld){state='RETEST HELD';direction='DOWN';reason='Price broke below the opening range, retested the breakdown area, and closed back below it. Shadow structure shows downside acceptance.';}
  else if(upside.accepted){state='ACCEPTED';direction='UP';reason='Multiple completed 15-minute closes are holding above the opening range. Shadow structure sees upside acceptance.';}
  else if(downside.accepted){state='ACCEPTED';direction='DOWN';reason='Multiple completed 15-minute closes are holding below the opening range. Shadow structure sees downside acceptance.';}
  else if(upside.rejected){state='REJECTED';direction='UP';reason='Price traded above the opening range but failed back inside it. Shadow structure flags an upside breakout rejection.';}
  else if(downside.rejected){state='REJECTED';direction='DOWN';reason='Price traded below the opening range but recovered back inside it. Shadow structure flags a downside breakout rejection.';}
  else if(above){state='BREAKOUT TEST';direction='UP';reason='Price is above the opening range, but there are not yet enough completed closes to call the breakout accepted.';}
  else if(bellow){state='BREAKOUT TEST';direction='DOWN';reason='Price is below the opening range, but there are not yet enough completed closes to call the breakdown accepted.';}

  const width=Math.max(.0001,activeRange.high-activeRange.low),position=(latestPrice-activeRange.low)/width;
  return{
    version:OPENING_RANGE_SHADOW_VERSION,
    shadowOnly:true,
    affectsBuyNow:false,
    state,direction,reason,
    sessionDate:current.key,
    barsElapsed:bars.length,
    activeWindow,
    openingRange30:or30,
    openingRange60:or60,
    activeHigh:activeRange.high,
    activeLow:activeRange.low,
    activeMid:(activeRange.high+activeRange.low)/2,
    activeWidthPct:activeRange.open?(activeRange.high-activeRange.low)/activeRange.open:null,
    price:latestPrice,
    positionInOpeningRange:position,
    postOpeningBars:postBars.length,
    upside,
    downside,
    previousDay:{high:priorSummary.high,low:priorSummary.low,close:priorSummary.close,open:priorSummary.open},
    distanceToPreviousHighPct:priorSummary.high?priorSummary.high/latestPrice-1:null,
    distanceToPreviousLowPct:priorSummary.low?latestPrice/priorSummary.low-1:null,
    thresholds:{openingRange30Bars:OR30_BARS,openingRange60Bars:OR60_BARS,acceptClosesRequired:ACCEPT_CLOSES_REQUIRED,acceptLookback:ACCEPT_LOOKBACK,levelTolerance:LEVEL_TOLERANCE}
  };
}

export async function recordOpeningRangeShadow(env,analysis,{source='execution-recheck',now=Date.now()}={}){
  const shadow=analysis?.openingRangeShadow,symbol=sanitizeSymbol(analysis?.symbol);
  if(!env?.DB||!symbol||!shadow)return null;
  await ensureShadowSchema(env);
  const observedAt=Number(now)||Date.now(),observedBucket=Math.floor(observedAt/FIFTEEN_MINUTES)*FIFTEEN_MINUTES;
  await env.DB.prepare(`INSERT OR IGNORE INTO opening_range_shadow_observations(
    symbol,model_version,source,observed_at,observed_bucket,production_status,price,shadow_state,direction,
    active_window,opening_high,opening_low,opening_width_pct,position_in_range,previous_day_high,previous_day_low,
    accepted,rejected,retest_held,payload_json,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    symbol,String(shadow.version||OPENING_RANGE_SHADOW_VERSION),String(source||'execution-recheck'),observedAt,observedBucket,String(analysis.status||''),numOrNull(analysis?.latest?.close),String(shadow.state||'INSUFFICIENT'),String(shadow.direction||'NONE'),
    String(shadow.activeWindow||''),numOrNull(shadow.activeHigh),numOrNull(shadow.activeLow),numOrNull(shadow.activeWidthPct),numOrNull(shadow.positionInOpeningRange),numOrNull(shadow.previousDay?.high),numOrNull(shadow.previousDay?.low),
    boolInt(shadow.upside?.accepted||shadow.downside?.accepted),boolInt(shadow.upside?.rejected||shadow.downside?.rejected),boolInt(shadow.upside?.retestHeld||shadow.downside?.retestHeld),JSON.stringify(shadow),Date.now()
  ).run();
  return{symbol,observedAt,observedBucket,state:String(shadow.state||'INSUFFICIENT'),direction:String(shadow.direction||'NONE'),modelVersion:String(shadow.version||OPENING_RANGE_SHADOW_VERSION)};
}

export async function getOpeningRangeShadowStatus(env){
  await ensureShadowSchema(env);
  const [total,states,last]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM opening_range_shadow_observations`).first(),
    env.DB.prepare(`SELECT shadow_state AS state,COUNT(*) AS count FROM opening_range_shadow_observations GROUP BY shadow_state ORDER BY shadow_state`).all(),
    env.DB.prepare(`SELECT symbol,production_status AS productionStatus,shadow_state AS shadowState,direction,observed_at AS observedAt FROM opening_range_shadow_observations ORDER BY observed_at DESC,id DESC LIMIT 1`).first()
  ]);
  return{modelVersion:OPENING_RANGE_SHADOW_VERSION,totalObservations:Number(total?.count)||0,byState:Object.fromEntries((states.results||[]).map(r=>[r.state,Number(r.count)||0])),last:last?{...last,observedAt:Number(last.observedAt)||0}:null};
}

function assessSide(postBars,level,direction){
  if(!postBars.length)return{accepted:false,rejected:false,retestHeld:false,breakoutSeen:false,outsideCloses:0,lastThreeOutsideCloses:0};
  const isOutside=direction==='UP'?(b)=>Number(b.close)>level:(b)=>Number(b.close)<level;
  const tradedOutside=direction==='UP'?(b)=>Number(b.high)>level*(1+LEVEL_TOLERANCE):(b)=>Number(b.low)<level*(1-LEVEL_TOLERANCE);
  const backInside=direction==='UP'?(b)=>Number(b.close)<=level:(b)=>Number(b.close)>=level;
  const breakoutIndex=postBars.findIndex(tradedOutside),breakoutSeen=breakoutIndex>=0;
  const recent=postBars.slice(-ACCEPT_LOOKBACK),lastThreeOutsideCloses=recent.filter(isOutside).length;
  const outsideCloses=postBars.filter(isOutside).length,accepted=breakoutSeen&&lastThreeOutsideCloses>=ACCEPT_CLOSES_REQUIRED&&isOutside(postBars.at(-1));
  const afterBreakout=breakoutSeen?postBars.slice(breakoutIndex+1):[];
  const retestHeld=accepted&&afterBreakout.some(b=>direction==='UP'
    ?Number(b.low)<=level*(1+LEVEL_TOLERANCE)&&Number(b.close)>level
    :Number(b.high)>=level*(1-LEVEL_TOLERANCE)&&Number(b.close)<level);
  const rejected=breakoutSeen&&!accepted&&backInside(postBars.at(-1))&&recent.slice(-2).every(backInside);
  return{accepted,rejected,retestHeld,breakoutSeen,outsideCloses,lastThreeOutsideCloses,breakoutIndex};
}
function groupSessions(candles){
  const map=new Map();
  for(const candle of candles){const key=easternSessionKey(candle.time);if(!key)continue;if(!map.has(key))map.set(key,[]);map.get(key).push(candle);}
  return[...map.entries()].map(([key,bars])=>({key,bars:bars.sort((a,b)=>Number(a.time)-Number(b.time))}));
}
function rangeOf(bars){
  if(!Array.isArray(bars)||!bars.length)return null;
  const open=positive(bars[0]?.open),close=positive(bars.at(-1)?.close),highs=bars.map(b=>Number(b.high)).filter(Number.isFinite),lows=bars.map(b=>Number(b.low)).filter(Number.isFinite);
  if(!open||!close||!highs.length||!lows.length)return null;
  return{open,close,high:Math.max(...highs),low:Math.min(...lows),bars:bars.length};
}
function easternSessionKey(time){
  const ms=Number(time);if(!Number.isFinite(ms))return'';
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date(ms)),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  if(p.weekday==='Sat'||p.weekday==='Sun')return'';return`${p.year}-${p.month}-${p.day}`;
}
async function ensureShadowSchema(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS opening_range_shadow_observations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,symbol TEXT NOT NULL,model_version TEXT NOT NULL,source TEXT NOT NULL,
    observed_at INTEGER NOT NULL,observed_bucket INTEGER NOT NULL,production_status TEXT NOT NULL DEFAULT '',price REAL,
    shadow_state TEXT NOT NULL,direction TEXT NOT NULL DEFAULT 'NONE',active_window TEXT,opening_high REAL,opening_low REAL,
    opening_width_pct REAL,position_in_range REAL,previous_day_high REAL,previous_day_low REAL,accepted INTEGER,rejected INTEGER,
    retest_held INTEGER,payload_json TEXT NOT NULL DEFAULT '{}',created_at INTEGER NOT NULL,
    UNIQUE(symbol,model_version,observed_bucket)
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_opening_range_shadow_time ON opening_range_shadow_observations(observed_at DESC)`).run();
}
function validCandle(c){return Number.isFinite(Number(c?.time))&&positive(c?.open)&&positive(c?.high)&&positive(c?.low)&&positive(c?.close)&&Number(c.high)>=Number(c.low);}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function numOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function boolInt(v){return v?1:0;}
function sanitizeSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
function insufficient(reason){return{version:OPENING_RANGE_SHADOW_VERSION,shadowOnly:true,affectsBuyNow:false,state:'INSUFFICIENT',direction:'NONE',reason};}
