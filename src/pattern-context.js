export const PATTERN_CONTEXT_VERSION='sf-pattern-context-shadow-v1';

const DEFAULT_LOOKBACK=120;
const PIVOT_RADIUS=2;

export function assessPatternContext(candles,{atr=null,symbol=''}={}){
  const rows=(Array.isArray(candles)?candles:[]).filter(validCandle).slice(-DEFAULT_LOOKBACK);
  if(rows.length<35)return insufficient('At least 35 daily candles are needed for trendline and pattern context.');
  const price=positive(rows.at(-1)?.close);if(!price)return insufficient('Latest price could not be resolved.');
  const atrValue=positive(atr)||median(rows.slice(-20).map(c=>Number(c.high)-Number(c.low)))||price*.02;
  const tolerance=Math.max(atrValue*.42,price*.009);
  const pivots=findPivots(rows,PIVOT_RADIUS);
  const supportCluster=bestHorizontalCluster(pivots.lows,price,'support',tolerance,rows.length);
  const resistanceCluster=bestHorizontalCluster(pivots.highs,price,'resistance',tolerance,rows.length);
  const support=supportCluster?.price||fallbackSupport(rows,price),resistance=resistanceCluster?.price||fallbackResistance(rows,price);
  const lowLine=fitPivotLine(pivots.lows.slice(-5),rows.length),highLine=fitPivotLine(pivots.highs.slice(-5),rows.length);
  const channel=classifyChannel(lowLine,highLine,price,rows);
  const breakout=classifyBreakout(rows,{support,resistance,atr:atrValue});
  const patterns=[
    ...detectTriangles(rows,pivots,lowLine,highLine,price,atrValue),
    ...detectWedges(rows,pivots,lowLine,highLine,price,atrValue),
    ...detectDoublePatterns(rows,pivots,price,atrValue),
    ...detectHeadShoulders(rows,pivots,price,atrValue)
  ].filter(Boolean).sort((a,b)=>b.confidence-a.confidence||stateRank(b.state)-stateRank(a.state));
  const primaryPattern=patterns[0]||null;
  const distanceToSupport=support&&price?price/support-1:null,distanceToResistance=resistance&&price?resistance/price-1:null;
  const supportTouches=Number(supportCluster?.touches)||0,resistanceTouches=Number(resistanceCluster?.touches)||0;
  const structureConfidence=clamp(Math.round(35+Math.min(25,supportTouches*7)+Math.min(25,resistanceTouches*7)+(channel.confidence||0)*.15),0,100);
  const structureState=breakout.state!=='INSIDE'?breakout.state:(channel.type==='UP CHANNEL'?'RISING CHANNEL':channel.type==='DOWN CHANNEL'?'FALLING CHANNEL':channel.type==='SIDEWAYS RANGE'?'RANGE':'STRUCTURE');
  const reason=structureReason({support,resistance,distanceToSupport,distanceToResistance,channel,breakout,primaryPattern});
  return{
    version:PATTERN_CONTEXT_VERSION,shadowOnly:true,affectsBuyNow:false,symbol:String(symbol||''),timeframe:'daily',lookbackBars:rows.length,
    price,atr:atrValue,tolerance,structureState,structureConfidence,reason,
    support:support?{price:support,touches:supportTouches,confidence:levelConfidence(supportCluster),anchors:supportCluster?.anchors||[],distancePct:distanceToSupport}:null,
    resistance:resistance?{price:resistance,touches:resistanceTouches,confidence:levelConfidence(resistanceCluster),anchors:resistanceCluster?.anchors||[],distancePct:distanceToResistance}:null,
    channel,breakout,primaryPattern,patterns,
    summary:{patternCount:patterns.length,confirmedPatterns:patterns.filter(p=>p.state==='CONFIRMED').length,testingPatterns:patterns.filter(p=>p.state==='TESTING').length}
  };
}

function findPivots(rows,radius=2){
  const highs=[],lows=[];
  for(let i=radius;i<rows.length-radius;i++){
    let high=true,low=true;
    for(let j=i-radius;j<=i+radius;j++){
      if(j===i)continue;
      if(Number(rows[j].high)>=Number(rows[i].high))high=false;
      if(Number(rows[j].low)<=Number(rows[i].low))low=false;
    }
    if(high)highs.push(point(rows,i,Number(rows[i].high),'high'));
    if(low)lows.push(point(rows,i,Number(rows[i].low),'low'));
  }
  return{highs,lows};
}

