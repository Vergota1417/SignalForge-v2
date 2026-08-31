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

  const selection=window.SignalForgeSelection=window.SignalForgeSelection||{symbol:'',updatedAt:0};

  function rememberDisplayedSymbol(){
    const badge=document.getElementById('tickerBadge');
    const symbol=sanitize(badge?.textContent);
    if(!symbol)return;
    const changed=selection.symbol!==symbol;
    selection.symbol=symbol;selection.updatedAt=Date.now();
    try{localStorage.setItem(KEY,symbol);}catch{}

    const input=document.getElementById('symbolInput');
    if(input&&document.activeElement!==input&&sanitize(input.value)!==symbol)input.value=symbol;

    const params=new URLSearchParams(location.search);
    if(sanitize(params.get('symbol'))!==symbol){
      params.set('symbol',symbol);
      const query=params.toString();
      history.replaceState(history.state,'',`${location.pathname}${query?`?${query}`:''}${location.hash}`);
    }
    if(changed)window.dispatchEvent(new CustomEvent('signalforge:selected-symbol',{detail:{symbol,source:'tickerBadge',updatedAt:selection.updatedAt}}));
  }

  function bindInput(){
    const input=document.getElementById('symbolInput');if(!input){requestAnimationFrame(bindInput);return;}
    input.addEventListener('blur',()=>{const active=sanitize(document.getElementById('tickerBadge')?.textContent);if(active&&sanitize(input.value)!==active)input.value=active;});
  }

  function observe(){
    const badge=document.getElementById('tickerBadge');
    if(!badge){requestAnimationFrame(observe);return;}
    rememberDisplayedSymbol();
    new MutationObserver(rememberDisplayedSymbol).observe(badge,{childList:true,characterData:true,subtree:true});
  }
  bindInput();observe();
})();
