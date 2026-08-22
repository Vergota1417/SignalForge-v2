(() => {
  'use strict';

  const LW=window.LightweightCharts;
  if(!LW?.createChart){
    console.warn('[SignalForge chart] Lightweight Charts unavailable; keeping Canvas fallback.');
    return;
  }

  const style=document.createElement('style');
  style.textContent=`
    .sf-financial-chart{width:100%;height:360px;min-height:360px;border-radius:10px;overflow:hidden;background:#08111f;touch-action:none}
    .sf-chart-attribution{display:flex;justify-content:flex-end;margin-top:.35rem;font-size:.62rem;color:#72869f}
    .sf-chart-attribution a{color:#8fa4bd;text-decoration:none}.sf-chart-attribution a:hover{text-decoration:underline}
    .chart-card.sf-lightweight-active #priceChart{display:none}
    .chart-card.sf-lightweight-active .sf-volume-wrap{display:none}
    @media(max-width:760px){.sf-financial-chart{height:340px;min-height:340px}}
  `;
  document.head.appendChild(style);

  let chart=null,candleSeries=null,volumeSeries=null,container=null,resizeObserver=null,currentKey='',currentPayload=null,levelLines=[];
  const fmtPrice=v=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  function ensureChart(){
    if(chart)return true;
    const canvas=document.getElementById('priceChart'),wrap=canvas?.closest('.canvas-wrap'),card=canvas?.closest('.chart-card');
    if(!canvas||!wrap||!card)return false;
    container=document.createElement('div');container.id='sfFinancialChart';container.className='sf-financial-chart';container.setAttribute('aria-label','Interactive financial candlestick and volume chart');wrap.appendChild(container);
    const attribution=document.createElement('div');attribution.className='sf-chart-attribution';attribution.innerHTML='<a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charts powered by TradingView Lightweight Charts™</a>';wrap.insertAdjacentElement('afterend',attribution);

    chart=LW.createChart(container,{
      autoSize:true,
      layout:{background:{type:LW.ColorType?.Solid||'solid',color:'#08111f'},textColor:'#8fa4bd',attributionLogo:false},
      grid:{vertLines:{color:'rgba(119,144,173,.10)'},horzLines:{color:'rgba(119,144,173,.14)'}},
      rightPriceScale:{borderColor:'#1b2d43',scaleMargins:{top:.08,bottom:.25}},
      timeScale:{borderColor:'#1b2d43',timeVisible:true,secondsVisible:false,rightOffset:3,barSpacing:8,minBarSpacing:2},
      crosshair:{mode:LW.CrosshairMode?.Normal??0},
      handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
      handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}
    });
    candleSeries=chart.addSeries(LW.CandlestickSeries,{upColor:'#2fd18b',downColor:'#ef6262',borderUpColor:'#2fd18b',borderDownColor:'#ef6262',wickUpColor:'#2fd18b',wickDownColor:'#ef6262',priceLineVisible:true,lastValueVisible:true});
    volumeSeries=chart.addSeries(LW.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});
    chart.priceScale('volume').applyOptions({scaleMargins:{top:.78,bottom:0},borderVisible:false});
    card.classList.add('sf-lightweight-active');
    resizeObserver=new ResizeObserver(()=>{if(container&&chart)chart.resize(container.clientWidth,container.clientHeight);});resizeObserver.observe(container);
    return true;
  }

  function render(payload){
    if(!payload?.candles?.length||!ensureChart())return;
    const symbol=String(payload.symbol||'').toUpperCase(),timeframe=String(payload.timeframe||'').toUpperCase(),key=`${symbol}:${timeframe}`;
    const candles=payload.candles.map(c=>({time:Math.floor(Number(c.time)/1000),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})).filter(validBar);
    if(!candles.length)return;
    const volumes=payload.candles.map(c=>({time:Math.floor(Number(c.time)/1000),value:Math.max(0,Number(c.volume)||0),color:Number(c.close)>=Number(c.open)?'rgba(47,209,139,.55)':'rgba(239,98,98,.55)'})).filter(v=>Number.isFinite(v.time)&&v.time>0);
    candleSeries.setData(candles);volumeSeries.setData(volumes);currentPayload=payload;
    renderLevels(payload.analysis);
    if(currentKey!==key){chart.timeScale().fitContent();currentKey=key;}
  }

  function renderLevels(analysis){
    for(const line of levelLines){try{candleSeries.removePriceLine(line);}catch{}}
    levelLines=[];if(!analysis)return;
    addLevel(analysis.thesisBreak,'#ef6262','Thesis break');
    addLevel(analysis.overextension,'#f4a340','Overextension');
    addLevel(analysis.preferredEntryLow,'#2fd18b','Entry low');
    addLevel(analysis.preferredEntryHigh,'#2fd18b','Entry high');
    const target=Number(analysis.structure?.target??analysis.targetPrice??analysis.target);
    if(Number.isFinite(target)&&target>0)addLevel(target,'#7ebcff','Target');
  }

  function addLevel(value,color,title){
    const price=Number(value);if(!(price>0))return;
    const line=candleSeries.createPriceLine({price,color,lineWidth:1,lineStyle:LW.LineStyle?.Dashed??2,axisLabelVisible:true,title});levelLines.push(line);
  }

  function validBar(b){return Number.isFinite(b.time)&&b.time>0&&b.open>0&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high)&&b.close>0;}
  function currentRequest(){const symbol=String(document.getElementById('tickerBadge')?.textContent||'XOM').trim().toUpperCase(),timeframe=String(document.querySelector('.timeframe-btn.active')?.textContent||'6M').trim().toUpperCase();return{symbol,timeframe};}
  function isMarketRequest(requestUrl){try{const u=new URL(requestUrl,window.location.origin);return u.origin===window.location.origin&&u.pathname==='/api/market-data';}catch{return false;}}

  const priorFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{
    const response=await priorFetch(...args);
    try{
      const requestUrl=typeof args[0]==='string'?args[0]:args[0]?.url;
      if(isMarketRequest(requestUrl)&&response.ok){const clone=response.clone();clone.json().then(payload=>setTimeout(()=>render(payload),0)).catch(()=>{});}
    }catch{}
    return response;
  };

  async function hydrateCurrent(){
    const {symbol,timeframe}=currentRequest();
    try{
      const response=await priorFetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,{headers:{accept:'application/json'}});
      if(!response.ok)return;render(await response.json());
    }catch(error){console.warn('[SignalForge chart] Lightweight hydration failed; Canvas fallback remains available.',error);}
  }

  window.addEventListener('signalforge:market-data',()=>{if(currentPayload)render(currentPayload);});
  document.addEventListener('click',event=>{if(event.target.closest('.timeframe-btn,.watch-item,.recent-item,.symbol-suggestion,#loadSymbolBtn,.radar-item,.alert-history-row'))setTimeout(hydrateCurrent,220);});
  window.addEventListener('load',()=>setTimeout(hydrateCurrent,0));
  if(document.readyState==='complete')setTimeout(hydrateCurrent,0);
})();