function bestHorizontalCluster(points,currentPrice,kind,tolerance,n){
  const eligible=(points||[]).filter(p=>kind==='support'?p.price<=currentPrice+tolerance*.35:p.price>=currentPrice-tolerance*.35);
  if(!eligible.length)return null;
  const clusters=[];
  for(const seed of eligible){
    const members=eligible.filter(p=>Math.abs(p.price-seed.price)<=tolerance);
    if(!members.length)continue;
    const level=median(members.map(p=>p.price)),distance=Math.abs(level-currentPrice)/currentPrice,recency=Math.max(...members.map(p=>p.index))/(Math.max(1,n-1));
    const sidePenalty=kind==='support'&&level>currentPrice?20:kind==='resistance'&&level<currentPrice?20:0;
    const score=members.length*26+recency*22-Math.min(35,distance*220)-sidePenalty;
    clusters.push({price:level,touches:members.length,anchors:members.map(compactPoint),score});
  }
  return clusters.sort((a,b)=>b.score-a.score)[0]||null;
}

function fitPivotLine(points,n){
  const p=(points||[]).filter(x=>Number.isFinite(x.index)&&positive(x.price));
  if(p.length<2)return{valid:false,touches:p.length,confidence:0};
  const xs=p.map(x=>x.index),ys=p.map(x=>x.price),mx=average(xs),my=average(ys);
  let num=0,den=0;for(let i=0;i<p.length;i++){num+=(xs[i]-mx)*(ys[i]-my);den+=(xs[i]-mx)**2;}
  if(!den)return{valid:false,touches:p.length,confidence:0};
  const slope=num/den,intercept=my-slope*mx,pred=p.map(x=>intercept+slope*x.index),ssRes=ys.reduce((a,y,i)=>a+(y-pred[i])**2,0),ssTot=ys.reduce((a,y)=>a+(y-my)**2,0),r2=ssTot?clamp(1-ssRes/ssTot,0,1):1;
  const current=intercept+slope*(n-1),firstIndex=p[0].index,lastIndex=p.at(-1).index,first=intercept+slope*firstIndex,last=intercept+slope*lastIndex,slopePct=current?slope/current:0;
  return{valid:true,touches:p.length,slope,slopePctPerBar:slopePct,intercept,r2,current,confidence:clamp(Math.round(35+r2*45+Math.min(20,p.length*4)),0,100),start:{index:firstIndex,time:p[0].time,price:first},end:{index:lastIndex,time:p.at(-1).time,price:last},anchors:p.map(compactPoint)};
}

function classifyChannel(low,high,price,rows){
  if(!low.valid||!high.valid)return{type:'NO CLEAR CHANNEL',confidence:0,lower:low,upper:high,parallel:false,widthPct:null,narrowing:null};
  const lowerSlope=low.slopePctPerBar,upperSlope=high.slopePctPerBar,avgAbs=(Math.abs(lowerSlope)+Math.abs(upperSlope))/2,parallelTolerance=Math.max(.00035,avgAbs*.75),parallel=Math.abs(lowerSlope-upperSlope)<=parallelTolerance;
  const width=Math.max(0,high.current-low.current),widthPct=price?width/price:null;
  const oldIndex=Math.max(0,rows.length-30),oldLow=low.intercept+low.slope*oldIndex,oldHigh=high.intercept+high.slope*oldIndex,oldWidth=Math.max(.000001,oldHigh-oldLow),narrowing=width/oldWidth;
  const flat=.00028,up=lowerSlope>flat&&upperSlope>flat,down=lowerSlope<-flat&&upperSlope<-flat,side=Math.abs(lowerSlope)<=flat&&Math.abs(upperSlope)<=flat;
  let type='MIXED STRUCTURE';if(parallel&&up)type='UP CHANNEL';else if(parallel&&down)type='DOWN CHANNEL';else if(parallel&&side)type='SIDEWAYS RANGE';
  const confidence=clamp(Math.round((low.confidence+high.confidence)/2+(parallel?12:0)-(widthPct!=null&&widthPct<.015?8:0)),0,100);
  return{type,confidence,parallel,widthPct,narrowing,lower:linePublic(low),upper:linePublic(high),reason:channelReason(type,parallel,low,high,narrowing)};
}

