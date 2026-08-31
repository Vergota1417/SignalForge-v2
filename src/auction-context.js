const DAY=86_400_000;

export const AUCTION_METHOD_VERSION='signalforge-auction-v0';

export function assessAuctionContext(candles,{symbol='',currentPrice=null}={}){
  const bars=(Array.isArray(candles)?candles:[]).filter(valid).sort((a,b)=>Number(a.time)-Number(b.time));
  if(bars.length<30)return insufficient('Not enough 15-minute history for the auction-method V0.');
  const completed=bars.slice(0,-1),latest=completed.at(-1),price=positive(currentPrice)||positive(latest?.close);
  if(!price)return insufficient('Current price could not be resolved.');

  const structure=classifyStructure(completed);
  const regime=classifyRegime(completed,structure);
  const profile=volumeProfile(completed.slice(-96),price);
  const path=sessionPath(completed,price);
  const location=classifyLocation(price,profile,path);
  const confirmation=basicConfirmation(completed,structure,regime);
  const score=scoreMethod({structure,regime,location,path,confirmation});
  const status=statusFromScore(score,{regime,location,confirmation});

  return{
    version:AUCTION_METHOD_VERSION,
    shadowOnly:true,
    affectsBuyNow:false,
    symbol:String(symbol||'').toUpperCase(),
    timeframe:'15m',
    price,
    status,
    score,
    methodSequence:['ENVIRONMENT','LOCATION','PATH','CONFIRMATION','EXECUTION'],
    environment:{regime:regime.state,bias:structure.bias,structure:structure.state,confidence:regime.confidence},
    location:{state:location.state,reason:location.reason,price,rangePosition:location.rangePosition,premiumDiscount:location.premiumDiscount,...profile},
    path,
    confirmation,
    coverage:{environment:true,structure:true,volumeProfile:true,premiumDiscount:true,sessionPath:true,basicParticipation:true,footprint:false,deltaCvd:false,advancedAbsorption:false,gex:false,l2Liquidity:false,mbo:false},
    limitations:['V0 uses candle OHLCV, not true bid/ask footprint data.','Volume profile is estimated by distributing each candle volume across price bins.','Current provider data is stock/ETF focused; futures Asia/London session logic requires a futures-capable feed.'],
    reason:statusReason(status,{regime,structure,location,path,confirmation})
  };
}

function classifyStructure(bars){
  const closes=bars.map(x=>Number(x.close)),latest=closes.at(-1),s20=sma(closes,20),s50=sma(closes,50);
  const recent=bars.slice(-24),early=recent.slice(0,12),late=recent.slice(-12);
  const earlyHigh=Math.max(...early.map(x=>Number(x.high))),earlyLow=Math.min(...early.map(x=>Number(x.low))),lateHigh=Math.max(...late.map(x=>Number(x.high))),lateLow=Math.min(...late.map(x=>Number(x.low)));
  const up=latest>s20&&s20>s50&&lateHigh>=earlyHigh&&lateLow>=earlyLow;
  const down=latest<s20&&s20<s50&&lateHigh<=earlyHigh&&lateLow<=earlyLow;
  return{state:up?'HIGHER_HIGHS_HIGHER_LOWS':down?'LOWER_HIGHS_LOWER_LOWS':'MIXED',bias:up?'BULLISH':down?'BEARISH':'NEUTRAL',sma20:s20,sma50:s50};
}

function classifyRegime(bars,structure){
  const closes=bars.map(x=>Number(x.close)),returns=[];for(let i=1;i<closes.length;i++)returns.push(Math.abs(closes[i]/closes[i-1]-1));
  const current=average(returns.slice(-12)),baseline=average(returns.slice(-48,-12))||current||0.0001;
  const ratio=current/baseline;let state='BALANCE_ROTATION';
  if(structure.bias!=='NEUTRAL'&&ratio>=1.05)state='INITIATIVE_EXPANSION';else if(ratio<=.72)state='LOW_PARTICIPATION_COMPRESSION';
  const confidence=Math.round(clamp((Math.abs(ratio-1)*70)+(structure.bias==='NEUTRAL'?55:68),45,95));
  return{state,volatilityRatio:ratio,confidence};
}

function volumeProfile(bars,price){
  const low=Math.min(...bars.map(x=>Number(x.low))),high=Math.max(...bars.map(x=>Number(x.high))),range=Math.max(high-low,price*.001),bins=36,step=range/bins,volumes=Array(bins).fill(0);
  for(const bar of bars){const lo=clamp(Math.floor((Number(bar.low)-low)/step),0,bins-1),hi=clamp(Math.floor((Number(bar.high)-low)/step),0,bins-1),count=Math.max(1,hi-lo+1),share=(Number(bar.volume)||0)/count;for(let i=lo;i<=hi;i++)volumes[i]+=share;}
  const total=volumes.reduce((a,b)=>a+b,0),pocIndex=volumes.indexOf(Math.max(...volumes));let included=new Set([pocIndex]),used=volumes[pocIndex]||0,left=pocIndex-1,right=pocIndex+1;
  while(total>0&&used/total<.70&&(left>=0||right<bins)){const lv=left>=0?volumes[left]:-1,rv=right<bins?volumes[right]:-1;if(rv>lv){included.add(right);used+=Math.max(0,rv);right++;}else{included.add(left);used+=Math.max(0,lv);left--;}}
  const idx=[...included].sort((a,b)=>a-b),val=low+(idx[0]||0)*step,vah=low+((idx.at(-1)||0)+1)*step,poc=low+(pocIndex+.5)*step;
  return{poc,VAL:val,VAH:vah,profileLow:low,profileHigh:high,valueAreaVolumePct:total?used/total:0};
}

