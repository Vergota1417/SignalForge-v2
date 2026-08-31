(() => {
  'use strict';
  const KEY='signalforge_last_symbol_v1';
  const sanitize=value=>{const s=String(value||'').trim().toUpperCase();return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';};

  const startupParams=new URLSearchParams(location.search);
  const deepLink=sanitize(startupParams.get('symbol'));
  let remembered='',draftDirty=false;
  try{remembered=sanitize(localStorage.getItem(KEY));}catch{}

  if(!deepLink&&remembered){
    startupParams.set('symbol',remembered);
    const query=startupParams.toString();
    history.replaceState(history.state,'',`${location.pathname}${query?`?${query}`:''}${location.hash}`);
  }

  const selection=window.SignalForgeSelection=window.SignalForgeSelection||{symbol:'',updatedAt:0};

  function syncInput(symbol,force=false){
    const input=document.getElementById('symbolInput');if(!input)return;
    if(force||document.activeElement!==input||!draftDirty){if(sanitize(input.value)!==symbol)input.value=symbol;draftDirty=false;}
  }

  function rememberDisplayedSymbol(){
    const badge=document.getElementById('tickerBadge');
    const symbol=sanitize(badge?.textContent);if(!symbol)return;
    const changed=selection.symbol!==symbol;
    selection.symbol=symbol;selection.updatedAt=Date.now();
    try{localStorage.setItem(KEY,symbol);}catch{}
    syncInput(symbol,changed);

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
    input.addEventListener('input',()=>{const active=sanitize(selection.symbol||document.getElementById('tickerBadge')?.textContent);draftDirty=document.activeElement===input&&sanitize(input.value)!==active;});
    input.addEventListener('blur',()=>{draftDirty=false;const active=sanitize(selection.symbol||document.getElementById('tickerBadge')?.textContent);if(active)syncInput(active,true);});
    window.addEventListener('signalforge:selected-symbol',event=>{const symbol=sanitize(event.detail?.symbol);if(symbol)syncInput(symbol,true);});
  }

  function observe(){
    const badge=document.getElementById('tickerBadge');if(!badge){requestAnimationFrame(observe);return;}
    rememberDisplayedSymbol();
    new MutationObserver(rememberDisplayedSymbol).observe(badge,{childList:true,characterData:true,subtree:true});
  }
  bindInput();observe();
})();
