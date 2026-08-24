export const BROAD_MARKET_BENCHMARK='SPY';

const CONTEXT={
  AAPL:{sector:'XLK',industry:'QQQ',label:'Technology'},MSFT:{sector:'XLK',industry:'QQQ',label:'Technology'},NVDA:{sector:'XLK',industry:'SMH',label:'Semiconductors'},AMZN:{sector:'XLY',industry:'QQQ',label:'Consumer / growth'},META:{sector:'XLC',industry:'QQQ',label:'Communication services'},GOOGL:{sector:'XLC',industry:'QQQ',label:'Communication services'},AVGO:{sector:'XLK',industry:'SMH',label:'Semiconductors'},TSLA:{sector:'XLY',industry:'QQQ',label:'Consumer / growth'},AMD:{sector:'XLK',industry:'SMH',label:'Semiconductors'},NFLX:{sector:'XLC',industry:'QQQ',label:'Communication services'},CRM:{sector:'XLK',industry:'IGV',label:'Software'},ORCL:{sector:'XLK',industry:'IGV',label:'Software'},ADBE:{sector:'XLK',industry:'IGV',label:'Software'},QCOM:{sector:'XLK',industry:'SMH',label:'Semiconductors'},INTC:{sector:'XLK',industry:'SMH',label:'Semiconductors'},MU:{sector:'XLK',industry:'SMH',label:'Semiconductors'},AMAT:{sector:'XLK',industry:'SMH',label:'Semiconductor equipment'},ARM:{sector:'XLK',industry:'SMH',label:'Semiconductors'},PLTR:{sector:'XLK',industry:'IGV',label:'Software'},CRWD:{sector:'XLK',industry:'IGV',label:'Software'},
  JPM:{sector:'XLF',industry:'KBE',label:'Financials / banks'},BAC:{sector:'XLF',industry:'KBE',label:'Financials / banks'},GS:{sector:'XLF',industry:'KCE',label:'Financials / capital markets'},V:{sector:'XLF',industry:'IPAY',label:'Financials / payments'},MA:{sector:'XLF',industry:'IPAY',label:'Financials / payments'},
  XOM:{sector:'XLE',industry:'XLE',label:'Energy'},CVX:{sector:'XLE',industry:'XLE',label:'Energy'},COP:{sector:'XLE',industry:'XOP',label:'Energy / exploration'},
  LLY:{sector:'XLV',industry:'IHE',label:'Healthcare / pharmaceuticals'},UNH:{sector:'XLV',industry:'IHF',label:'Healthcare / providers'},
  COST:{sector:'XLP',industry:'XLP',label:'Consumer staples'},WMT:{sector:'XLP',industry:'XLP',label:'Consumer staples'},KO:{sector:'XLP',industry:'XLP',label:'Consumer staples'},PEP:{sector:'XLP',industry:'XLP',label:'Consumer staples'},
  HD:{sector:'XLY',industry:'XHB',label:'Consumer discretionary / home'},CAT:{sector:'XLI',industry:'XLI',label:'Industrials'},GE:{sector:'XLI',industry:'XLI',label:'Industrials'},UBER:{sector:'XLI',industry:'IYT',label:'Industrials / transportation'},BA:{sector:'XLI',industry:'ITA',label:'Industrials / aerospace'},DIS:{sector:'XLC',industry:'XLC',label:'Communication services'}
};

export function benchmarkContextFor(symbol){
  const s=sanitizeSymbol(symbol),mapped=CONTEXT[s];
  if(!mapped)return{symbol:s,industryBenchmark:null,sectorBenchmark:null,marketBenchmark:BROAD_MARKET_BENCHMARK,label:'Unmapped — broad market only',mappingSource:'broad-fallback'};
  return{symbol:s,industryBenchmark:mapped.industry||null,sectorBenchmark:mapped.sector||null,marketBenchmark:BROAD_MARKET_BENCHMARK,label:mapped.label,mappingSource:'curated-core'};
}

export function benchmarkSymbolsFor(symbol){const c=benchmarkContextFor(symbol);return[...new Set([c.industryBenchmark,c.sectorBenchmark,c.marketBenchmark].filter(Boolean).filter(x=>x!==symbol))];}

export function relativeStrengthFor(candles,benchmarkCandles,lookback=20){
  const stockReturn=periodReturn(candles,lookback),benchmarkReturn=periodReturn(benchmarkCandles,lookback);
  if(stockReturn===null||benchmarkReturn===null)return null;
  return stockReturn-benchmarkReturn;
}

export function buildBenchmarkEvidenceContext(symbol,{stockCandles,industryCandles=null,sectorCandles=null,marketCandles=null,lookback=20}={}){
  const mapping=benchmarkContextFor(symbol);
  return{
    ...mapping,lookback,
    industryRelativeStrength:industryCandles?relativeStrengthFor(stockCandles,industryCandles,lookback):null,
    sectorRelativeStrength:sectorCandles?relativeStrengthFor(stockCandles,sectorCandles,lookback):null,
    marketRelativeStrength:marketCandles?relativeStrengthFor(stockCandles,marketCandles,lookback):null,
    industryTrend:industryCandles?trendState(industryCandles):null,
    sectorTrend:sectorCandles?trendState(sectorCandles):null,
    marketTrend:marketCandles?trendState(marketCandles):null
  };
}

function periodReturn(candles,lookback){if(!Array.isArray(candles)||candles.length<=lookback)return null;const end=Number(candles.at(-1)?.close),start=Number(candles[candles.length-1-lookback]?.close);return end>0&&start>0?end/start-1:null;}
function trendState(candles){if(!Array.isArray(candles)||candles.length<50)return'UNKNOWN';const closes=candles.map(x=>Number(x.close)).filter(x=>x>0);if(closes.length<50)return'UNKNOWN';const latest=closes.at(-1),s20=avg(closes.slice(-20)),s50=avg(closes.slice(-50));return latest>s50&&s20>s50?'BULL':latest<s50&&s20<s50?'RISK_OFF':'MIXED';}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function sanitizeSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);}