function sessionPath(bars,price){
  const grouped=new Map();for(const b of bars){const key=easternDate(b.time);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(b);}const sessions=[...grouped.entries()].map(([key,rows])=>({key,rows})).filter(x=>x.rows.length>=8);
  const current=sessions.at(-1),prior=sessions.at(-2);if(!current)return{state:'INSUFFICIENT',currentSession:null,priorSession:null,priorHighSwept:false,priorLowSwept:false,openingDrive:'UNKNOWN'};
  const cs=summarize(current.rows),ps=prior?summarize(prior.rows):null,first=Math.min(4,current.rows.length),openRows=current.rows.slice(0,first),openingClose=Number(openRows.at(-1)?.close)||cs.open;
  const openingDrive=openingClose>cs.open*1.001?'UP':openingClose<cs.open*.999?'DOWN':'BALANCED';
  return{state:'READY',currentSession:cs,priorSession:ps,priorHighSwept:Boolean(ps&&cs.high>ps.high&&price<ps.high),priorLowSwept:Boolean(ps&&cs.low<ps.low&&price>ps.low),openingDrive};
}

function classifyLocation(price,profile,path){
  const width=Math.max(profile.profileHigh-profile.profileLow,price*.001),rangePosition=clamp((price-profile.profileLow)/width,0,1);
  let state='INSIDE_VALUE',premiumDiscount='VALUE',reason='Price is trading inside the estimated value area.';
  if(price<profile.VAL){state='BELOW_VALUE';premiumDiscount='DISCOUNT';reason='Price is below estimated value area low, a discount location in the active range.';}
  else if(price>profile.VAH){state='ABOVE_VALUE';premiumDiscount='PREMIUM';reason='Price is above estimated value area high, a premium location in the active range.';}
  if(path?.priorLowSwept&&price<=profile.poc){reason+=' Prior-session low was swept and reclaimed.';}
  if(path?.priorHighSwept&&price>=profile.poc){reason+=' Prior-session high was swept and rejected.';}
  return{state,premiumDiscount,rangePosition,reason};
}

function basicConfirmation(bars,structure,regime){
  const recent=bars.slice(-4),prior=bars.slice(-8,-4),recentVol=average(recent.map(x=>Number(x.volume)||0)),priorVol=average(prior.map(x=>Number(x.volume)||0))||recentVol||1;
  const volumeRatio=recentVol/priorVol,priceResponse=Number(recent.at(-1)?.close)/Number(recent[0]?.open)-1;
  const direction=priceResponse>.001?'BUYERS':priceResponse<-.001?'SELLERS':'NEUTRAL';
  const aligned=structure.bias==='BULLISH'?priceResponse>0:structure.bias==='BEARISH'?priceResponse<0:false;
  const pass=aligned&&volumeRatio>=.9&&regime.state!=='LOW_PARTICIPATION_COMPRESSION';
  return{state:pass?'CONFIRMED':aligned?'PARTIAL':'NOT_CONFIRMED',pass,volumeRatio,priceResponse,direction,reason:pass?'Recent price response and volume participation align with structure.':aligned?'Price direction aligns, but participation is not strong enough yet.':'Recent price response does not yet confirm the structural bias.'};
}

function scoreMethod({structure,regime,location,path,confirmation}){let s=0;if(structure.bias!=='NEUTRAL')s+=22;if(regime.state==='INITIATIVE_EXPANSION')s+=18;else if(regime.state==='BALANCE_ROTATION')s+=10;if((structure.bias==='BULLISH'&&location.premiumDiscount==='DISCOUNT')||(structure.bias==='BEARISH'&&location.premiumDiscount==='PREMIUM'))s+=24;else if(location.premiumDiscount==='VALUE')s+=10;if((structure.bias==='BULLISH'&&path.priorLowSwept)||(structure.bias==='BEARISH'&&path.priorHighSwept))s+=16;if(confirmation.pass)s+=20;else if(confirmation.state==='PARTIAL')s+=10;return Math.round(clamp(s,0,100));}
function statusFromScore(score,{regime,location,confirmation}){if(regime.state==='LOW_PARTICIPATION_COMPRESSION'&&score<70)return'AVOID';if(score>=80&&confirmation.pass)return'BUY NOW CANDIDATE';if(score>=62)return'SETUP — READY SOON';if(score>=42)return'WAIT FOR CONFIRMATION';return'AVOID';}
function statusReason(status,x){return`${status}: ${x.regime.state}; ${x.structure.bias} structure; ${x.location.premiumDiscount.toLowerCase()} location; ${x.confirmation.reason}`;}
function summarize(rows){return{date:easternDate(rows[0].time),open:Number(rows[0].open),high:Math.max(...rows.map(x=>Number(x.high))),low:Math.min(...rows.map(x=>Number(x.low))),close:Number(rows.at(-1).close),bars:rows.length};}
function easternDate(time){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(time)));}
function sma(a,p){return a.length>=p?average(a.slice(-p)):average(a);}
function average(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function valid(c){return Number.isFinite(Number(c?.time))&&positive(c?.open)&&positive(c?.high)&&positive(c?.low)&&positive(c?.close)&&Number.isFinite(Number(c?.volume))&&Number(c.high)>=Number(c.low);}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function insufficient(reason){return{version:AUCTION_METHOD_VERSION,shadowOnly:true,affectsBuyNow:false,status:'INSUFFICIENT',score:0,reason,coverage:{environment:false,structure:false,volumeProfile:false,premiumDiscount:false,sessionPath:false,basicParticipation:false,footprint:false,deltaCvd:false,advancedAbsorption:false,gex:false,l2Liquidity:false,mbo:false},limitations:[reason]};}
