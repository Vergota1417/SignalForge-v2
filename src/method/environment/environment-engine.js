const MIN_DAILY_BARS=100;
const MOMENTUM_SHORT_BARS=20;
const MOMENTUM_LONG_BARS=63;
const VOLATILITY_LOOKBACK=60;
const VOLATILITY_ELEVATED_PERCENTILE=.90;

const finite=value=>Number.isFinite(Number(value));
const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;

function sma(values,period,end=values.length-1){
  if(end+1<period)return null;
  return average(values.slice(end-period+1,end+1));
}

function momentum(values,bars){
  if(values.length<=bars)return null;
  const start=Number(values[values.length-1-bars]),end=Number(values.at(-1));
  return start>0&&finite(end)?end/start-1:null;
}

function trueRange(candle,previous){
  if(!candle||!previous)return null;
  return Math.max(
    Number(candle.high)-Number(candle.low),
    Math.abs(Number(candle.high)-Number(previous.close)),
    Math.abs(Number(candle.low)-Number(previous.close))
  );
}

function wildersAtrAt(candles,end,period=14){
  if(end<period)return null;
  let sum=0;
  for(let i=1;i<=period;i++)sum+=trueRange(candles[i],candles[i-1]);
  let atr=sum/period;
  for(let i=period+1;i<=end;i++)atr=(atr*(period-1)+trueRange(candles[i],candles[i-1]))/period;
  return atr;
}

function volatilityContext(candles){
  const end=candles.length-1,currentAtr=wildersAtrAt(candles,end,14),latest=Number(candles.at(-1)?.close);
  if(!(currentAtr>0)&&!(latest>0))return{state:'NOT_AVAILABLE',atr:null,atrPct:null,percentile:null};
  const currentPct=currentAtr/latest;
  const history=[];
  const first=Math.max(14,end-VOLATILITY_LOOKBACK);
  for(let i=first;i<end;i++){
    const atr=wildersAtrAt(candles,i,14),close=Number(candles[i]?.close);
    if(atr>0&&close>0)history.push(atr/close);
  }
  const percentile=history.length?history.filter(value=>value<=currentPct).length/history.length:null;
  const state=percentile==null?'UNKNOWN':percentile>=VOLATILITY_ELEVATED_PERCENTILE?'ELEVATED':percentile<=.20?'QUIET':'NORMAL';
  return{state,atr:currentAtr,atrPct:currentPct,percentile,sample:history.length};
}

function trendContext(candles){
  const closes=candles.map(row=>Number(row.close)).filter(finite),latest=closes.at(-1);
  const sma20=sma(closes,20),sma50=sma(closes,50),priorSma20=sma(closes,20,Math.max(19,closes.length-11));
  const momentum20=momentum(closes,MOMENTUM_SHORT_BARS),momentum63=momentum(closes,MOMENTUM_LONG_BARS);
  const above50=finite(latest)&&finite(sma50)&&latest>sma50;
  const alignment=finite(sma20)&&finite(sma50)&&sma20>sma50;
  const shortMomentum=finite(momentum20)&&momentum20>0;
  const mediumMomentum=finite(momentum63)&&momentum63>0;
  const rising20=finite(sma20)&&finite(priorSma20)&&sma20>priorSma20;
  const supportive=[above50,alignment,shortMomentum,mediumMomentum,rising20].filter(Boolean).length;
  const state=supportive>=4?'BULLISH':supportive>=2?'MIXED':'BEARISH';
  return{state,latest,sma20,sma50,momentum20,momentum63,rising20,checks:{above50,alignment,shortMomentum,mediumMomentum,rising20},supportive,total:5};
}

function normalizeCandles(rows){
  return Array.isArray(rows)?rows.filter(row=>finite(row?.time)&&finite(row?.open)&&finite(row?.high)&&finite(row?.low)&&finite(row?.close)).slice().sort((a,b)=>Number(a.time)-Number(b.time)):[];
}

function pct(value,digits=1){return finite(value)?`${(Number(value)*100).toFixed(digits)}%`:'Not available';}

