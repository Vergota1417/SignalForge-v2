import { getCandles, searchMarketSymbols, configuredProviders, listUsMarketAssets } from './market-data-gateway.js';

export async function getMarketData(env,symbol,timeframe,forceRefresh=false,options={}){
  return getCandles(env,symbol,timeframe,{...options,forceRefresh});
}

export async function searchSymbols(env,query,options={}){
  return searchMarketSymbols(env,query,options);
}

export { configuredProviders, listUsMarketAssets };
