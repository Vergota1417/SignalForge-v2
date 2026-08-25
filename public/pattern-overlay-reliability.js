(() => {
  'use strict';

  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  const PREF_KEY='signalforge_pattern_overlay_v1';
  const DEFAULTS={support:true,resistance:true,channel:'auto',breakout:true,double:false,triangles:false,headShoulders:false,wedges:false,labels:true};
  let patternContext=null,currentSymbol='',retryCount=0,observer=null,statusNode=null,refreshTimer=null;

  injectStyles();
  boot();

  function boot(){
    ensureUi();
    refreshContext('boot');
    document.addEventListener('click',event=>{
      const button=event.target?.closest?.('#sfPatternContextCard .sf-pattern-btn');
      if(!button)return;
      setTimeout(()=>{syncLabels();applyOverlays(`click:${button.dataset.toggle||button.dataset.action||'control'}`);},0);
    });
    window.addEventListener('signalforge:pattern-chart-ready',()=>setTimeout(()=>applyOverlays('chart-ready'),80));
    window.addEventListener('signalforge:market-data',()=>setTimeout(()=>applyOverlays('market-data'),100));
    const ticker=document.getElementById('tickerBadge');
    if(ticker)new MutationObserver(()=>{patternContext=null;setTimeout(()=>refreshContext('symbol-change'),150);}).observe(ticker,{childList:true,subtree:true,characterData:true});
    observer=new MutationObserver(()=>scheduleUiSync());observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    refreshTimer=setInterval(()=>{if(document.visibilityState!=='hidden')refreshContext('timer');},60_000);
  }

  function scheduleUiSync(){
    clearTimeout(scheduleUiSync.timer);scheduleUiSync.timer=setTimeout(()=>{ensureUi();syncLabels();},30);
  }

  function ensureUi(){
    const card=document.getElementById('sfPatternContextCard');if(!card)return;
    const controls=card.querySelector('.sf-pattern-controls');if(!controls)return;
    if(!statusNode||!statusNode.isConnected){
      statusNode=document.createElement('div');statusNode.id='sfPatternOverlayStatus';statusNode.className='sf-pattern-overlay-reliability';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');statusNode.textContent='Connecting structure overlays to the chart…';controls.insertAdjacentElement('afterend',statusNode);
    }
    syncLabels();
  }

  function syncLabels(){
    const card=document.getElementById('sfPatternContextCard');if(!card)return;
    const prefs=loadPrefs(),map={support:'Support',resistance:'Resistance',breakout:'Breakouts',double:'Double',triangles:'Triangles',headShoulders:'H&S',wedges:'Wedges',labels:'Labels'};
    for(const [key,label] of Object.entries(map)){
      const button=card.querySelector(`[data-toggle="${key}"]`);if(!button)continue;
      const on=Boolean(prefs[key]),text=`${label} ${on?'ON':'OFF'}`;if(button.textContent!==text)button.textContent=text;
      button.dataset.overlayState=on?'on':'off';button.setAttribute('aria-pressed',on?'true':'false');
    }
    const channel=card.querySelector('[data-toggle="channel"]');
    if(channel){const mode=prefs.channel==='auto'?'AUTO':prefs.channel===true?'ON':'OFF',text=`Channel ${mode}`;if(channel.textContent!==text)channel.textContent=text;channel.dataset.overlayState=mode.toLowerCase();channel.setAttribute('aria-pressed',prefs.channel===true?'true':'false');}
  }

  async function refreshContext(source){
    ensureUi();const symbol=selectedSymbol();if(!symbol)return;currentSymbol=symbol;
    try{
      const response=await fetch(`${API}/api/signals`,{headers:{accept:'application/json'},cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);if(currentSymbol!==symbol)return;
      const row=(body.signals||[]).find(item=>String(item.symbol||'').toUpperCase()===symbol);patternContext=row?.analysis?.patternContext||null;
      syncLabels();applyOverlays(source);
    }catch(error){setStatus(`Overlay data unavailable: ${String(error?.message||'request failed')}`,'error');}
  }

  function applyOverlays(source='manual'){
    ensureUi();syncLabels();
    const bridge=window.SignalForgeChartBridge,p=patternContext,prefs=loadPrefs();
    if(!p){setStatus('Waiting for saved structure data for this ticker.','warn');return 0;}
    if(!bridge?.ready||!bridge.candleSeries){
      setStatus('Chart is visible, but the structure overlay bridge is not attached yet. Retrying…','error');
      if(retryCount<5){retryCount++;setTimeout(()=>applyOverlays('retry'),100+retryCount*120);}return 0;
    }
    retryCount=0;bridge.clearOverlays?.();let requested=0,drawn=0;
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
    const channelNote=prefs.channel==='auto'&&!channelDrawn?` · Channel AUTO skipped: ${String(p.channel?.type||'no clear channel')} ${Math.round(Number(p.channel?.confidence)||0)}/100`:'';
    const overlapNote=prefs.support&&prefs.breakout&&Number(p.support?.price)>0&&Math.abs(Number(p.support.price)-Number(p.breakout?.level))<0.005?' · Breakout test overlaps Support at the same price':'';
    const failed=requested>drawn?` · ${requested-drawn} requested overlay${requested-drawn===1?'':'s'} failed`:'';
    const off=requested===0?' · all overlay families are OFF':'';
    setStatus(`<strong>${drawn} overlay${drawn===1?'':'s'} drawn</strong> · ${Number(state.priceLines)||0} level lines · ${Number(state.trendLines)||0} trend lines${channelNote}${overlapNote}${failed}${off}`,state.lastError||requested>drawn?'warn':'ok',true);
    window.dispatchEvent(new CustomEvent('signalforge:pattern-overlays-reliable',{detail:{source,symbol:selectedSymbol(),requested,drawn,state}}));
    return drawn;
  }

  function drawPattern(pat,labels,addPrice,addTrend){
    const color=pat.bias==='BULLISH'?'#2fd18b':pat.bias==='BEARISH'?'#ef6262':'#f4a340';
    for(const line of pat.lines||[]){
      if(line?.kind==='horizontal'&&Number(line.price)>0)addPrice(line.price,{color,lineWidth:2,title:labels?(line.label||pat.type):''});
      else drawLineObject(line,color,labels?pat.type:'',addTrend);
    }
    if((pat.family==='double'||pat.family==='head-shoulders')&&Array.isArray(pat.anchors)&&pat.anchors.length>=2){
      const points=pat.anchors.filter(a=>Number(a?.time)>0&&Number(a?.price)>0).map(a=>({time:Number(a.time),value:Number(a.price)}));if(points.length>=2)addTrend(points,{color,lineWidth:2,title:labels?pat.type:''});
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

  function setStatus(message,tone='ok',html=false){
    ensureUi();if(!statusNode)return;statusNode.className=`sf-pattern-overlay-reliability ${tone}`;if(html)statusNode.innerHTML=message;else statusNode.textContent=message;
  }

  function injectStyles(){
    if(document.getElementById('sfPatternOverlayReliabilityStyles'))return;
    const style=document.createElement('style');style.id='sfPatternOverlayReliabilityStyles';style.textContent=`
      #sfPatternContextCard .sf-pattern-btn[data-overlay-state="on"]{border-color:rgba(126,188,255,.68);background:rgba(126,188,255,.14);color:#f3f7fb}
      #sfPatternContextCard .sf-pattern-btn[data-overlay-state="off"]{opacity:.72}
      #sfPatternContextCard .sf-pattern-btn[data-overlay-state="auto"]{border-color:rgba(242,210,92,.42);background:rgba(242,210,92,.07);color:#e4d287}
      .sf-pattern-overlay-reliability{margin-top:6px;padding:6px 8px;border:1px solid rgba(47,209,139,.22);border-radius:7px;background:rgba(47,209,139,.035);color:#8fa4bd;font-size:7.5px;line-height:1.4}.sf-pattern-overlay-reliability strong{color:#f3f7fb}.sf-pattern-overlay-reliability.warn{border-color:rgba(244,163,64,.28);background:rgba(244,163,64,.045);color:#d5aa72}.sf-pattern-overlay-reliability.error{border-color:rgba(239,98,98,.28);background:rgba(239,98,98,.045);color:#e49a9a}
    `;document.head.appendChild(style);
  }
})();