export function evaluateEnvironment({symbol,stockCandles,benchmarkCandles,sectorContext=null,asOf=null}={}){
  const stock=normalizeCandles(stockCandles),benchmark=normalizeCandles(benchmarkCandles);
  const missing=[];
  if(stock.length<MIN_DAILY_BARS)missing.push('stockDailyHistory');
  if(benchmark.length<MIN_DAILY_BARS)missing.push('benchmarkDailyHistory');
  if(missing.length){
    return{
      version:'environment-equity-v1',symbol:String(symbol||''),state:'NOT_AVAILABLE',gateState:'NOT_AVAILABLE',classification:'UNKNOWN',
      shadowOnly:true,affectsExecution:false,blocking:false,reason:`Environment needs at least ${MIN_DAILY_BARS} completed daily bars for both the stock and benchmark.`,
      nextCondition:'Wait for sufficient canonical completed-bar history.',missingInputs:missing,evidenceCoverage:{available:0,required:4,optionalMissing:['sectorContext']},metrics:[],asOf:asOf??null
    };
  }

  const stockTrend=trendContext(stock),marketTrend=trendContext(benchmark),volatility=volatilityContext(stock);
  const marketRiskOff=marketTrend.state==='BEARISH'||(marketTrend.checks.above50===false&&marketTrend.checks.alignment===false);
  const stockBearish=stockTrend.state==='BEARISH';
  const stockMixed=stockTrend.state==='MIXED';
  const volatilityElevated=volatility.state==='ELEVATED';
  const sectorAvailable=Boolean(sectorContext&&sectorContext.state&&sectorContext.state!=='NOT_AVAILABLE');
  const optionalMissing=sectorAvailable?[]:['sectorContext'];

  let gateState='PASS',classification='SUPPORTIVE',reason='Stock and broad-market structure are supportive for a long tactical setup.';
  if(marketRiskOff){gateState='FAIL';classification='RISK_OFF';reason='Broad-market structure is risk-off, so Environment is not supportive for a new long tactical setup.';}
  else if(stockBearish){gateState='FAIL';classification='UNFAVORABLE';reason='The stock trend is bearish even though the broad market is not fully risk-off.';}
  else if(stockMixed||volatilityElevated){gateState='WARN';classification='MIXED';reason=volatilityElevated?'Trend is not fully hostile, but stock volatility is elevated versus its own recent history.':'Stock structure is mixed and does not yet show broad trend agreement.';}

  const state=optionalMissing.length&&gateState!=='FAIL'?'PARTIAL':gateState;
  const nextCondition=gateState==='FAIL'
    ?marketRiskOff?'Broad-market structure must repair before Environment can become supportive.':'Stock trend structure must repair before Environment can become supportive.'
    :gateState==='WARN'
      ?volatilityElevated?'Reassess when volatility normalizes or trend evidence strengthens.':'Reassess when stock trend, momentum, and moving-average alignment strengthen.'
      :optionalMissing.length?'Sector context is optional for this shadow version; add a legitimate sector dataset to complete evidence coverage.':'No Environment repair is currently required.';

  const metrics=[
    {key:'stockTrend',label:'Stock trend structure',state:stockTrend.state,value:`${stockTrend.supportive}/${stockTrend.total} supportive checks`,required:true},
    {key:'marketTrend',label:'Broad-market structure',state:marketRiskOff?'RISK_OFF':marketTrend.state,value:`${marketTrend.supportive}/${marketTrend.total} supportive checks`,required:true},
    {key:'stockMomentum20',label:'20-day stock momentum',state:stockTrend.checks.shortMomentum?'PASS':'FAIL',value:pct(stockTrend.momentum20),required:true},
    {key:'stockMomentum63',label:'63-day stock momentum',state:stockTrend.checks.mediumMomentum?'PASS':'FAIL',value:pct(stockTrend.momentum63),required:true},
    {key:'volatility',label:'ATR volatility regime',state:volatility.state,value:`${pct(volatility.atrPct,2)} ATR/price · percentile ${finite(volatility.percentile)?Math.round(volatility.percentile*100):'NA'}%`,required:false},
    {key:'sectorContext',label:'Sector context',state:sectorAvailable?String(sectorContext.state):'NOT_AVAILABLE',value:sectorAvailable?String(sectorContext.reason||sectorContext.state):'No validated sector dataset connected',required:false}
  ];

  return{
    version:'environment-equity-v1',symbol:String(symbol||''),state,gateState,classification,shadowOnly:true,affectsExecution:false,blocking:false,
    reason:optionalMissing.length&&gateState!=='FAIL'?`${reason} Sector context is not available yet, so evidence coverage is partial.`:reason,
    nextCondition,asOf:asOf??Number(stock.at(-1)?.time)??null,
    stockTrend,marketTrend,volatility,sectorContext:sectorAvailable?sectorContext:null,
    evidenceCoverage:{available:sectorAvailable?5:4,required:4,optionalMissing},missingInputs:optionalMissing.slice(),metrics,
    researchPolicy:{equityAdaptation:true,validatedForExecution:false,volatilityElevatedPercentile:VOLATILITY_ELEVATED_PERCENTILE,minDailyBars:MIN_DAILY_BARS}
  };
}

export const ENVIRONMENT_ENGINE_POLICY=Object.freeze({
  minDailyBars:MIN_DAILY_BARS,
  volatilityLookback:VOLATILITY_LOOKBACK,
  volatilityElevatedPercentile:VOLATILITY_ELEVATED_PERCENTILE,
  affectsExecution:false,
  shadowOnly:true
});
