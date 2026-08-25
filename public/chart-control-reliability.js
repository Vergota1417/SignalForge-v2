(() => {
  'use strict';

  const CONTROL_IDS=new Set(['sfChartBase','sfChartMarkers','sfChartLatest','sfChartReset']);
  const beforeClick=new WeakMap();
  let statusNode=null,observer=null;

  injectStyles();
  bindExisting();
  observer=new MutationObserver(bindExisting);
  observer.observe(document.documentElement,{childList:true,subtree:true});

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.sf-chart-btn');
    if(!button||!CONTROL_IDS.has(button.id))return;
    beforeClick.set(button,{text:String(button.textContent||''),hidden:Boolean(button.hidden),at:Date.now()});
  },true);

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.sf-chart-btn');
    if(!button||!CONTROL_IDS.has(button.id))return;
    const before=beforeClick.get(button)||{text:String(button.textContent||''),hidden:Boolean(button.hidden)};
    queueMicrotask(()=>reinforce(button,before));
  });

  function bindExisting(){
    const toolbar=document.querySelector('.sf-chart-toolbar');
    if(!toolbar)return;
    toolbar.dataset.controlsReady='1';
    if(!statusNode||!statusNode.isConnected){
      statusNode=document.createElement('span');
      statusNode.id='sfChartControlStatus';
      statusNode.className='sf-chart-control-status';
      statusNode.setAttribute('role','status');
      statusNode.setAttribute('aria-live','polite');
      statusNode.textContent='Chart controls ready';
      toolbar.querySelector('.sf-chart-actions')?.insertAdjacentElement('beforebegin',statusNode);
    }
    for(const id of CONTROL_IDS){
      const button=document.getElementById(id);if(!button)continue;
      button.style.pointerEvents='auto';
      button.style.touchAction='manipulation';
      button.setAttribute('aria-controls','sfFinancialChart');
    }
  }

  function reinforce(button,before){
    const bridge=window.SignalForgeChartBridge||{};
    const timeScale=()=>bridge.chart?.timeScale?.();
    try{
      if(button.id==='sfChartLatest'){
        timeScale()?.scrollToRealTime?.();
        announce('Latest candle centered');
        return;
      }
      if(button.id==='sfChartReset'){
        const base=document.getElementById('sfChartBase');
        if(!base||base.hidden){timeScale()?.fitContent?.();announce('Full chart view restored');return;}
        setTimeout(()=>{
          if(base.hidden){announce('Base chart restored');return;}
          fallbackBaseReload('Reset');
        },120);
        return;
      }
      if(button.id==='sfChartBase'){
        setTimeout(()=>{
          if(button.hidden){announce('Base chart restored');return;}
          fallbackBaseReload('Base view');
        },120);
        return;
      }
      if(button.id==='sfChartMarkers'){
        const unchanged=String(button.textContent||'')===String(before.text||'');
        if(unchanged){
          const turnOn=!/markers\s+on/i.test(before.text||'');
          button.textContent=turnOn?'Markers on':'Markers off';
        }
        const enabled=/markers\s+on/i.test(String(button.textContent||''));
        applyMarkers(enabled);
        button.setAttribute('aria-pressed',enabled?'true':'false');
        announce(enabled?'Decision markers shown':'Decision markers hidden');
      }
    }catch(error){
      console.warn('[SignalForge chart] Control reliability fallback failed.',error);
      announce('Chart control retry failed',true);
    }
  }

  function fallbackBaseReload(source){
    const active=document.querySelector('.timeframe-btn.active');
    if(!active){announce(`${source} unavailable`,true);return;}
    if(active.dataset.sfChartBaseRetry==='1'){announce(`${source} retry unavailable`,true);return;}
    active.dataset.sfChartBaseRetry='1';
    announce('Reloading base timeframe…');
    active.click();
    setTimeout(()=>delete active.dataset.sfChartBaseRetry,1200);
  }

  function applyMarkers(enabled){
    const bridge=window.SignalForgeChartBridge||{},api=bridge.markerApi;
    if(!api?.setMarkers)return;
    const rows=enabled?(window.__sfDecisionMarkers||bridge.markers||[]):[];
    api.setMarkers(Array.isArray(rows)?rows:[]);
  }

  function announce(message,error=false){
    bindExisting();
    if(!statusNode)return;
    statusNode.textContent=message;
    statusNode.classList.toggle('error',Boolean(error));
    clearTimeout(announce.timer);
    announce.timer=setTimeout(()=>{if(statusNode?.isConnected){statusNode.textContent='Chart controls ready';statusNode.classList.remove('error');}},1100);
  }

  function injectStyles(){
    if(document.getElementById('sfChartControlReliabilityStyles'))return;
    const style=document.createElement('style');style.id='sfChartControlReliabilityStyles';style.textContent=`
      .sf-chart-toolbar{position:relative!important;z-index:30!important;isolation:isolate;pointer-events:auto!important}
      .sf-chart-actions{position:relative;z-index:31;pointer-events:auto!important}
      .sf-chart-btn{position:relative;z-index:32;pointer-events:auto!important;touch-action:manipulation!important;user-select:none;-webkit-user-select:none}
      .sf-chart-btn:hover{border-color:#315579;background:#13243a}.sf-chart-btn:focus-visible{outline:2px solid #4ea1ff;outline-offset:2px}
      .sf-chart-control-status{margin-left:auto;color:#72869f;font-size:.62rem;white-space:nowrap}.sf-chart-control-status.error{color:#ef6262}
      @media(max-width:760px){.sf-chart-control-status{width:100%;order:2;text-align:right}.sf-chart-actions{order:3}}
    `;document.head.appendChild(style);
  }

  window.SignalForgeChartControls=Object.freeze({
    reinforce:(id)=>{const button=document.getElementById(id);if(button)reinforce(button,{text:String(button.textContent||''),hidden:Boolean(button.hidden)});},
    ready:()=>Boolean(document.querySelector('.sf-chart-toolbar[data-controls-ready="1"]'))
  });
})();
