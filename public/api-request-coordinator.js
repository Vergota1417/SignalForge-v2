(() => {
  'use strict';

  if(window.__sfApiCoordinatorInstalled)return;
  window.__sfApiCoordinatorInstalled=true;

  const FIVE_MINUTES=5*60_000;
  const THIRTY_MINUTES=30*60_000;
  const TTL_BY_PATH=new Map([
    ['/api/signals',FIVE_MINUTES],
    ['/api/opportunity-radar',FIVE_MINUTES],
    ['/api/screener',FIVE_MINUTES],
    ['/api/alerts',FIVE_MINUTES],
    ['/api/operations-status',FIVE_MINUTES],
    ['/api/research-status',FIVE_MINUTES],
    ['/api/detection-latency',FIVE_MINUTES],
    ['/api/evidence-evaluation',FIVE_MINUTES],
    ['/api/evidence-optimization',FIVE_MINUTES],
    ['/api/health',FIVE_MINUTES]
  ]);

  const nativeFetch=window.fetch.bind(window);
  const memory=new Map();
  const inflight=new Map();
  const stats={network:0,memoryHits:0,deduped:0,lastNetworkAt:0,blockedBackgroundBursts:0};

  function ttlFor(url){
    if(url.pathname==='/api/market-data'&&url.searchParams.get('cacheOnly')==='1')return THIRTY_MINUTES;
    return TTL_BY_PATH.get(url.pathname)||0;
  }

  function eligible(input,init){
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(method!=='GET')return null;
    let url;try{url=new URL(typeof input==='string'?input:input?.url||'',location.origin);}catch{return null;}
    if(url.origin!==location.origin)return null;
    const ttl=ttlFor(url);if(!ttl)return null;
    return{url,ttl,key:url.href};
  }

  function makeResponse(snapshot){
    const body=snapshot.body instanceof ArrayBuffer?snapshot.body.slice(0):snapshot.body;
    const headers=new Headers(snapshot.headers);headers.set('x-sf-client-cache','1');
    return new Response(body,{status:snapshot.status,statusText:snapshot.statusText,headers});
  }

  async function snapshotResponse(response){
    const body=await response.clone().arrayBuffer();
    return{body,status:response.status,statusText:response.statusText,headers:[...response.headers.entries()]};
  }

  function emit(){
    window.dispatchEvent(new CustomEvent('signalforge:api-usage',{detail:{...stats,cacheEntries:memory.size,inflight:inflight.size}}));
  }

  window.fetch=async function coordinatedFetch(input,init){
    const rule=eligible(input,init);
    if(!rule)return nativeFetch(input,init);

    const now=Date.now(),cached=memory.get(rule.key);
    if(cached&&cached.expiresAt>now){
      stats.memoryHits++;stats.blockedBackgroundBursts++;emit();return makeResponse(cached.snapshot);
    }
    if(inflight.has(rule.key)){
      stats.deduped++;stats.blockedBackgroundBursts++;emit();return makeResponse(await inflight.get(rule.key));
    }

    const task=(async()=>{
      const response=await nativeFetch(input,init);
      const snapshot=await snapshotResponse(response);
      stats.network++;stats.lastNetworkAt=Date.now();
      if(response.ok)memory.set(rule.key,{expiresAt:Date.now()+rule.ttl,snapshot});
      emit();
      return snapshot;
    })();
    inflight.set(rule.key,task);
    try{return makeResponse(await task);}finally{inflight.delete(rule.key);}
  };

  window.SignalForgeApiCoordinator=Object.freeze({
    stats:()=>({...stats,cacheEntries:memory.size,inflight:inflight.size}),
    clear:()=>memory.clear(),
    ttlForPath:path=>TTL_BY_PATH.get(String(path||''))||0,
    policy:Object.freeze({backgroundReadMs:FIVE_MINUTES,cacheOnlyMarketDataMs:THIRTY_MINUTES})
  });
})();
