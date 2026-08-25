(() => {
  'use strict';

  if(window.__sfApiCoordinatorInstalled)return;
  window.__sfApiCoordinatorInstalled=true;

  const policy=window.SignalForgeApiRequestPolicy;
  if(!policy?.ttlFor)throw new Error('SignalForge API request policy must load before the request coordinator.');

  const nativeFetch=window.fetch.bind(window);
  const memory=new Map();
  const inflight=new Map();
  const stats={network:0,memoryHits:0,deduped:0,lastNetworkAt:0,blockedBackgroundBursts:0,networkByPath:{}};

  function eligible(input,init){
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(method!=='GET')return null;
    let url;try{url=new URL(typeof input==='string'?input:input?.url||'',location.origin);}catch{return null;}
    if(url.origin!==location.origin)return null;
    const ttl=policy.ttlFor(url,location.origin);if(!ttl)return null;
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
    window.dispatchEvent(new CustomEvent('signalforge:api-usage',{detail:{...stats,networkByPath:{...stats.networkByPath},cacheEntries:memory.size,inflight:inflight.size}}));
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
      stats.network++;stats.lastNetworkAt=Date.now();stats.networkByPath[rule.url.pathname]=(stats.networkByPath[rule.url.pathname]||0)+1;
      if(response.ok){
        memory.set(rule.key,{expiresAt:Date.now()+rule.ttl,snapshot});
        window.dispatchEvent(new CustomEvent('signalforge:api-snapshot',{detail:{url:rule.url.href,path:rule.url.pathname,expiresAt:Date.now()+rule.ttl}}));
      }
      emit();
      return snapshot;
    })();
    inflight.set(rule.key,task);
    try{return makeResponse(await task);}finally{inflight.delete(rule.key);}
  };

  window.SignalForgeApiCoordinator=Object.freeze({
    stats:()=>({...stats,networkByPath:{...stats.networkByPath},cacheEntries:memory.size,inflight:inflight.size}),
    clear:()=>memory.clear(),
    ttlForPath:path=>policy.ttlFor(String(path||''),location.origin),
    policy
  });
})();
