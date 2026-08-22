const average = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

function sma(values,period){if(values.length<period)return null;return average(values.slice(-period));}

export function wildersRsi(values,period=14){
  if(!Array.isArray(values)||values.length<=period)return 50;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d;}
  let avgGain=gains/period,avgLoss=losses/period;
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1];
    avgGain=(avgGain*(period-1)+(d>0?d:0))/period;
    avgLoss=(avgLoss*(period-1)+(d<0?-d:0))/period;
  }
  if(!avgLoss)return 100;
  return 100-(100/(1+avgGain/avgLoss));
}

export function wildersAtr(candles,period=14){
  if(!Array.isArray(candles)||candles.length<=period)return 0;
  let sum=0;
  for(let i=1;i<=period;i++){const c=candles[i],p=candles[i-1];sum+=Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));}
  let current=sum/period;
  for(let i=period+1;i<candles.length;i++){
    const c=candles[i],p=candles[i-1];
    const tr=Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));
    current=(current*(period-1)+tr)/period;
  }
  return current;
}

function rollingSma(values,index,period){if(index+1<period)return null;let sum=0;for(let i=index-period+1;i<=index;i++)sum+=values[i];return sum/period;}
function rollingRsi(values,index,period=14){return wildersRsi(values.slice(0,index+1),period);}

function walkForward(candles){
  const closes=candles.map(c=>c.close);const horizon=Math.max(3,Math.round(candles.length/45));let total=0,wins=0;const returns=[];
  for(let i=55;i<closes.length-horizon;i++){
    const s20=rollingSma(closes,i,20),s50=rollingSma(closes,i,50);if(!s20||!s50)continue;
    const momentum=closes[i]/closes[i-10]-1,rsiValue=rollingRsi(closes,i,14),extension=closes[i]/s20-1;
    if(!(closes[i]>s50&&s20>s50&&momentum>0&&rsiValue<72&&extension<.045))continue;
    const ret=closes[i+horizon]/closes[i]-1;total++;returns.push(ret);if(ret>0)wins++;
  }
  return {sample:total,winRate:total?wins/total:.5,avgReturn:returns.length?average(returns):0};
}

function engineState(name,metrics,needed){const passes=metrics.filter(m=>m.pass).length,ready=passes>=needed;return{name,metrics,passes,total:metrics.length,ready,state:ready?'PASS':passes>=needed-1?'WARN':'FAIL'};}

function benchmarkState(candles){
  if(!Array.isArray(candles)||candles.length<50)return null;const closes=candles.map(c=>c.close),latest=closes.at(-1),s20=sma(closes,20),s50=sma(closes,50),momentum20=latest/closes[closes.length-21]-1;
  return{symbol:'SPY',latest,sma20:s20,sma50:s50,momentum20,bull:Boolean(s20&&s50&&latest>s50&&s20>s50),riskOff:Boolean(s20&&s50&&latest<s50&&s20<s50)};
}

function pivotLevels(candles,lookback=80,radius=2){
  const slice=candles.slice(-Math.min(lookback,candles.length));const highs=[],lows=[];
  for(let i=radius;i<slice.length-radius;i++){
    let high=true,low=true;
    for(let j=i-radius;j<=i+radius;j++){if(j===i)continue;if(slice[j].high>=slice[i].high)high=false;if(slice[j].low<=slice[i].low)low=false;}
    if(high)highs.push(slice[i].high);if(low)lows.push(slice[i].low);
  }
  return{highs,lows,slice};
}

export function structureLevels(candles,atrValue){
  const latest=candles.at(-1),price=Number(latest?.close)||0;if(!price)return{support:null,resistance:null,target:null,targetSource:'unresolved',stop:null,stopSource:'unresolved'};
  const {highs,lows,slice}=pivotLevels(candles);const below=lows.filter(v=>v<price).sort((a,b)=>b-a),above=highs.filter(v=>v>price*1.003).sort((a,b)=>a-b);
  const support=below[0]||Math.min(...slice.slice(-20).map(c=>c.low));
  const resistance=above[0]||null;
  const prior=slice.slice(0,-1),priorHigh=prior.length?Math.max(...prior.map(c=>c.high)):price,baseLow=prior.length?Math.min(...prior.slice(-20).map(c=>c.low)):support;
  let target=resistance,targetSource=resistance?'nearest pivot resistance':'unresolved';
  if(!target&&price>priorHigh&&priorHigh>baseLow){target=priorHigh+(priorHigh-baseLow);targetSource='measured move above prior resistance';}
  const stop=support?Math.max(.01,support-.35*atrValue):null;
  return{support,resistance,target,targetSource,stop,stopSource:support?'pivot support with ATR buffer':'unresolved'};
}

