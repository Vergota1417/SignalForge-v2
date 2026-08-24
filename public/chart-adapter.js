(() => {
  'use strict';

  const LW=window.LightweightCharts;
  if(!LW?.createChart){console.warn('[SignalForge chart] Lightweight Charts unavailable; keeping Canvas fallback.');return;}

  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const TOKEN_KEY='signalforge_push_test_token_v1';
  const HARD_PRICE_MISMATCH_PCT=.25;
  const LOD_RULES={
    '2Y':{next:'1Y',maxSpan:400*86400},
    '1Y':{next:'1M',maxSpan:45*86400},
    '6M':{next:'1M',maxSpan:45*86400},
    '3M':{next:'1M',maxSpan:45*86400},
    '1M':{next:'5D',maxSpan:7*86400},
    '5D':{next:'1D',maxSpan:36*3600}
  };
  const style=document.createElement('style');
  style.textContent=`
    .sf-financial-chart{width:100%;height:360px;min-height:360px;border-radius:10px;overflow:hidden;background:#08111f;touch-action:none}
    .sf-chart-toolbar{display:flex;justify-content:space-between;gap:.65rem;align-items:center;flex-wrap:wrap;margin:.55rem 0 .3rem}
    .sf-chart-readout{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;min-height:28px;color:#8fa4bd;font-size:.72rem}
    .sf-chart-readout strong{color:#e8eef6}.sf-chart-readout .up{color:#2fd18b}.sf-chart-readout .down{color:#ef6262}.sf-chart-readout .warning{color:#f4a340;font-weight:800}
    .sf-chart-actions{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}.sf-chart-btn{border:1px solid #1b2d43;background:#0e1b2d;color:#c9d7e8;border-radius:8px;padding:.38rem .55rem;font-size:.7rem;cursor:pointer}.sf-chart-btn:active{transform:translateY(1px)}
    .sf-marker-note,.sf-lod-status{display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;margin:.15rem 0 .4rem;color:#72869f;font-size:.65rem}.sf-marker-dot{width:7px;height:7px;border-radius:50%;display:inline-block}.sf-marker-dot.hist{background:#7ebcff}.sf-marker-dot.private{background:#a887ff}.sf-lod-status strong{color:#9eb3ca}.sf-lod-status button{margin-left:auto}
    .sf-chart-attribution{display:flex;justify-content:flex-end;margin-top:.35rem;font-size:.62rem;color:#72869f}.sf-chart-attribution a{color:#8fa4bd;text-decoration:none}.sf-chart-attribution a:hover{text-decoration:underline}
    .chart-card.sf-lightweight-active #priceChart{display:none}.chart-card.sf-lightweight-active .sf-volume-wrap{display:none}
    @media(max-width:760px){.sf-financial-chart{height:340px;min-height:340px}.sf-chart-toolbar{align-items:flex-start}.sf-chart-readout{width:100%;font-size:.68rem}.sf-chart-actions{width:100%;justify-content:flex-end}.sf-chart-btn{padding:.45rem .62rem}.sf-lod-status button{margin-left:0}}
  `;document.head.appendChild(style);

  let chart=null,candleSeries=null,volumeSeries=null,container=null,resizeObserver=null,currentKey='',currentPayload=null,basePayload=null,levelLines=[],readout=null,markerApi=null,markersEnabled=true,currentBars=[],markerStatus=null,markerRefreshKey='',lodStatus=null,lodLoadBtn=null,lodBaseBtn=null,lodTimer=null,lodPending=null,lodProbeKey='',lodActive=false,lodSuppress=false;
  const fmtPrice=v=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtVolume=v=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(Number(v)||0);

  function ensureChart(){
    if(chart)return true;
    const canvas=document.getElementById('priceChart'),wrap=canvas?.closest('.canvas-wrap'),card=canvas?.closest('.chart-card');if(!canvas||!wrap||!card)return false;
    const toolbar=document.createElement('div');toolbar.className='sf-chart-toolbar';toolbar.innerHTML=`<div id="sfChartReadout" class="sf-chart-readout" aria-live="polite">Move across the chart to inspect OHLCV.</div><div class="sf-chart-actions"><button type="button" id="sfChartBase" class="sf-chart-btn" hidden>Base view</button><button type="button" id="sfChartMarkers" class="sf-chart-btn">Markers on</button><button type="button" id="sfChartLatest" class="sf-chart-btn">Latest</button><button type="button" id="sfChartReset" class="sf-chart-btn">Reset view</button></div>`;wrap.appendChild(toolbar);readout=toolbar.querySelector('#sfChartReadout');lodBaseBtn=toolbar.querySelector('#sfChartBase');
    markerStatus=document.createElement('div');markerStatus.className='sf-marker-note';markerStatus.innerHTML='<span class="sf-marker-dot hist"></span><span>Saved transitions</span><span class="sf-marker-dot private"></span><span>Recorded purchase/current private state when phone authorization is available</span>';wrap.appendChild(markerStatus);
    lodStatus=document.createElement('div');lodStatus.className='sf-lod-status';lodStatus.innerHTML='<span data-lod-copy>Zoom in for cache-first finer detail. Zooming never spends a provider request.</span><button type="button" class="sf-chart-btn" data-lod-load hidden>Load finer detail</button>';wrap.appendChild(lodStatus);lodLoadBtn=lodStatus.querySelector('[data-lod-load]');lodLoadBtn.addEventListener('click',loadPendingDetail);
    container=document.createElement('div');container.id='sfFinancialChart';container.className='sf-financial-chart';container.setAttribute('aria-label','Interactive financial candlestick and volume chart');wrap.appendChild(container);
    const attribution=document.createElement('div');attribution.className='sf-chart-attribution';attribution.innerHTML='<a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charts powered by TradingView Lightweight Charts™</a>';wrap.insertAdjacentElement('afterend',attribution);

    chart=LW.createChart(container,{autoSize:true,layout:{background:{type:LW.ColorType?.Solid||'solid',color:'#08111f'},textColor:'#8fa4bd',attributionLogo:false},grid:{vertLines:{color:'rgba(119,144,173,.10)'},horzLines:{color:'rgba(119,144,173,.14)'},},rightPriceScale:{borderColor:'#1b2d43',scaleMargins:{top:.08,bottom:.25}},timeScale:{borderColor:'#1b2d43',timeVisible:true,secondsVisible:false,rightOffset:3,barSpacing:8,minBarSpacing:2,fixLeftEdge:false,fixRightEdge:false},crosshair:{mode:LW.CrosshairMode?.Normal??0,vertLine:{labelVisible:true},horzLine:{labelVisible:true}},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}});
    candleSeries=chart.addSeries(LW.CandlestickSeries,{upColor:'#2fd18b',downColor:'#ef6262',borderUpColor:'#2fd18b',borderDownColor:'#ef6262',wickUpColor:'#2fd18b',wickDownColor:'#ef6262',priceLineVisible:true,lastValueVisible:true});
    volumeSeries=chart.addSeries(LW.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});chart.priceScale('volume').applyOptions({scaleMargins:{top:.78,bottom:0},borderVisible:false});
    if(typeof LW.createSeriesMarkers==='function'){try{markerApi=LW.createSeriesMarkers(candleSeries,[]);}catch(error){console.warn('[SignalForge chart] Series markers unavailable.',error);}}
    chart.subscribeCrosshairMove(onCrosshairMove);chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange);
    toolbar.querySelector('#sfChartReset').addEventListener('click',()=>{if(lodActive)return restoreBaseView();chart.timeScale().fitContent();});toolbar.querySelector('#sfChartLatest').addEventListener('click',()=>chart.timeScale().scrollToRealTime());lodBaseBtn.addEventListener('click',restoreBaseView);toolbar.querySelector('#sfChartMarkers').addEventListener('click',event=>{markersEnabled=!markersEnabled;event.currentTarget.textContent=markersEnabled?'Markers on':'Markers off';applyMarkers(markersEnabled?window.__sfDecisionMarkers||[]:[]);});
    card.classList.add('sf-lightweight-active');resizeObserver=new ResizeObserver(()=>{if(container&&chart)chart.resize(container.clientWidth,container.clientHeight);});resizeObserver.observe(container);return true;
  }

  function render(payload,options={}){
    if(!payload?.candles?.length||!ensureChart())return;
    const symbol=String(payload.symbol||'').toUpperCase(),timeframe=String(payload.timeframe||'').toUpperCase(),key=`${symbol}:${timeframe}`;
    const candles=payload.candles.map(c=>({time:Math.floor(Number(c.time)/1000),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})).filter(validBar);if(!candles.length)return;
    const volumes=payload.candles.map(c=>({time:Math.floor(Number(c.time)/1000),value:Math.max(0,Number(c.volume)||0),color:Number(c.close)>=Number(c.open)?'rgba(47,209,139,.55)':'rgba(239,98,98,.55)'})).filter(v=>Number.isFinite(v.time)&&v.time>0);
    lodSuppress=true;currentBars=candles;candleSeries.setData(candles);volumeSeries.setData(volumes);currentPayload=payload;if(payload.analysis)renderLevels(payload.analysis);renderLatestReadout();
    if(options.lod){lodActive=true;lodBaseBtn.hidden=false;setLodCopy(`<strong>${timeframe} detail</strong> · loaded ${payload.cacheOnly?'from D1 cache with no provider request':'on demand'}.`);}
    else{basePayload=payload;lodActive=false;lodBaseBtn.hidden=true;lodPending=null;lodProbeKey='';hideLodLoad();if(currentKey!==key){chart.timeScale().fitContent();currentKey=key;markerRefreshKey='';}}
    if(options.visibleRange){try{chart.timeScale().setVisibleRange(options.visibleRange);}catch{chart.timeScale().fitContent();}}
    if(markerRefreshKey!==key){markerRefreshKey=key;refreshDecisionMarkers(symbol).catch(error=>console.warn('[SignalForge chart] Decision markers unavailable.',error));}
    setTimeout(()=>{lodSuppress=false;},0);
  }

  function onCrosshairMove(param){if(!readout||!currentPayload?.candles?.length)return;if(!param?.time){renderLatestReadout();return;}const candle=param.seriesData?.get?.(candleSeries),volume=param.seriesData?.get?.(volumeSeries);if(!candle){renderLatestReadout();return;}renderReadout({time:param.time,open:candle.open,high:candle.high,low:candle.low,close:candle.close,volume:volume?.value});}
  function renderLatestReadout(){const c=currentPayload?.candles?.at?.(-1);if(!c||!readout)return;renderReadout({time:Math.floor(Number(c.time)/1000),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:Number(c.volume)||0});}
  function renderReadout(c){const move=Number(c.open)?((Number(c.close)/Number(c.open))-1)*100:0,cls=move>0?'up':move<0?'down':'',when=formatChartTime(c.time);readout.innerHTML=`<strong>${when}</strong><span>O ${fmtPrice(c.open)}</span><span>H ${fmtPrice(c.high)}</span><span>L ${fmtPrice(c.low)}</span><span>C ${fmtPrice(c.close)}</span><span>V ${fmtVolume(c.volume)}</span><span class="${cls}">${move>=0?'+':''}${move.toFixed(2)}%</span>`;}

  function onVisibleRangeChange(range){
    if(lodSuppress||!range||!currentPayload)return;clearTimeout(lodTimer);lodTimer=setTimeout(()=>probeFinerDetail(range),650);
  }
  async function probeFinerDetail(range){
    const timeframe=String(currentPayload?.timeframe||''),rule=LOD_RULES[timeframe];if(!rule){hideLodLoad();return;}
    const from=rangeSeconds(range.from),to=rangeSeconds(range.to),span=to-from;if(!(from>0&&to>from)||span>rule.maxSpan){hideLodLoad();return;}
    const symbol=String(currentPayload.symbol||'').toUpperCase(),bucket=`${symbol}:${timeframe}:${rule.next}:${Math.round(from/3600)}:${Math.round(to/3600)}`;if(bucket===lodProbeKey)return;lodProbeKey=bucket;lodPending=null;hideLodLoad();setLodCopy(`Checking D1 cache for ${rule.next} detail… no provider request.`);
    try{
      const response=await priorFetch(`${API}/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(rule.next)}&cacheOnly=1`,{headers:{accept:'application/json'}});
      if(response.ok){const payload=await response.json();if(coversRange(payload.candles,range)){render(payload,{lod:true,visibleRange:range});return;}setLodCopy(`${rule.next} cache exists, but it does not cover this older zoom window. No provider request was used.`);return;}
      if(response.status===404){lodPending={symbol,timeframe:rule.next,range};setLodCopy(`${rule.next} detail is not cached. Zooming used 0 provider requests.`);showLodLoad(`Load ${rule.next} detail`);return;}
      setLodCopy('Finer-detail cache check unavailable. No provider request was used.');
    }catch{setLodCopy('Finer-detail cache check unavailable. No provider request was used.');}
  }
  async function loadPendingDetail(){
    const pending=lodPending;if(!pending)return;hideLodLoad();lodLoadBtn.disabled=true;setLodCopy(`Loading ${pending.timeframe} detail on demand… this may use a market-data request if cache is stale or missing.`);
    try{
      const response=await priorFetch(`${API}/api/market-data?symbol=${encodeURIComponent(pending.symbol)}&timeframe=${encodeURIComponent(pending.timeframe)}`,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json();
      if(coversRange(payload.candles,pending.range)){render(payload,{lod:true,visibleRange:pending.range});lodPending=null;return;}
      setLodCopy(`${pending.timeframe} loaded, but its current history does not cover this older zoom window.`);
    }catch(error){setLodCopy(`Could not load finer detail: ${String(error?.message||'request failed')}.`);}finally{lodLoadBtn.disabled=false;}
  }
  function restoreBaseView(){if(!basePayload)return;render(basePayload);chart.timeScale().fitContent();setLodCopy('Base timeframe restored. Zoom in for cache-first finer detail.');}
  function coversRange(candles,range){if(!Array.isArray(candles)||!candles.length)return false;const first=Math.floor(Number(candles[0].time)/1000),last=Math.floor(Number(candles.at(-1).time)/1000),from=rangeSeconds(range.from),to=rangeSeconds(range.to),tolerance=Math.max(3600,(to-from)*.08);return first<=from+tolerance&&last>=to-tolerance;}
  function rangeSeconds(value){if(typeof value==='number')return value;if(value&&typeof value==='object'&&Number.isFinite(Number(value.year))){return Date.UTC(Number(value.year),Number(value.month)-1,Number(value.day))/1000;}const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed/1000:0;}
  function setLodCopy(html){const node=lodStatus?.querySelector('[data-lod-copy]');if(node)node.innerHTML=html;}
  function showLodLoad(label){if(!lodLoadBtn)return;lodLoadBtn.textContent=label;lodLoadBtn.hidden=false;}
  function hideLodLoad(){if(lodLoadBtn)lodLoadBtn.hidden=true;}

  async function refreshDecisionMarkers(symbol){
    const historical=await fetchPublicHistory(symbol),privateRows=await fetchPrivateMarkers(symbol),rows=[...historical,...privateRows].filter(Boolean).sort((a,b)=>a.at-b.at),markers=[];
    for(const row of rows){const time=snapToLoadedBar(row.at);if(!time)continue;markers.push({time,position:row.position||'aboveBar',color:row.color||'#7ebcff',shape:row.shape||'circle',text:row.text});}
    window.__sfDecisionMarkers=dedupeMarkers(markers).slice(-30);applyMarkers(markersEnabled?window.__sfDecisionMarkers:[]);if(markerStatus)markerStatus.dataset.count=String(window.__sfDecisionMarkers.length);
  }
  async function fetchPublicHistory(symbol){const response=await priorFetch(`${API}/api/alerts?limit=50`,{headers:{accept:'application/json'}});if(!response.ok)return[];const body=await response.json(),rows=(body.alerts||[]).filter(r=>String(r.symbol).toUpperCase()===symbol);return rows.map(alertMarker).filter(Boolean);}
  function alertMarker(row){const status=String(row.status||''),at=Number(row.createdAt)||0;if(!at)return null;if(status==='BUY NOW')return{at,text:'BUY',color:'#2fd18b',shape:'arrowUp',position:'belowBar'};if(status==='SETUP — READY SOON')return{at,text:'READY',color:'#7ebcff',shape:'circle',position:'belowBar'};if(status==='WAIT FOR PULLBACK')return{at,text:'PULLBACK',color:'#f4a340',shape:'circle',position:'aboveBar'};if(status==='SELL / EXIT')return{at,text:'SELL',color:'#ef6262',shape:'arrowDown',position:'aboveBar'};if(status==='AVOID')return{at,text:'AVOID',color:'#ef6262',shape:'circle',position:'aboveBar'};return null;}
  async function fetchPrivateMarkers(symbol){
    try{const headers=await privateAuthHeaders(),[pRes,sRes]=await Promise.all([priorFetch(`${API}/api/portfolio`,{headers:{accept:'application/json',...headers}}),priorFetch(`${API}/api/strategy`,{headers:{accept:'application/json',...headers}})]);if(!pRes.ok||!sRes.ok)return[];const portfolio=await pRes.json(),strategy=await sRes.json(),out=[],position=(portfolio.positions||[]).find(r=>String(r.symbol).toUpperCase()===symbol),candidate=(strategy.ranked||[]).find(r=>String(r.symbol).toUpperCase()===symbol);if(position?.boughtAt)out.push({at:Number(position.boughtAt),text:'BOUGHT',color:'#a887ff',shape:'arrowUp',position:'belowBar'});if(candidate?.updatedAt&&(candidate.strategy?.state==='BUY WINDOW'||candidate.strategy?.state==='BUY CANDIDATE'))out.push({at:Number(candidate.updatedAt),text:candidate.strategy.state,color:'#2fd18b',shape:'arrowUp',position:'belowBar'});if(position?.strategy?.state&&currentPayload?.candles?.length){const latest=Number(currentPayload.candles.at(-1).time),state=String(position.strategy.state),style=portfolioStateStyle(state);out.push({at:latest,text:`CURRENT ${state}`,...style});}return out;}catch{return[];}
  }
  async function privateAuthHeaders(){const token=localStorage.getItem(TOKEN_KEY)||'';if(!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw new Error('Private chart history locked.');if(!('serviceWorker'in navigator))throw new Error('Private chart history locked.');const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager?.getSubscription();if(!sub?.endpoint)throw new Error('Private chart history locked.');return{'x-sf-endpoint':sub.endpoint,'x-sf-token':token};}
  function portfolioStateStyle(state){if(state==='PROTECT PROFIT')return{color:'#f4a340',shape:'circle',position:'aboveBar'};if(state==='SELL / EXIT')return{color:'#ef6262',shape:'arrowDown',position:'aboveBar'};if(state==='HOLD')return{color:'#a887ff',shape:'circle',position:'belowBar'};return{color:'#a887ff',shape:'circle',position:'aboveBar'};}
  function snapToLoadedBar(ms){if(!currentBars.length)return 0;const target=Math.floor(Number(ms)/1000);let best=currentBars[0].time,bestDistance=Math.abs(best-target);for(const bar of currentBars){const distance=Math.abs(bar.time-target);if(distance<bestDistance){best=bar.time;bestDistance=distance;}}return best;}
  function dedupeMarkers(markers){const seen=new Set();return markers.filter(m=>{const key=`${m.time}|${m.text}`;if(seen.has(key))return false;seen.add(key);return true;});}
  function applyMarkers(markers){if(!markerApi?.setMarkers)return;try{markerApi.setMarkers(markers);}catch(error){console.warn('[SignalForge chart] Marker render failed.',error);}}

  function renderLevels(analysis){for(const line of levelLines){try{candleSeries.removePriceLine(line);}catch{}}levelLines=[];if(!analysis)return;addLevel(analysis.thesisBreak,'#ef6262','Thesis break');addLevel(analysis.overextension,'#f4a340','Overextension');addLevel(analysis.preferredEntryLow,'#2fd18b','Entry low');addLevel(analysis.preferredEntryHigh,'#2fd18b','Entry high');const target=Number(analysis.structure?.target??analysis.targetPrice??analysis.target);if(Number.isFinite(target)&&target>0)addLevel(target,'#7ebcff','Target');}
  function addLevel(value,color,title){const price=Number(value);if(!(price>0))return;const line=candleSeries.createPriceLine({price,color,lineWidth:1,lineStyle:LW.LineStyle?.Dashed??2,axisLabelVisible:true,title});levelLines.push(line);}
  function formatChartTime(value){const ms=typeof value==='number'?value*1000:Date.parse(String(value));return Number.isFinite(ms)?new Date(ms).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):String(value||'—');}
  function validBar(b){return Number.isFinite(b.time)&&b.time>0&&b.open>0&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high)&&b.close>0;}
  function sanitizeSymbol(value){const s=String(value||'').trim().toUpperCase();return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
  function currentRequest(){const input=sanitizeSymbol(document.getElementById('symbolInput')?.value),badge=sanitizeSymbol(document.getElementById('tickerBadge')?.textContent),symbol=input||badge||'XOM',timeframe=String(document.querySelector('.timeframe-btn.active')?.textContent||'6M').trim().toUpperCase();return{symbol,timeframe};}
  function payloadKey(payload){return`${String(payload?.symbol||'').toUpperCase()}:${String(payload?.timeframe||'').toUpperCase()}`;}
  function payloadMatchesCurrentRequest(payload){const request=currentRequest();return payloadKey(payload)===`${request.symbol}:${request.timeframe}`;}
  function visibleDecisionPrice(symbol){const badge=sanitizeSymbol(document.getElementById('tickerBadge')?.textContent);if(badge!==symbol)return null;const raw=String(document.getElementById('priceValue')?.textContent||'').replace(/[^0-9.-]/g,''),price=Number(raw);return Number.isFinite(price)&&price>0?price:null;}
  function hardPriceMismatch(payload){const symbol=String(payload?.symbol||'').toUpperCase(),decision=visibleDecisionPrice(symbol),chartClose=Number(payload?.candles?.at?.(-1)?.close);return decision&&chartClose>0?Math.abs(chartClose/decision-1)>HARD_PRICE_MISMATCH_PCT:false;}
  function clearChart(message='Loading selected chart…'){if(!ensureChart())return;try{candleSeries.setData([]);volumeSeries.setData([]);}catch{}renderLevels(null);currentPayload=null;basePayload=null;currentBars=[];lodActive=false;lodPending=null;markerRefreshKey='';window.__sfDecisionMarkers=[];applyMarkers([]);if(lodBaseBtn)lodBaseBtn.hidden=true;if(readout)readout.innerHTML=`<span class="warning">${message}</span>`;}
  function renderIfCurrent(payload){if(!payloadMatchesCurrentRequest(payload))return false;if(hardPriceMismatch(payload)){const symbol=String(payload.symbol||'').toUpperCase();clearChart(`${symbol} chart blocked: chart and decision prices disagree. Refreshing is safer than showing stale candles.`);console.warn('[SignalForge chart] Hard chart/decision price mismatch blocked.',{symbol,chartClose:payload?.candles?.at?.(-1)?.close,decisionPrice:visibleDecisionPrice(symbol)});return false;}render(payload);return true;}
  function isMarketRequest(requestUrl){try{const u=new URL(requestUrl,window.location.origin);return u.origin===window.location.origin&&u.pathname==='/api/market-data'&&u.searchParams.get('cacheOnly')!=='1';}catch{return false;}}

  const priorFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{const response=await priorFetch(...args);try{const requestUrl=typeof args[0]==='string'?args[0]:args[0]?.url;if(isMarketRequest(requestUrl)&&response.ok){const clone=response.clone();clone.json().then(payload=>setTimeout(()=>renderIfCurrent(payload),0)).catch(()=>{});}}catch{}return response;};
  async function hydrateCurrent(){const requested=currentRequest(),requestedKey=`${requested.symbol}:${requested.timeframe}`;try{const response=await priorFetch(`${API}/api/market-data?symbol=${encodeURIComponent(requested.symbol)}&timeframe=${encodeURIComponent(requested.timeframe)}`,{headers:{accept:'application/json'}});if(!response.ok)return;const payload=await response.json();if(payloadKey(payload)!==requestedKey||!payloadMatchesCurrentRequest(payload))return;renderIfCurrent(payload);}catch(error){console.warn('[SignalForge chart] Lightweight hydration failed; Canvas fallback remains available.',error);}}
  function clearIfSelectionChanged(){if(!currentKey)return;const request=currentRequest(),wanted=`${request.symbol}:${request.timeframe}`;if(currentKey!==wanted)clearChart(`Loading ${request.symbol} ${request.timeframe} chart…`);}
  window.addEventListener('signalforge:market-data',event=>{const detail=event?.detail||{};if(basePayload&&!lodActive&&String(detail.symbol||'').toUpperCase()===currentRequest().symbol&&String(detail.timeframe||'').toUpperCase()===currentRequest().timeframe)renderIfCurrent(basePayload);});
  document.addEventListener('click',event=>{if(event.target.closest('.timeframe-btn,.watch-item,.recent-item,.symbol-suggestion,#loadSymbolBtn,.radar-item,.alert-history-row'))setTimeout(clearIfSelectionChanged,0);});
  window.addEventListener('load',()=>setTimeout(hydrateCurrent,0));if(document.readyState==='complete')setTimeout(hydrateCurrent,0);
})();