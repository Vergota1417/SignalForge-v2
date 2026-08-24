(() => {
  'use strict';
  const KEY='signalforge_last_symbol_v1';
  const sanitize=value=>{const s=String(value||'').trim().toUpperCase();return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';};

  const startupParams=new URLSearchParams(location.search);
  const deepLink=sanitize(startupParams.get('symbol'));
  let remembered='';
  try{remembered=sanitize(localStorage.getItem(KEY));}catch{}

  if(!deepLink&&remembered){
    startupParams.set('symbol',remembered);
    const query=startupParams.toString();
    history.replaceState(history.state,'',`${location.pathname}${query?`?${query}`:''}${location.hash}`);
  }

  function rememberDisplayedSymbol(){
    const badge=document.getElementById('tickerBadge');
    const symbol=sanitize(badge?.textContent);
    if(!symbol)return;
    try{localStorage.setItem(KEY,symbol);}catch{}

    const params=new URLSearchParams(location.search);
    if(sanitize(params.get('symbol'))!==symbol){
      params.set('symbol',symbol);
      const query=params.toString();
      history.replaceState(history.state,'',`${location.pathname}${query?`?${query}`:''}${location.hash}`);
    }
  }

  function observe(){
    const badge=document.getElementById('tickerBadge');
    if(!badge){requestAnimationFrame(observe);return;}
    new MutationObserver(rememberDisplayedSymbol).observe(badge,{childList:true,characterData:true,subtree:true});
  }
  observe();
})();
