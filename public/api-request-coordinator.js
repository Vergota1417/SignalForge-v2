(() => {
  'use strict';

  if(window.__sfApiCoordinatorInstalled)return;
  window.__sfApiCoordinatorInstalled=true;

  const TTL_BY_PATH=new Map([
    ['/api/signals',55_000],
    ['/api/opportunity-radar',55_000],
    ['/api/screener',55_000],
    ['/api/alerts',55_000],
    ['/api/operations-status',120_000],
    ['/api/research-status',180_000],
    ['/api/detection-latency',180_000],
    ['/api/evidence-evaluation',300_000],
    ['/api/evidence-optimization',300_000],
    ['/api/health',300_000]
  ]);

  const nativeFetch=window.fetch.bind(window);
  const memory=new Map();
  const inflight=new Map();
  const stats={network:0,memoryHits:0,deduped:0,lastNetworkAt:0};

  function ttlFor(url){return TTL_BY_PATH.get(url.pathname)||0;}
  function eligible(input,init){
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(method!=='GET')return null;
    let url;try{url=new URL(typeof input==='string'?input:input?.url||'',location.origin);}catch{return null;}
    if(url.origin!==location.origin)return null;
    const ttl=ttlFor(url);if(!ttl)return null;
    return{url,ttl,key:url.href};
  }
  function makeResponse(snapshot){
    return new Response(snapshot.body,{status:snapshot.status,statusText:snapshot.statusText,headers:new Headers(snapshot.headers)});
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
    if(cached&&cached.expiresAt>now){stats.memoryHits++;emit();return makeResponse(cached.snapshot);}
    if(inflight.has(rule.key)){stats.deduped++;emit();return makeResponse(await inflight.get(rule.key));}

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
    ttlForPath:path=>TTL_BY_PATH.get(String(path||''))||0
  });
})();
