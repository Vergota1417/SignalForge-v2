import { getCandles, searchMarketSymbols, configuredProviders, listUsMarketAssets, dedupeAndSortCandles, minimumHistory, validCandle } from './market-data-gateway.js';
import { parseProviderTime } from './twelve-data-provider.js';

export async function getMarketData(env,symbol,timeframe,forceRefresh=false,options={}){
  return getCandles(env,symbol,timeframe,{...options,forceRefresh});
}

export async function searchSymbols(env,query,options={}){
  return searchMarketSymbols(env,query,options);
}

export { configuredProviders, listUsMarketAssets, dedupeAndSortCandles, minimumHistory, parseProviderTime, validCandle };