function easternParts(time){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time));return Object.fromEntries(parts.map(x=>[x.type,x.value]));}
function dateKey(time){const p=easternParts(time);return`${p.year}-${p.month}-${p.day}`;}
function timeKey(time){const p=easternParts(time);return`${p.hour}:${p.minute}`;}
function weekKey(time){const p=easternParts(time),d=new Date(Date.UTC(+p.year,+p.month-1,+p.day)),weekday=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-weekday);return d.toISOString().slice(0,10);}

function weeklyAvwap(candles){
  if(!candles.length)return null;const currentWeek=weekKey(candles.at(-1).time),start=candles.findIndex(c=>weekKey(c.time)===currentWeek);if(start<0)return null;
  let tpv=0,vol=0;for(let i=start;i<candles.length;i++){const c=candles[i],v=Number(c.volume)||0,tp=(c.high+c.low+c.close)/3;tpv+=tp*v;vol+=v;}
  return vol>0?tpv/vol:null;
}

function timeOfDayRvol(candles){
  const latest=candles.at(-1);if(!latest?.time)return{value:1,sample:0};const tk=timeKey(latest.time),dk=dateKey(latest.time);
  const matches=candles.slice(0,-1).filter(c=>dateKey(c.time)!==dk&&timeKey(c.time)===tk).map(c=>Number(c.volume)||0).filter(v=>v>0);
  if(matches.length>=3)return{value:(Number(latest.volume)||0)/average(matches),sample:matches.length};
  const fallback=candles.slice(-21,-1).map(c=>Number(c.volume)||0).filter(v=>v>0);return{value:fallback.length?(Number(latest.volume)||0)/average(fallback):1,sample:matches.length};
}

function bandwidthAt(values,end,period=20){if(end+1<period)return null;const s=values.slice(end-period+1,end+1),m=average(s);if(!m)return null;const variance=average(s.map(v=>(v-m)**2)),sd=Math.sqrt(variance);return(4*sd)/m;}
function volatilityRegime(values,period=20){
  const current=bandwidthAt(values,values.length-1,period);if(current==null)return{state:'UNKNOWN',bandwidth:0,percentile:null};const history=[];
  for(let i=period-1;i<values.length-1;i++){const b=bandwidthAt(values,i,period);if(b!=null)history.push(b);}const below=history.filter(v=>v<=current).length,percentile=history.length?below/history.length:0.5;
  const state=percentile<=.2?'COMPRESSING':percentile>=.8?'EXPANDING':'NORMAL';return{state,bandwidth:current,percentile};
}

export function assessIntradayConfirmation(candles){
  if(!Array.isArray(candles)||candles.length<30)return{pass:false,passes:0,total:5,state:'INSUFFICIENT',timeframe:'15m',reason:'Not enough completed 15-minute candles.'};
  const completed=candles.slice(0,-1),closes=completed.map(c=>c.close),latest=completed.at(-1),s20=sma(closes,20)||latest.close,r14=wildersRsi(closes,14),momentum4=closes.length>4?latest.close/closes[closes.length-5]-1:0;
  const avwap=weeklyAvwap(completed)||latest.close,rvol=timeOfDayRvol(completed),volatility=volatilityRegime(closes,20);
  const metrics=[
    {name:'Price vs weekly AVWAP',value:`${latest.close>=avwap?'Above':'Below'} weekly AVWAP`,pass:latest.close>=avwap},
    {name:'Time-of-day RVOL',value:`${rvol.value.toFixed(2)}x (${rvol.sample} matched sessions)`,pass:rvol.value>=1.0,warn:rvol.value>=.8},
    {name:'1-hour momentum',value:`${(momentum4*100).toFixed(2)}%`,pass:momentum4>0},
    {name:'15m Wilder RSI',value:r14.toFixed(1),pass:r14>=45&&r14<=68,warn:r14>68&&r14<76},
    {name:'15m trend vs 20-bar',value:`Price ${latest.close>s20?'above':'below'} 20-bar average`,pass:latest.close>s20}
  ];
  const passes=metrics.filter(m=>m.pass).length,pass=passes>=4;
  return{pass,passes,total:metrics.length,state:pass?'PASS':passes===3?'WARN':'FAIL',timeframe:'15m',latestTime:latest.time,latestPrice:latest.close,sma20:s20,rsi:r14,momentum4,relativeVolume:rvol.value,rvolSample:rvol.sample,avwap,volatility,metrics,reason:pass?'Entry timing is constructive: price, participation, momentum, and weekly AVWAP are aligned.':'Entry timing is not attractive enough yet; the higher-timeframe thesis is unchanged.'};
}

