(() => {
  'use strict';

  const RECENT_KEY='signalforge_recent_symbols_v1';
  const META_KEY='signalforge_symbol_meta_v1';
  const META_MAX_AGE=7*24*60*60*1000;
  const memory=new Map();
  let activeSymbol='';
  let requestId=0;

  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const cleanSymbol=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);

  function readStore(){
    try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')||{};}catch{return {};}
  }

  function writeStore(store){
    try{localStorage.setItem(META_KEY,JSON.stringify(store));}catch{}
  }

  function cachedMeta(symbol){
    if(memory.has(symbol))return memory.get(symbol);
    const row=readStore()[symbol];
    if(!row||!row.savedAt||Date.now()-Number(row.savedAt)>META_MAX_AGE)return null;
    memory.set(symbol,row);
    return row;
  }

  function saveMeta(meta){
    const row={...meta,savedAt:Date.now()};
    memory.set(meta.symbol,row);
    const store=readStore();store[meta.symbol]=row;writeStore(store);
    repairRecent(row);
    return row;
  }

  function repairRecent(meta){
    try{
      const rows=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
      if(!Array.isArray(rows))return;
      let changed=false;
      const next=rows.map(row=>{
        if(String(row?.symbol||'').toUpperCase()!==meta.symbol)return row;
        changed=true;
        return {...row,name:meta.name||row.name||meta.symbol,type:meta.type||row.type||'',exchange:meta.exchange||row.exchange||'',country:meta.country||row.country||'',currency:meta.currency||row.currency||''};
      });
      if(changed)localStorage.setItem(RECENT_KEY,JSON.stringify(next));
    }catch{}
  }

  function formatType(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    return raw.replace(/_/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase());
  }

  function applyMeta(meta){
    const badge=document.getElementById('tickerBadge');
    if(cleanSymbol(badge?.textContent)!==meta.symbol)return;
    const title=document.getElementById('stockTitle');
    const subtitle=document.getElementById('stockSubtitle');
    if(title)title.textContent=meta.name&&meta.name!==meta.symbol?`${meta.symbol} · ${meta.name}`:meta.symbol;
    if(subtitle){
      const details=[formatType(meta.type),meta.exchange,meta.country,meta.currency].filter(Boolean);
      subtitle.textContent=details.length?details.join(' · '):'Verified market symbol';
    }
  }

  async function fetchMeta(symbol){
    const cached=cachedMeta(symbol);
    if(cached)return cached;
    const response=await fetch(`${apiBase()}/api/symbol-search?q=${encodeURIComponent(symbol)}`,{headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
    const rows=Array.isArray(body.results)?body.results:[];
    const exact=rows.find(row=>String(row.symbol||'').toUpperCase()===symbol);
    if(!exact)return null;
    return saveMeta({
      symbol,
      name:String(exact.name||symbol),
      type:String(exact.type||''),
      exchange:String(exact.exchange||''),
      country:String(exact.country||''),
      currency:String(exact.currency||'')
    });
  }

  async function refresh(){
    const symbol=cleanSymbol(document.getElementById('tickerBadge')?.textContent);
    if(!symbol)return;
    activeSymbol=symbol;
    const id=++requestId;
    try{
      const cached=cachedMeta(symbol);
      if(cached)applyMeta(cached);
      const meta=cached||await fetchMeta(symbol);
      if(id!==requestId||activeSymbol!==symbol||!meta)return;
      applyMeta(meta);
    }catch(error){console.warn('[SignalForge metadata] unavailable',symbol,error);}
  }

  function start(){
    const badge=document.getElementById('tickerBadge');
    if(!badge)return;
    let last='';
    const check=()=>{
      const symbol=cleanSymbol(badge.textContent);
      if(symbol&&symbol!==last){last=symbol;setTimeout(refresh,0);}
    };
    new MutationObserver(check).observe(badge,{childList:true,characterData:true,subtree:true});
    document.addEventListener('click',event=>{
      if(event.target.closest('.watch-item,.radar-item,.recent-item,.alert-history-row,.symbol-suggestion,#loadSymbolBtn'))setTimeout(refresh,350);
    });
    check();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
