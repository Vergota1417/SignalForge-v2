(() => {
  'use strict';

  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  const PREF_KEY='signalforge_pattern_overlay_v1';
  const CONTEXT_PREFIX='signalforge_pattern_context_v2:';
  const CONTEXT_MAX_AGE_MS=7*24*60*60*1000;
  const SAVED_REFRESH_MS=5*60*1000;
  const DEFAULTS={support:true,resistance:true,channel:'auto',breakout:true,double:false,triangles:false,headShoulders:false,wedges:false,labels:true};

  let currentSymbol='',patternContext=null,contextSource='none',lastGoodAt=0,lastFetchAt=0,statusNode=null,cardObserver=null,refreshTimer=null;

  injectStyles();
  installFetchCapture();
  boot();

  function boot(){
    ensureUi();
    switchSymbol(selectedSymbol(),'boot');

    document.addEventListener('click',event=>{
      const button=event.target?.closest?.('#sfPatternContextCard .sf-pattern-btn');
      if(!button)return;
      setTimeout(()=>{syncControls();applyOverlays(`click:${button.dataset.toggle||button.dataset.action||'control'}`);},0);
    });

    window.addEventListener('signalforge:pattern-chart-ready',()=>setTimeout(()=>applyOverlays('chart-ready'),80));
    window.addEventListener('signalforge:market-data',()=>{
      if(patternContext)applyOverlays('market-data-event');
      else refreshSavedContext('market-data-event');
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState!=='visible')return;
      syncControls();
      if(!patternContext||Date.now()-lastGoodAt>4*60*60*1000)refreshSavedContext('visible');
      else applyOverlays('visible');
    });

    const ticker=document.getElementById('tickerBadge');
    if(ticker)new MutationObserver(()=>{
      const next=selectedSymbol();
      if(next&&next!==currentSymbol)switchSymbol(next,'symbol-change');
    }).observe(ticker,{childList:true,subtree:true,characterData:true});

    refreshTimer=setInterval(()=>{
      if(document.visibilityState==='hidden')return;
      refreshSavedContext('timer');
    },SAVED_REFRESH_MS);
  }

  function installFetchCapture(){
    if(window.__sfStablePatternFetchCapture)return;
    window.__sfStablePatternFetchCapture=true;
    const priorFetch=window.fetch.bind(window);
    window.fetch=async function(input,init){
      const response=await priorFetch(input,init);
      try{
        const url=new URL(typeof input==='string'?input:input?.url||'',location.origin);
        if(url.origin!==location.origin||!response.ok)return response;
        if(url.pathname==='/api/market-data'){
          response.clone().json().then(body=>{
            const symbol=String(body?.symbol||'').toUpperCase(),context=body?.analysis?.patternContext||body?.patternContext||null;
            if(symbol&&context)acceptContext(symbol,context,`live ${body.timeframe||'chart'} analysis`);
          }).catch(()=>{});
        }else if(url.pathname==='/api/signals'){
          response.clone().json().then(body=>{
            for(const row of body?.signals||[]){
              const symbol=String(row?.symbol||'').toUpperCase(),context=row?.analysis?.patternContext||null;
              if(symbol&&context)storeContext(symbol,context,'saved signal');
              if(symbol&&symbol===currentSymbol&&context)acceptContext(symbol,context,'saved signal');
            }
          }).catch(()=>{});
        }
      }catch{}
      return response;
    };
  }

  function switchSymbol(symbol,reason){
    if(!symbol)return;
    currentSymbol=symbol;
    const stored=loadStoredContext(symbol);
    patternContext=stored?.patternContext||null;
    contextSource=stored?.source||'none';
    lastGoodAt=Number(stored?.savedAt)||0;
    ensureUi();syncControls();
    if(patternContext){
      renderStableSummary(patternContext);
      applyOverlays(`${reason}:stored`);
      setStatus(`Holding last valid structure while SignalForge checks for a newer saved analysis · source: ${contextSource}`,'ok');
    }else{
      setStatus('No saved structure context is loaded yet. Controls are held stable; SignalForge will populate overlays when a deep analysis is available.','warn');
    }
    setTimeout(()=>refreshSavedContext(reason),180);
  }

  async function refreshSavedContext(source='manual'){
    const symbol=currentSymbol||selectedSymbol();if(!symbol)return;
    const now=Date.now();if(now-lastFetchAt<15_000)return;lastFetchAt=now;
    try{
      const response=await fetch(`${API}/api/signals`,{headers:{accept:'application/json'},cache:'no-store'}),body=await response.json();
      if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
      if(symbol!==currentSymbol)return;
      const row=(body.signals||[]).find(item=>String(item?.symbol||'').toUpperCase()===symbol),context=row?.analysis?.patternContext||null;
      if(context){acceptContext(symbol,context,'saved signal');return;}
      if(patternContext){
        renderStableSummary(patternContext);applyOverlays(`${source}:hold-last-good`);
        setStatus(`No newer structure record is available. Keeping the last valid ${symbol} structure on screen · source: ${contextSource}`,'ok');
      }else{
        setStatus(`${symbol} has no saved pattern context yet. This is not retried rapidly; the next real deep analysis or chart analysis will populate it.`,'warn');
      }
    }catch(error){
      if(patternContext){
        renderStableSummary(patternContext);applyOverlays(`${source}:request-failed-hold`);
        setStatus(`Structure refresh unavailable, so the last valid ${symbol} structure is being held on screen.`,'warn');
      }else setStatus(`Structure context is unavailable: ${String(error?.message||'request failed')}. Controls remain stable until the next scheduled refresh.`,'warn');
    }
  }

  function acceptContext(symbol,context,source){
    if(!symbol||!context)return;
    storeContext(symbol,context,source);
    if(symbol!==currentSymbol)return;
    patternContext=context;contextSource=source;lastGoodAt=Date.now();
    renderStableSummary(context);syncControls();applyOverlays(`context:${source}`);
  }

  function storeContext(symbol,context,source){
    try{sessionStorage.setItem(`${CONTEXT_PREFIX}${symbol}`,JSON.stringify({patternContext:context,source:String(source||'unknown'),savedAt:Date.now()}));}catch{}
  }
  function loadStoredContext(symbol){
    try{
      const row=JSON.parse(sessionStorage.getItem(`${CONTEXT_PREFIX}${symbol}`)||'null');
      if(!row?.patternContext)return null;
      if(Date.now()-Number(row.savedAt||0)>CONTEXT_MAX_AGE_MS){sessionStorage.removeItem(`${CONTEXT_PREFIX}${symbol}`);return null;}
      return row;
    }catch{return null;}
  }

  function ensureUi(){
    const card=document.getElementById('sfPatternContextCard');if(!card)return null;
    const controls=card.querySelector('.sf-pattern-controls');if(!controls)return card;
    if(!statusNode||!statusNode.isConnected){
      statusNode=document.createElement('div');statusNode.id='sfPatternOverlayStatus';statusNode.className='sf-pattern-overlay-stable';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');statusNode.textContent='Structure overlay controls ready.';controls.insertAdjacentElement('afterend',statusNode);
    }
    if(!cardObserver){
      cardObserver=new MutationObserver(()=>{
        clearTimeout(cardObserver.timer);cardObserver.timer=setTimeout(()=>{
          syncControls();
          if(patternContext&&card.querySelector('[data-pattern-state]')?.textContent==='COLLECTING')renderStableSummary(patternContext);
        },20);
      });
      cardObserver.observe(card,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    }
    syncControls();return card;
  }

  function syncControls(){
    const card=document.getElementById('sfPatternContextCard');if(!card)return;
    const prefs=loadPrefs(),labels={support:'Support',resistance:'Resistance',breakout:'Breakouts',double:'Double',triangles:'Triangles',headShoulders:'H&S',wedges:'Wedges',labels:'Labels'};
    for(const [key,label] of Object.entries(labels)){
      const button=card.querySelector(`[data-toggle="${key}"]`);if(!button)continue;
      const on=Boolean(prefs[key]);button.dataset.overlayState=on?'on':'off';button.setAttribute('aria-pressed',on?'true':'false');
      const text=`${label} ${on?'ON':'OFF'}`;if(button.textContent!==text)button.textContent=text;
    }
    const channel=card.querySelector('[data-toggle="channel"]');
    if(channel){
      const mode=prefs.channel==='auto'?'AUTO':prefs.channel===true?'ON':'OFF';
      channel.dataset.overlayState=mode.toLowerCase();channel.setAttribute('aria-pressed',mode==='AUTO'?'mixed':mode==='ON'?'true':'false');
      const text=`Channel ${mode}`;if(channel.textContent!==text)channel.textContent=text;
    }
  }

  function renderStableSummary(p){
    const card=ensureUi();if(!card||!p)return;
    set(card,'[data-pattern-support]',levelText(p.support,'below'));
    set(card,'[data-pattern-resistance]',levelText(p.resistance,'above'));
    set(card,'[data-pattern-channel]',`${p.channel?.type||'NO CLEAR'}${Number(p.channel?.confidence)?` ${Math.round(Number(p.channel.confidence))}`:''}`);
    set(card,'[data-pattern-breakout]',String(p.breakout?.state||'INSIDE'));
    const state=card.querySelector('[data-pattern-state]'),primary=p.primaryPattern;
    if(state){state.textContent=primary?`${primary.type} ${Math.round(Number(primary.confidence)||0)}`:`${p.structureState||'STRUCTURE'} ${Math.round(Number(p.structureConfidence)||0)}`;state.className=`sf-pattern-state ${tone(primary?.bias,p.breakout?.direction)}`;}
    set(card,'[data-pattern-sub]',`${currentSymbol} · daily structure · ${Number(p.lookbackBars)||0} bars · shadow-only`);
    if(card.querySelector('[data-pattern-explain]')?.textContent?.includes('Pattern Context will populate'))set(card,'[data-pattern-explain]',p.reason||'Structure context is available.');
  }

  function applyOverlays(source='manual'){
    ensureUi();syncControls();
    const bridge=window.SignalForgeChartBridge,p=patternContext,prefs=loadPrefs();
    if(!p){return 0;}
    if(!bridge?.ready||!bridge.candleSeries){setStatus('Structure context is ready; waiting for the chart bridge to finish attaching.','warn');return 0;}

    bridge.clearOverlays?.();let requested=0,drawn=0;
    const labels=Boolean(prefs.labels);
    const addPrice=(price,options)=>{requested++;const line=bridge.addPriceLine?.(price,options);if(line)drawn++;return Boolean(line);};
    const addTrend=(points,options)=>{requested++;const line=bridge.addTrendLine?.(points,options);if(line)drawn++;return Boolean(line);};

    if(prefs.support&&Number(p.support?.price)>0)addPrice(p.support.price,{color:'#2fd18b',lineWidth:1,title:labels?`Support · ${p.support.touches||0} touches`:''});
    if(prefs.resistance&&Number(p.resistance?.price)>0)addPrice(p.resistance.price,{color:'#ef6262',lineWidth:1,title:labels?`Resistance · ${p.resistance.touches||0} touches`:''});
    if(prefs.breakout&&Number(p.breakout?.level)>0&&p.breakout?.state!=='INSIDE')addPrice(p.breakout.level,{color:'#f4a340',lineWidth:2,title:labels?String(p.breakout.state):''});

    const channelDrawn=channelEnabled(p,prefs);
    if(channelDrawn){drawLineObject(p.channel?.lower,'#2fd18b',labels?'Channel support':'',addTrend);drawLineObject(p.channel?.upper,'#7ebcff',labels?'Channel resistance':'',addTrend);}
    for(const pat of p.patterns||[]){if(!familyEnabled(pat.family,prefs))continue;drawPattern(pat,labels,addPrice,addTrend);}

    const state=bridge.getOverlayState?.()||{priceLines:bridge.overlayPriceLines?.size||0,trendLines:bridge.overlaySeries?.size||0,total:drawn,lastError:bridge.lastError};
    const autoNote=prefs.channel==='auto'?(channelDrawn?' · Channel AUTO found a drawable channel':` · Channel AUTO stable; no qualifying channel (${String(p.channel?.type||'no clear channel')} ${Math.round(Number(p.channel?.confidence)||0)}/100)`):'';
    const failed=requested>drawn?` · ${requested-drawn} overlay${requested-drawn===1?'':'s'} could not draw`:'';
    const sourceNote=contextSource&&contextSource!=='none'?` · source: ${contextSource}`:'';
    setStatus(`<strong>${drawn} overlay${drawn===1?'':'s'} drawn</strong> · ${Number(state.priceLines)||0} level lines · ${Number(state.trendLines)||0} trend lines${sourceNote}${autoNote}${failed}`,state.lastError||requested>drawn?'warn':'ok',true);
    window.dispatchEvent(new CustomEvent('signalforge:pattern-overlays-stable',{detail:{source,symbol:currentSymbol,requested,drawn,state,contextSource}}));
    return drawn;
  }

  function drawPattern(pat,labels,addPrice,addTrend){
    const color=pat.bias==='BULLISH'?'#2fd18b':pat.bias==='BEARISH'?'#ef6262':'#f4a340';
    for(const line of pat.lines||[]){
      if(line?.kind==='horizontal'&&Number(line.price)>0)addPrice(line.price,{color,lineWidth:2,title:labels?(line.label||pat.type):''});
      else drawLineObject(line,color,labels?pat.type:'',addTrend);
    }
    if((pat.family==='double'||pat.family==='head-shoulders')&&Array.isArray(pat.anchors)&&pat.anchors.length>=2){
      const points=pat.anchors.filter(a=>Number(a?.time)>0&&Number(a?.price)>0).map(a=>({time:Number(a.time),value:Number(a.price)}));
      if(points.length>=2)addTrend(points,{color,lineWidth:2,title:labels?pat.type:''});
    }
  }
  function drawLineObject(line,color,title,addTrend){
    if(!line?.start||!line?.end)return false;
    const a={time:Number(line.start.time),value:Number(line.start.price)},b={time:Number(line.end.time),value:Number(line.end.price)};
    if(!(a.time>0&&a.value>0&&b.time>0&&b.value>0))return false;
    return addTrend([a,b],{color,lineWidth:2,title});
  }
  function channelEnabled(p,prefs){return prefs.channel===true||(prefs.channel==='auto'&&Number(p?.channel?.confidence)>=65&&['UP CHANNEL','DOWN CHANNEL','SIDEWAYS RANGE'].includes(String(p?.channel?.type)));}
  function familyEnabled(family,prefs){return family==='double'?prefs.double:family==='triangles'?prefs.triangles:family==='head-shoulders'?prefs.headShoulders:family==='wedges'?prefs.wedges:false;}

  function loadPrefs(){try{return{...DEFAULTS,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')};}catch{return{...DEFAULTS};}}
  function selectedSymbol(){return String(document.getElementById('tickerBadge')?.textContent||document.getElementById('symbolInput')?.value||'').trim().toUpperCase();}
  function levelText(level,direction){if(!level?.price)return'—';const d=Number(level.distancePct),dist=Number.isFinite(d)?`${Math.abs(d)*100<.1?'<0.1':(Math.abs(d)*100).toFixed(1)}% ${direction}`:'';return `$${Number(level.price).toFixed(2)}${dist?` · ${dist}`:''}`;}
  function tone(bias,breakoutDirection){if(String(bias)==='BULLISH'||String(breakoutDirection)==='UP')return'good';if(String(bias)==='BEARISH'||String(breakoutDirection)==='DOWN')return'bad';return'warn';}
  function set(root,selector,value){const el=root?.querySelector(selector);if(el)el.textContent=String(value??'—');}
  function setStatus(message,tone='ok',html=false){ensureUi();if(!statusNode)return;statusNode.className=`sf-pattern-overlay-stable ${tone}`;if(html)statusNode.innerHTML=message;else statusNode.textContent=message;}

  function injectStyles(){
    if(document.getElementById('sfPatternOverlayStableStyles'))return;
    const style=document.createElement('style');style.id='sfPatternOverlayStableStyles';style.textContent=`
      #sfPatternContextCard .sf-pattern-btn[data-overlay-state="on"]{border-color:rgba(126,188,255,.68)!important;background:rgba(126,188,255,.14)!important;color:#f3f7fb!important;opacity:1!important}
      #sfPatternContextCard .sf-pattern-btn[data-overlay-state="off"]{opacity:.65!important}
      #sfPatternContextCard .sf-pattern-btn[data-overlay-state="auto"]{border-color:rgba(242,210,92,.48)!important;background:rgba(242,210,92,.08)!important;color:#e4d287!important;opacity:1!important}
      .sf-pattern-overlay-stable{margin-top:6px;padding:6px 8px;border:1px solid rgba(47,209,139,.22);border-radius:7px;background:rgba(47,209,139,.035);color:#8fa4bd;font-size:7.5px;line-height:1.4}.sf-pattern-overlay-stable strong{color:#f3f7fb}.sf-pattern-overlay-stable.warn{border-color:rgba(244,163,64,.28);background:rgba(244,163,64,.045);color:#d5aa72}
    `;document.head.appendChild(style);
  }
})();