function classifyBreakout(rows,{support,resistance,atr}){
  const latest=rows.at(-1),prior=rows.at(-2)||latest,price=positive(latest.close),priorClose=positive(prior.close),buffer=Math.max(price*.003,atr*.18),avgVolume=average(rows.slice(-21,-1).map(c=>Number(c.volume)||0)),volumeRatio=avgVolume>0?(Number(latest.volume)||0)/avgVolume:null;
  if(resistance&&price>resistance+buffer){const accepted=priorClose>resistance||price>resistance+Math.max(buffer,atr*.55),state=accepted?'BREAKOUT CONFIRMED':'BREAKOUT TEST';return{state,direction:'UP',level:resistance,distancePct:price/resistance-1,volumeRatio,confirmed:accepted,reason:accepted?'Price closed decisively above saved resistance.':'Price is above resistance, but acceptance still needs confirmation.'};}
  if(support&&price<support-buffer){const accepted=priorClose<support||price<support-Math.max(buffer,atr*.55),state=accepted?'BREAKDOWN CONFIRMED':'BREAKDOWN TEST';return{state,direction:'DOWN',level:support,distancePct:price/support-1,volumeRatio,confirmed:accepted,reason:accepted?'Price closed decisively below saved support.':'Price is below support, but breakdown acceptance still needs confirmation.'};}
  const nearResistance=resistance&&Math.abs(resistance-price)<=Math.max(buffer,atr*.4),nearSupport=support&&Math.abs(price-support)<=Math.max(buffer,atr*.4);
  if(nearResistance)return{state:'RESISTANCE TEST',direction:'UP',level:resistance,distancePct:price/resistance-1,volumeRatio,confirmed:false,reason:'Price is testing the nearest multi-touch resistance area.'};
  if(nearSupport)return{state:'SUPPORT TEST',direction:'UP',level:support,distancePct:price/support-1,volumeRatio,confirmed:false,reason:'Price is testing the nearest multi-touch support area.'};
  return{state:'INSIDE',direction:'NONE',level:null,distancePct:null,volumeRatio,confirmed:false,reason:'Price remains inside the current support/resistance structure.'};
}

function detectTriangles(rows,pivots,lowLine,highLine,price,atr){
  if(!lowLine.valid||!highLine.valid)return[];
  const lowSlope=lowLine.slopePctPerBar,highSlope=highLine.slopePctPerBar,flat=.00032,gapNow=highLine.current-lowLine.current,lookbackIndex=Math.max(0,rows.length-28),gapThen=(highLine.intercept+highLine.slope*lookbackIndex)-(lowLine.intercept+lowLine.slope*lookbackIndex),narrowing=gapThen>0?gapNow/gapThen:1;
  if(!(gapNow>0&&narrowing<.78))return[];
  let type=null,bias='NEUTRAL';if(Math.abs(highSlope)<=flat&&lowSlope>flat){type='ASCENDING TRIANGLE';bias='BULLISH';}else if(Math.abs(lowSlope)<=flat&&highSlope<-flat){type='DESCENDING TRIANGLE';bias='BEARISH';}else if(highSlope<-flat&&lowSlope>flat){type='SYMMETRICAL TRIANGLE';bias='NEUTRAL';}
  if(!type)return[];
  const upper=highLine.current,lower=lowLine.current,breakout=price>upper+atr*.15,breakdown=price<lower-atr*.15,state=breakout||breakdown?'CONFIRMED':price>=upper-atr*.4||price<=lower+atr*.4?'TESTING':'DETECTED';
  const confidence=clamp(Math.round(50+(1-narrowing)*28+Math.min(12,(lowLine.touches+highLine.touches)*2)+Math.min(10,(lowLine.r2+highLine.r2)*5)),0,96);
  return[pattern(type,'triangles',bias,state,confidence,`${type} detected because the upper/lower pivot lines are converging; current width is ${Math.round(narrowing*100)}% of the earlier width.`,[linePublic(highLine),linePublic(lowLine)],[],{upper,lower,narrowing})];
}

