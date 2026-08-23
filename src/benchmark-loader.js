import { benchmarkContextFor, buildBenchmarkEvidenceContext } from './benchmark-context.js';
import { getMarketData } from './market.js';

export async function loadBenchmarkEvidence(env,symbol,{stockCandles,timeframe='6M',completedOnly=false,purposePrefix='benchmark-context'}={}){
  const mapping=benchmarkContextFor(symbol);
  const requested=[mapping.industryBenchmark,mapping.sectorBenchmark,mapping.marketBenchmark].filter(Boolean);
  const unique=[...new Set(requested.filter(x=>x!==symbol))];
  const candlesBySymbol=new Map();
  const errors=[];

  for(const benchmarkSymbol of unique){
    try{
      const market=await getMarketData(env,benchmarkSymbol,timeframe,false,{completedOnly,purpose:`${purposePrefix}-${String(timeframe).toLowerCase()}`});
      candlesBySymbol.set(benchmarkSymbol,market.candles);
    }catch(error){
      errors.push({symbol:benchmarkSymbol,message:String(error?.message||error)});
      if(/quota|429|too many requests/i.test(String(error?.message||'')))break;
    }
  }

  const context=buildBenchmarkEvidenceContext(symbol,{
    stockCandles,
    industryCandles:mapping.industryBenchmark?candlesBySymbol.get(mapping.industryBenchmark)||null:null,
    sectorCandles:mapping.sectorBenchmark?candlesBySymbol.get(mapping.sectorBenchmark)||null:null,
    marketCandles:mapping.marketBenchmark?candlesBySymbol.get(mapping.marketBenchmark)||null:null
  });

  return{context,errors,loadedSymbols:[...candlesBySymbol.keys()]};
}
