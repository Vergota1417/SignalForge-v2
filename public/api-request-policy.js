(() => {
  'use strict';
  const root=typeof self!=='undefined'?self:globalThis;
  if(root.SignalForgeApiRequestPolicy)return;

  const FIVE_MINUTES=5*60_000;
  const THIRTY_MINUTES=30*60_000;
  const SAFE_GET_TTL_MS=Object.freeze({
    '/api/signals':FIVE_MINUTES,
    '/api/opportunity-radar':FIVE_MINUTES,
    '/api/screener':FIVE_MINUTES,
    '/api/alerts':FIVE_MINUTES,
    '/api/operations-status':FIVE_MINUTES,
    '/api/research-status':FIVE_MINUTES,
    '/api/detection-latency':FIVE_MINUTES,
    '/api/evidence-evaluation':FIVE_MINUTES,
    '/api/evidence-optimization':FIVE_MINUTES,
    '/api/health':FIVE_MINUTES,
    '/api/trade-plan':FIVE_MINUTES,
    '/api/auction-context':FIVE_MINUTES
  });

  function ttlFor(input,base){
    let url;
    try{
      if(input instanceof URL)url=input;
      else url=new URL(String(input||''),base||root.location?.origin||'https://signalforge.invalid');
    }catch{return 0;}
    if(url.pathname==='/api/market-data'&&url.searchParams.get('cacheOnly')==='1')return THIRTY_MINUTES;
    return SAFE_GET_TTL_MS[url.pathname]||0;
  }

  root.SignalForgeApiRequestPolicy=Object.freeze({
    backgroundReadMs:FIVE_MINUTES,
    cacheOnlyMarketDataMs:THIRTY_MINUTES,
    safeGetTtlMs:SAFE_GET_TTL_MS,
    ttlFor
  });
})();