function detectWedges(rows,pivots,lowLine,highLine,price,atr){
  if(!lowLine.valid||!highLine.valid)return[];
  const ls=lowLine.slopePctPerBar,hs=highLine.slopePctPerBar,oldIndex=Math.max(0,rows.length-30),oldGap=(highLine.intercept+highLine.slope*oldIndex)-(lowLine.intercept+lowLine.slope*oldIndex),gap=highLine.current-lowLine.current,narrowing=oldGap>0?gap/oldGap:1;
  if(!(gap>0&&narrowing<.75))return[];
  let type=null,bias='NEUTRAL';if(ls>0&&hs>0&&ls>hs*1.15){type='RISING WEDGE';bias='BEARISH';}else if(ls<0&&hs<0&&Math.abs(hs)>Math.abs(ls)*1.15){type='FALLING WEDGE';bias='BULLISH';}
  if(!type)return[];
  const upper=highLine.current,lower=lowLine.current,state=price>upper+atr*.15||price<lower-atr*.15?'CONFIRMED':price>=upper-atr*.4||price<=lower+atr*.4?'TESTING':'DETECTED',confidence=clamp(Math.round(48+(1-narrowing)*30+Math.min(18,(lowLine.r2+highLine.r2)*9)),0,94);
  return[pattern(type,'wedges',bias,state,confidence,`${type} detected because both boundaries slope in the same direction while the range contracts.`,[linePublic(highLine),linePublic(lowLine)],[],{upper,lower,narrowing})];
}

function detectDoublePatterns(rows,pivots,price,atr){
  const out=[],tol=Math.max(price*.022,atr*.8);
  const highPair=bestDoublePair(pivots.highs,rows,'top',tol,atr),lowPair=bestDoublePair(pivots.lows,rows,'bottom',tol,atr);
  if(highPair){const neckline=valleyBetween(rows,highPair.a.index,highPair.b.index),state=neckline&&price<neckline-atr*.12?'CONFIRMED':price>highPair.level+atr*.22?'FAILED':'TESTING',confidence=pairConfidence(highPair,neckline,atr);out.push(pattern('DOUBLE TOP','double','BEARISH',state,confidence,`Two swing highs are within ${pctDiff(highPair.a.price,highPair.b.price)} of each other with a meaningful valley between them.`,[{kind:'horizontal',price:highPair.level},{kind:'horizontal',price:neckline,label:'Neckline'}],[compactPoint(highPair.a),compactPoint(highPair.b)],{neckline,level:highPair.level}));}
  if(lowPair){const neckline=peakBetween(rows,lowPair.a.index,lowPair.b.index),state=neckline&&price>neckline+atr*.12?'CONFIRMED':price<lowPair.level-atr*.22?'FAILED':'TESTING',confidence=pairConfidence(lowPair,neckline,atr);out.push(pattern('DOUBLE BOTTOM','double','BULLISH',state,confidence,`Two swing lows are within ${pctDiff(lowPair.a.price,lowPair.b.price)} of each other with a meaningful rebound between them.`,[{kind:'horizontal',price:lowPair.level},{kind:'horizontal',price:neckline,label:'Neckline'}],[compactPoint(lowPair.a),compactPoint(lowPair.b)],{neckline,level:lowPair.level}));}
  return out.filter(p=>p.confidence>=48);
}

function bestDoublePair(points,rows,kind,tolerance,atr){
  let best=null;const recent=(points||[]).slice(-8);
  for(let i=0;i<recent.length;i++)for(let j=i+1;j<recent.length;j++){
    const a=recent[i],b=recent[j],spacing=b.index-a.index;if(spacing<5||spacing>65)continue;if(Math.abs(a.price-b.price)>tolerance)continue;
    const middle=kind==='top'?valleyBetween(rows,a.index,b.index):peakBetween(rows,a.index,b.index);if(!middle)continue;
    const level=(a.price+b.price)/2,depth=kind==='top'?level-middle:middle-level;if(depth<Math.max(atr*.65,level*.018))continue;
    const recency=1-(rows.length-1-b.index)/Math.max(1,rows.length),symmetry=1-Math.min(1,Math.abs(a.price-b.price)/tolerance),score=depth/atr*18+symmetry*30+recency*25;
    if(!best||score>best.score)best={a,b,level,depth,score};
  }
  return best;
}