export function analyze(candles,symbol,context={}){
  const closes=candles.map(c=>c.close),latest=candles.at(-1),previous=candles.at(-2)||latest,s20=sma(closes,20)||latest.close,s50=sma(closes,50)||s20;
  const a14=wildersAtr(candles,14)||latest.close*.02,r14=wildersRsi(closes,14),momentum20=closes.length>20?latest.close/closes[closes.length-21]-1:0,recentMax=Math.max(...closes.slice(-20));
  const pullbackDepth=recentMax?(recentMax-latest.close)/recentMax:0,extensionPct=(latest.close-s20)/s20,trendStrength=(s20-s50)/s50,benchmark=benchmarkState(context.benchmarkCandles),relativeStrength20=benchmark?momentum20-benchmark.momentum20:null;
  const legacyRelativeStrengthProxy=momentum20-average(closes.slice(-10).map((v,i,a)=>i?v/a[i-1]-1:0)),intradayConfirmation=context.intradayConfirmation||null;
  const preferredEntryLow=Math.max(.01,s20-.40*a14),preferredEntryHigh=s20+.18*a14,overextension=s20+1.45*a14;
  const structure=structureLevels(candles,a14),thesisBreak=structure.stop||Math.max(.01,s50-.75*a14),target=structure.target;
  const risk=Math.max(.01,latest.close-thesisBreak),reward=target?Math.max(0,target-latest.close):0,rr=target?reward/risk:0,wf=walkForward(candles);

  const trendMetrics=[
    {name:'50-period trend',value:`Price ${latest.close>=s50?'above':'below'} 50-period trend`,pass:latest.close>s50},
    {name:'Trend alignment',value:`20-period ${s20>=s50?'above':'below'} 50-period`,pass:s20>s50},
    {name:'Momentum',value:`${(momentum20*100).toFixed(1)}% over lookback`,pass:momentum20>0},
    benchmark?{name:'Relative strength vs SPY',value:`${relativeStrength20>=0?'+':''}${(relativeStrength20*100).toFixed(1)}% vs SPY`,pass:relativeStrength20>0}:{name:'Relative strength proxy',value:legacyRelativeStrengthProxy>=0?'Positive':'Lagging',pass:legacyRelativeStrengthProxy>=-.0015,warn:true}
  ];
  const entryMetrics=[
    {name:'Extension vs 20',value:`${(extensionPct*100).toFixed(1)}%`,pass:latest.close<=overextension,warn:latest.close>preferredEntryHigh},
    {name:'Pullback depth',value:`${(pullbackDepth*100).toFixed(1)}%`,pass:pullbackDepth>=.008&&pullbackDepth<=.08,warn:pullbackDepth<.008},
    {name:'Wilder RSI (14)',value:r14.toFixed(1),pass:r14>=42&&r14<=69,warn:r14>69&&r14<76},
    {name:'Entry zone',value:latest.close>=preferredEntryLow&&latest.close<=preferredEntryHigh?'Inside preferred zone':latest.close>preferredEntryHigh?'Above preferred zone':'Below preferred zone',pass:latest.close>=preferredEntryLow&&latest.close<=preferredEntryHigh,warn:latest.close>preferredEntryHigh}
  ];
  const regimePass=benchmark?!benchmark.riskOff:trendStrength>0,regimeValue=benchmark?(benchmark.bull?'SPY bull trend':benchmark.riskOff?'SPY risk-off':'SPY mixed/neutral'):(trendStrength>.005?'Bull trend':trendStrength>-.005?'Neutral':'Bearish');
  const probabilityMetrics=[
    {name:'Walk-forward win rate',value:`${(wf.winRate*100).toFixed(0)}% (${wf.sample} samples)`,pass:wf.sample>=5&&wf.winRate>=.57,warn:wf.sample<5||(wf.winRate>=.52&&wf.winRate<.57)},
    {name:'Forward expectancy',value:`${(wf.avgReturn*100).toFixed(2)}% avg`,pass:wf.sample>=5&&wf.avgReturn>0,warn:wf.sample<5},
    {name:'Pattern sample quality',value:wf.sample>=12?'Good':wf.sample>=5?'Limited':'Insufficient',pass:wf.sample>=12,warn:wf.sample>=5},
    {name:'Market regime',value:regimeValue,pass:regimePass,warn:benchmark?!benchmark.bull:trendStrength>-.005}
  ];
  const rrMetrics=[
    {name:'Structure stop distance',value:`${(risk/latest.close*100).toFixed(1)}% · ${structure.stopSource}`,pass:risk/latest.close<=.08,warn:risk/latest.close<=.12},
    {name:'Structure target',value:target?`${((reward/latest.close)*100).toFixed(1)}% · ${structure.targetSource}`:'No defensible target resolved',pass:Boolean(target)&&reward/latest.close>=.06,warn:Boolean(target)&&reward/latest.close>=.035},
    {name:'Reward / risk',value:target?`${rr.toFixed(2)} : 1`:'Unresolved',pass:Boolean(target)&&rr>=1.8,warn:Boolean(target)&&rr>=1.25},
    {name:'Price vs thesis break',value:latest.close>thesisBreak?'Thesis intact':'Broken',pass:latest.close>thesisBreak}
  ];
  const engines={trend:engineState('TREND',trendMetrics,3),entry:engineState('ENTRY',entryMetrics,3),probability:engineState('PROBABILITY',probabilityMetrics,3),riskReward:engineState('RISK / REWARD',rrMetrics,3)};
  const allMetrics=[...trendMetrics,...entryMetrics,...probabilityMetrics,...rrMetrics],passed=allMetrics.filter(m=>m.pass).length,total=allMetrics.length,criticalFailed=Object.values(engines).filter(e=>!e.ready).map(e=>e.name),nearEntry=latest.close>=preferredEntryLow*.99&&latest.close<=preferredEntryHigh*1.02,dailyGatesReady=Object.values(engines).every(e=>e.ready);
  let status,reason;
  if(latest.close<=thesisBreak){status='SELL / EXIT';reason='Price broke structure-based thesis support. The original setup is invalid until structure repairs.';}
  else if(!engines.trend.ready){status='AVOID';reason='Trend quality is not strong enough to justify a new investment.';}
  else if(benchmark?.riskOff&&!engines.probability.ready){status='WAIT — SETUP NOT READY';reason='The stock setup is improving, but the broad-market regime is risk-off.';}
  else if(latest.close>overextension||r14>=76){status='WAIT FOR PULLBACK';reason='Trend is strong, but price is too extended to chase.';}
  else if(dailyGatesReady&&intradayConfirmation?.pass){status='BUY NOW';reason='All higher-timeframe gates cleared and optional entry timing is attractive.';}
  else if(dailyGatesReady){status='SETUP — READY SOON';reason='All higher-timeframe gates cleared. Intraday timing is optional and does not control the thesis.';}
  else if(engines.trend.ready&&nearEntry&&(engines.probability.ready||engines.riskReward.ready)){status='SETUP — READY SOON';reason='Price is near the preferred entry zone, but one higher-timeframe gate is still missing.';}
  else{status='WAIT — SETUP NOT READY';reason='Several checks pass, but at least one higher-timeframe gate still blocks a buy setup.';}
  let readiness=Math.round((passed/total)*55+((4-criticalFailed.length)/4)*45);if(dailyGatesReady&&intradayConfirmation?.pass)readiness=Math.max(readiness,92);else if(dailyGatesReady)readiness=Math.max(readiness,82);if(status==='AVOID'||status==='SELL / EXIT')readiness=Math.min(readiness,35);if(status==='WAIT FOR PULLBACK')readiness=Math.min(readiness,68);
  return{symbol,latest,changePct:previous.close?latest.close/previous.close-1:0,sma20:s20,sma50:s50,atr:a14,rsi:r14,momentum20,relativeStrength20,benchmark,intradayConfirmation,dailyGatesReady,preferredEntryLow,preferredEntryHigh,overextension,thesisBreak,target,rr,wf,structure,engines,passed,total,criticalFailed,status,reason,readiness};
}