function detectHeadShoulders(rows,pivots,price,atr){
  const out=[];const highs=pivots.highs.slice(-7),lows=pivots.lows.slice(-7);
  const normal=bestHSTriple(highs,rows,'top',atr),inverse=bestHSTriple(lows,rows,'bottom',atr);
  if(normal){const neck1=valleyBetween(rows,normal.a.index,normal.b.index),neck2=valleyBetween(rows,normal.b.index,normal.c.index),neckline=average([neck1,neck2].filter(positive)),state=neckline&&price<neckline-atr*.12?'CONFIRMED':price>normal.b.price+atr*.25?'FAILED':'TESTING';out.push(pattern('HEAD & SHOULDERS','head-shoulders','BEARISH',state,normal.confidence,`Three swing highs form left shoulder, higher head, and right shoulder; shoulders differ by ${pctDiff(normal.a.price,normal.c.price)}.`,[{kind:'horizontal',price:neckline,label:'Neckline'}],[compactPoint(normal.a),compactPoint(normal.b),compactPoint(normal.c)],{neckline}));}
  if(inverse){const neck1=peakBetween(rows,inverse.a.index,inverse.b.index),neck2=peakBetween(rows,inverse.b.index,inverse.c.index),neckline=average([neck1,neck2].filter(positive)),state=neckline&&price>neckline+atr*.12?'CONFIRMED':price<inverse.b.price-atr*.25?'FAILED':'TESTING';out.push(pattern('INVERSE HEAD & SHOULDERS','head-shoulders','BULLISH',state,inverse.confidence,`Three swing lows form left shoulder, lower head, and right shoulder; shoulders differ by ${pctDiff(inverse.a.price,inverse.c.price)}.`,[{kind:'horizontal',price:neckline,label:'Neckline'}],[compactPoint(inverse.a),compactPoint(inverse.b),compactPoint(inverse.c)],{neckline}));}
  return out.filter(p=>p.confidence>=52);
}

function bestHSTriple(points,rows,kind,atr){
  let best=null;for(let i=0;i<points.length-2;i++)for(let j=i+1;j<points.length-1;j++)for(let k=j+1;k<points.length;k++){
    const a=points[i],b=points[j],c=points[k];if(c.index-a.index>80||b.index-a.index<3||c.index-b.index<3)continue;
    const shoulders=Math.abs(a.price-c.price)/((a.price+c.price)/2);if(shoulders>.055)continue;
    const headGap=kind==='top'?b.price-Math.max(a.price,c.price):Math.min(a.price,c.price)-b.price;if(headGap<Math.max(atr*.55,b.price*.014))continue;
    const balance=1-Math.min(1,Math.abs((b.index-a.index)-(c.index-b.index))/Math.max(1,c.index-a.index)),recency=1-(rows.length-1-c.index)/Math.max(1,rows.length),confidence=clamp(Math.round(52+(1-shoulders/.055)*18+balance*13+recency*10+Math.min(7,headGap/atr*3)),0,95);
    if(!best||confidence>best.confidence)best={a,b,c,confidence};
  }return best;
}

function pattern(type,family,bias,state,confidence,reason,lines=[],anchors=[],metrics={}){return{id:`${family}:${type.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,type,family,bias,state,confidence:clamp(Math.round(confidence),0,100),reason,lines:lines.filter(Boolean).map(normalizeLine),anchors:(anchors||[]).filter(Boolean),metrics};}
function normalizeLine(line){if(!line)return null;if(line.kind==='horizontal')return{kind:'horizontal',price:positive(line.price),label:String(line.label||'')};return{kind:'trend',start:line.start||null,end:line.end||null,current:positive(line.current),slopePctPerBar:num(line.slopePctPerBar),confidence:Number(line.confidence)||0};}
function linePublic(line){if(!line?.valid)return null;return{kind:'trend',start:line.start,end:line.end,current:line.current,slopePctPerBar:line.slopePctPerBar,touches:line.touches,r2:line.r2,confidence:line.confidence,anchors:line.anchors};}
function point(rows,index,price,kind){return{index,time:Number(rows[index].time),price,kind};}
function compactPoint(p){return p?{index:Number(p.index),time:Number(p.time),price:Number(p.price),kind:String(p.kind||'')}:null;}
function fallbackSupport(rows,price){const vals=rows.slice(-25).map(c=>Number(c.low)).filter(v=>v>0&&v<=price);return vals.length?Math.min(...vals):null;}
function fallbackResistance(rows,price){const vals=rows.slice(-40,-1).map(c=>Number(c.high)).filter(v=>v>price);return vals.length?Math.max(...vals):null;}
function valleyBetween(rows,a,b){if(!(b>a+1))return null;const vals=rows.slice(a+1,b).map(c=>Number(c.low)).filter(positive);return vals.length?Math.min(...vals):null;}
function peakBetween(rows,a,b){if(!(b>a+1))return null;const vals=rows.slice(a+1,b).map(c=>Number(c.high)).filter(positive);return vals.length?Math.max(...vals):null;}
function pairConfidence(pair,neckline,atr){const symmetry=1-Math.min(1,Math.abs(pair.a.price-pair.b.price)/Math.max(atr*.8,pair.level*.022)),depth=pair.depth/Math.max(atr,.0001);return clamp(Math.round(48+symmetry*24+Math.min(20,depth*7)+(neckline?8:0)),0,96);}
function levelConfidence(cluster){return cluster?clamp(Math.round(35+Math.min(45,cluster.touches*13)+Math.min(20,Math.max(0,cluster.score)*.12)),0,98):30;}
function channelReason(type,parallel,low,high,narrowing){if(type==='UP CHANNEL')return'Rising pivot support and resistance are moving upward at similar slopes.';if(type==='DOWN CHANNEL')return'Falling pivot support and resistance are moving downward at similar slopes.';if(type==='SIDEWAYS RANGE')return'Upper and lower pivot boundaries are approximately flat.';if(narrowing<.8)return'Upper and lower trend boundaries are converging rather than forming a parallel channel.';return parallel?'Trend boundaries are roughly parallel, but their slope is not strong enough for a directional channel.':'Upper and lower pivot slopes are not parallel enough for a clean channel.';}
function structureReason({support,resistance,distanceToSupport,distanceToResistance,channel,breakout,primaryPattern}){const bits=[];if(support)bits.push(`support ${formatPrice(support)} (${formatPct(distanceToSupport)} below)`);if(resistance)bits.push(`resistance ${formatPrice(resistance)} (${formatPct(distanceToResistance)} above)`);if(channel?.type&&channel.type!=='NO CLEAR CHANNEL')bits.push(channel.type.toLowerCase());if(breakout?.state!=='INSIDE')bits.push(breakout.state.toLowerCase());if(primaryPattern)bits.push(`${primaryPattern.type.toLowerCase()} ${primaryPattern.confidence}/100`);return bits.length?`Current structure: ${bits.join(' · ')}.`:'No high-confidence structure pattern is currently resolved.';}
function stateRank(state){return{CONFIRMED:4,TESTING:3,DETECTED:2,FAILED:1}[state]||0;}
function formatPrice(v){return Number(v).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});}
function formatPct(v){return Number.isFinite(Number(v))?`${Math.abs(Number(v))*100<.1?'<0.1':(Math.abs(Number(v))*100).toFixed(1)}%`:'—';}
function pctDiff(a,b){const avg=(a+b)/2;return avg?`${(Math.abs(a-b)/avg*100).toFixed(1)}%`:'—';}
function validCandle(c){return Number.isFinite(Number(c?.time))&&positive(c?.open)&&positive(c?.high)&&positive(c?.low)&&positive(c?.close)&&Number(c.high)>=Math.max(Number(c.open),Number(c.close),Number(c.low))&&Number(c.low)<=Math.min(Number(c.open),Number(c.close),Number(c.high));}
function average(arr){const a=(arr||[]).filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function median(arr){const a=(arr||[]).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
function insufficient(reason){return{version:PATTERN_CONTEXT_VERSION,shadowOnly:true,affectsBuyNow:false,timeframe:'daily',structureState:'COLLECTING',structureConfidence:0,reason,support:null,resistance:null,channel:{type:'NO CLEAR CHANNEL',confidence:0},breakout:{state:'INSIDE',confirmed:false},primaryPattern:null,patterns:[],summary:{patternCount:0,confirmedPatterns:0,testingPatterns:0}};}
