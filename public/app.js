(() => {
  'use strict';

  const CONFIG=window.SIGNALFORGE_CONFIG||{API_BASE_URL:window.location.origin};
  const TIMEFRAMES={
    '1D':{resolution:'5-minute candles · latest regular session'},'5D':{resolution:'15-minute candles · latest 5 regular sessions'},'1M':{resolution:'1-hour candles'},
    '3M':{resolution:'Daily candles'},'6M':{resolution:'Daily candles'},'1Y':{resolution:'Daily candles'},'2Y':{resolution:'Weekly candles'}
  };
  const WATCHLIST=['XOM','NVDA','MSFT','AAPL','AMZN','TSLA'];
  const RECENT_KEY='signalforge_recent_symbols_v1';
  const $=id=>document.getElementById(id);
  const canvas=$('priceChart');
  const ctx=canvas.getContext('2d');
  const state={symbol:'XOM',timeframe:'6M',candles:[],analysis:null,meta:null,watchAnalyses:{},watchUpdated:{},watchMeta:{},recent:loadRecent(),searchCache:new Map(),searchTimer:null,searchAbort:null};

  function apiBase(){return String(CONFIG.API_BASE_URL||window.location.origin).replace(/\/$/,'');}
  async function apiGet(path){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),CONFIG.REQUEST_TIMEOUT_MS||10000);
    try{
      const res=await fetch(`${apiBase()}${path}`,{signal:ctl.signal,headers:{accept:'application/json'}});
      const body=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(body.error||`HTTP ${res.status}`);
      return body;
    }finally{clearTimeout(timer);}
  }
  function sanitizeSymbol(value){const s=String(value||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';}
  function fmtMoney(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);}
  function fmtScanTime(v){return Number(v)?new Date(Number(v)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';}
  function statusClass(status){if(status==='BUY NOW')return'status-buy';if(status==='SETUP — READY SOON')return'status-setup';if(status==='WAIT FOR PULLBACK')return'status-pullback';if(status==='WAIT — SETUP NOT READY')return'status-wait';if(status==='AVOID')return'status-avoid';return'status-sell';}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}

  function loadRecent(){try{const rows=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(rows)?rows.slice(0,6):[];}catch{return[];}}
  function rememberSymbol(meta){
    if(!meta?.symbol)return;
    const clean={symbol:meta.symbol,name:meta.name||meta.symbol,exchange:meta.exchange||'',type:meta.type||''};
    state.recent=[clean,...state.recent.filter(x=>x.symbol!==clean.symbol)].slice(0,6);
    localStorage.setItem(RECENT_KEY,JSON.stringify(state.recent));
    renderRecent();
  }

  function ensureSearchUi(){
    const label=document.querySelector('.symbol-search');
    if(label&&!$('symbolSuggestions')){
      label.classList.add('symbol-search-wrap');
      const box=document.createElement('div');box.id='symbolSuggestions';box.className='symbol-suggestions';box.hidden=true;label.appendChild(box);
    }
    const sidebar=document.querySelector('.sidebar');
    if(sidebar&&!$('recentViewed')){
      const block=document.createElement('div');block.className='recent-block';block.innerHTML='<div class="eyebrow">Recently viewed</div><div id="recentViewed" class="recent-viewed"></div>';sidebar.appendChild(block);
    }
  }

  async function refreshSavedSignals(){
    try{
      const payload=await apiGet('/api/signals');
      for(const row of payload.signals||[]){
        if(row?.symbol&&row.analysis){state.watchAnalyses[row.symbol]=row.analysis;state.watchUpdated[row.symbol]=Number(row.updatedAt)||0;}
      }
    }catch(err){console.warn('Saved signal state unavailable',err);}
    renderWatchlist();
  }

  async function fetchMarket(symbol,timeframe){return apiGet(`/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);}

  async function searchSymbols(query){
    const key=String(query||'').trim().toUpperCase();
    if(state.searchCache.has(key))return state.searchCache.get(key);
    const payload=await apiGet(`/api/symbol-search?q=${encodeURIComponent(query)}`);
    const results=Array.isArray(payload.results)?payload.results:[];
    state.searchCache.set(key,results);
    return results;
  }

  function renderSearchResults(results){
    const box=$('symbolSuggestions');if(!box)return;
    if(!results.length){box.innerHTML='<div class="symbol-suggestion-empty">No matching U.S. stocks or ETFs found.</div>';box.hidden=false;return;}
    box.innerHTML=results.map((r,i)=>`<button type="button" class="symbol-suggestion" data-index="${i}"><span><strong>${escapeHtml(r.symbol)}</strong> ${escapeHtml(r.name)}</span><small>${escapeHtml([r.exchange,r.type].filter(Boolean).join(' · '))}</small></button>`).join('');
    box.hidden=false;
    box.querySelectorAll('.symbol-suggestion').forEach(btn=>btn.addEventListener('click',()=>{const r=results[Number(btn.dataset.index)];box.hidden=true;$('symbolInput').value=r.symbol;loadSymbol(r.symbol,r);}));
  }

  async function resolveAndLoad(raw){
    const typed=String(raw||'').trim();if(!typed)return;
    $('stockSubtitle').textContent='Finding stock…';
    try{
      const results=await searchSymbols(typed);
      const exactTicker=sanitizeSymbol(typed);
      const selected=(exactTicker&&results.find(r=>r.symbol===exactTicker))||results[0];
      if(!selected)throw new Error('No matching U.S. stock or ETF found.');
      $('symbolSuggestions').hidden=true;$('symbolInput').value=selected.symbol;
      await loadSymbol(selected.symbol,selected);
    }catch(err){showLoadError(err.message||'Stock search failed.');}
  }

  async function loadSymbol(symbol,meta=null){
    symbol=sanitizeSymbol(symbol);if(!symbol){showLoadError('Enter a valid ticker or choose a search result.');return;}
    state.symbol=symbol;state.meta=meta||state.recent.find(x=>x.symbol===symbol)||state.watchMeta[symbol]||null;$('symbolInput').value=symbol;
    $('stockSubtitle').textContent='Loading verified market data…';renderTimeframes();renderWatchlist();
    try{
      const chartPayload=await fetchMarket(symbol,state.timeframe);
      let decisionAnalysis=chartPayload.analysis;
      if(state.timeframe!=='6M'){
        const saved=state.watchAnalyses[symbol];
        if(saved)decisionAnalysis=saved;
        else decisionAnalysis=(await fetchMarket(symbol,'6M')).analysis;
      }else if(state.watchAnalyses[symbol]?.intradayConfirmation){
        decisionAnalysis=state.watchAnalyses[symbol];
      }
      if(!Array.isArray(chartPayload.candles)||!decisionAnalysis)throw new Error('SignalForge did not receive valid market data.');
      state.candles=chartPayload.candles.map(c=>({...c,time:Number(c.time)}));state.analysis=decisionAnalysis;
      if(state.meta)rememberSymbol(state.meta);else rememberSymbol({symbol,name:symbol});
      const info=state.meta?[state.meta.name,state.meta.type,state.meta.exchange].filter(Boolean).join(' · '):'Verified Twelve Data symbol';
      $('stockSubtitle').textContent=info;
      $('chartDataSource').textContent=`Data: ${chartPayload.source}${chartPayload.cached?' · cached':''}`;
      $('candleResolution').textContent=`Resolution: ${TIMEFRAMES[state.timeframe].resolution}`;
      renderAll();
    }catch(err){showLoadError(err.message||'Unable to load this stock.');}
  }

  function showLoadError(message){
    state.candles=[];state.analysis=null;
    $('stockSubtitle').textContent=message;$('priceValue').textContent='—';$('priceChange').textContent='—';
    $('statusBadge').textContent='DATA UNAVAILABLE';$('statusBadge').className='status-badge status-avoid';$('statusReason').textContent='SignalForge will not substitute demo candles for a failed live stock request.';
    $('chartDataSource').textContent='Data: unavailable';ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  function renderAll(){const a=state.analysis;if(!a)return;renderHero(a);renderReadiness(a);renderWhy(a);renderEngines(a);renderLevels(a);renderTriggers(a);renderWatchlist();resizeCanvas();}
  function renderTimeframes(){const root=$('timeframeTabs');root.innerHTML='';Object.keys(TIMEFRAMES).forEach(tf=>{const b=document.createElement('button');b.type='button';b.className=`timeframe-btn ${tf===state.timeframe?'active':''}`;b.textContent=tf;b.setAttribute('role','tab');b.setAttribute('aria-selected',tf===state.timeframe?'true':'false');b.addEventListener('click',()=>{state.timeframe=tf;loadSymbol(state.symbol,state.meta);});root.appendChild(b);});}
  function renderWatchlist(){
    const root=$('watchlist');root.innerHTML='';
    WATCHLIST.forEach(sym=>{
      const a=state.watchAnalyses[sym],updated=state.watchUpdated[sym];
      const btn=document.createElement('button');btn.type='button';btn.className=`watch-item ${sym===state.symbol?'active':''}`;
      const status=a?a.status.split(' — ')[0]:'Not yet analyzed';
      const scan=a&&updated?`<div class="watch-meta"><small>Last deep scan ${fmtScanTime(updated)}</small></div>`:'';
      btn.innerHTML=`<div><div class="watch-symbol">${sym}</div><div class="watch-meta"><span class="watch-status ${a?statusClass(a.status):''}">${status}</span></div>${scan}</div><div class="watch-price">${a?fmtMoney(a.latest.close):'—'}<div class="${a&&a.changePct>=0?'price-change positive':'price-change negative'}">${a?`${(a.changePct*100).toFixed(2)}%`:'—'}</div></div>`;
      btn.addEventListener('click',()=>loadSymbol(sym,state.watchMeta[sym]||state.recent.find(x=>x.symbol===sym)||null));root.appendChild(btn);
    });
  }
  function renderRecent(){const root=$('recentViewed');if(!root)return;if(!state.recent.length){root.innerHTML='<div class="muted recent-empty">Stocks you open will appear here.</div>';return;}root.innerHTML=state.recent.map(r=>`<button type="button" class="recent-item" data-symbol="${escapeHtml(r.symbol)}"><strong>${escapeHtml(r.symbol)}</strong><span>${escapeHtml(r.name||r.symbol)}</span></button>`).join('');root.querySelectorAll('.recent-item').forEach(btn=>btn.addEventListener('click',()=>{const meta=state.recent.find(r=>r.symbol===btn.dataset.symbol);loadSymbol(btn.dataset.symbol,meta);}));}
  function renderHero(a){$('tickerBadge').textContent=a.symbol;$('stockTitle').textContent=state.meta?.name?`${a.symbol} · ${state.meta.name}`:a.symbol;$('chartTitle').textContent=`${a.symbol} chart`;$('priceValue').textContent=fmtMoney(a.latest.close);$('priceChange').textContent=`${a.changePct>=0?'+':''}${(a.changePct*100).toFixed(2)}%`;$('priceChange').className=`price-change ${a.changePct>0?'positive':a.changePct<0?'negative':'neutral'}`;$('statusBadge').textContent=a.status;$('statusBadge').className=`status-badge ${statusClass(a.status)}`;$('statusReason').textContent=a.reason;}
  function renderReadiness(a){$('readinessValue').textContent=`${a.readiness}%`;$('readinessLabel').textContent=a.status==='BUY NOW'?'Confirmed':a.status==='SETUP — READY SOON'?'Ready soon':a.status==='WAIT FOR PULLBACK'?'Overextended':a.status==='AVOID'?'Avoid':'Not ready';$('readinessGauge').style.setProperty('--pct',`${a.readiness}%`);$('checkSummary').textContent=`${a.passed} / ${a.total} checks passed`;$('gateSummary').textContent=a.criticalFailed?.length?`${a.criticalFailed.length} critical gate${a.criticalFailed.length>1?'s':''} blocking BUY: ${a.criticalFailed.join(', ')}`:a.intradayConfirmation?.pass?'All higher-timeframe gates + 15m confirmation passed.':a.dailyGatesReady?'Higher-timeframe gates passed; waiting for selective 15m confirmation.':'All four critical gates are ready.';}
  function renderWhy(a){const why=[];if(a.latest.close>a.overextension)why.push(['Strong trend, but price is overextended','Current price is above the overextension line.']);if(!a.engines.entry.ready)why.push(['Entry gate is not ready','Wait for a better location, healthier RSI, or a pullback into the preferred entry zone.']);if(!a.engines.probability.ready)why.push(['Probability confirmation is incomplete',`Walk-forward result is ${(a.wf.winRate*100).toFixed(0)}% across ${a.wf.sample} samples.`]);if(!a.engines.riskReward.ready)why.push(['Risk / reward is not good enough',`Current estimated reward/risk is ${a.rr.toFixed(2)}:1.`]);if(a.dailyGatesReady&&!a.intradayConfirmation?.pass)why.push(['15-minute confirmation is still required',a.intradayConfirmation?.reason||'The scheduled scanner has not confirmed the intraday setup yet.']);if(!why.length)why.push(['All BUY gates are cleared','Higher-timeframe and intraday confirmation are satisfied.']);$('whyList').innerHTML=why.slice(0,4).map(([t,c])=>`<div class="why-item"><div class="why-title">${escapeHtml(t)}</div><div class="why-copy">${escapeHtml(c)}</div></div>`).join('');}
  function renderEngines(a){$('engineGrid').innerHTML=Object.values(a.engines).map((e,idx)=>`<article class="engine-card"><div class="engine-top"><div class="engine-name">${idx+1}. ${escapeHtml(e.name)}</div><div class="engine-state ${e.state.toLowerCase()}">${e.state}</div></div><div class="metric-list">${e.metrics.map(m=>{const cls=m.pass?'pass':m.warn?'warn':'fail';return`<div class="metric"><div class="metric-icon ${cls}">${m.pass?'✓':m.warn?'!':'×'}</div><div><div class="metric-name">${escapeHtml(m.name)}</div><div class="metric-value">${escapeHtml(m.value)}</div></div></div>`;}).join('')}</div><div class="engine-foot">${e.passes} / ${e.total} passed · critical gate ${e.ready?'cleared':'not cleared'}</div></article>`).join('');}
  function renderLevels(a){$('entryLevel').textContent=`${fmtMoney(a.preferredEntryLow)} – ${fmtMoney(a.preferredEntryHigh)}`;$('overLevel').textContent=fmtMoney(a.overextension);$('stopLevel').textContent=fmtMoney(a.thesisBreak);}
  function renderTriggers(a){const rows=[['BUY NOW','All four higher-timeframe gates plus selective 15-minute confirmation.',a.status==='BUY NOW'],['READY SOON','Higher-timeframe setup is close or complete but BUY confirmation is not final.',a.status==='SETUP — READY SOON'],['PULLBACK',`Price moves back under ${fmtMoney(a.overextension)} without breaking the thesis.`,a.latest.close<=a.overextension],['SELL / EXIT',`Price breaks the thesis area near ${fmtMoney(a.thesisBreak)}.`,a.latest.close<=a.thesisBreak]];$('triggerMap').innerHTML=rows.map(([l,d,on])=>`<div class="trigger-row"><div class="trigger-label">${l}</div><div class="trigger-desc">${d}</div><div class="trigger-state ${on?'status-buy':'status-wait'}">${on?'ACTIVE':'INACTIVE'}</div></div>`).join('');}

  function resizeCanvas(){const rect=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(300,Math.floor(rect.width*dpr));canvas.height=Math.floor(360*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);drawChart();}
  function drawChart(){
    if(!state.analysis||!state.candles.length)return;
    const a=state.analysis,candles=state.candles,w=canvas.getBoundingClientRect().width,h=360;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#08111f';ctx.fillRect(0,0,w,h);
    const pad={l:52,r:70,t:18,b:28};
    const highs=candles.map(c=>Number(c.high)),lows=candles.map(c=>Number(c.low));
    const shortTerm=state.timeframe==='1D'||state.timeframe==='5D';
    const candleMin=Math.min(...lows),candleMax=Math.max(...highs);
    let min,max;
    if(shortTerm){
      const span=Math.max(candleMax-candleMin,Number(candles.at(-1)?.close||1)*.002);
      const margin=span*.08;
      min=candleMin-margin;max=candleMax+margin;
    }else{
      min=Math.min(candleMin,a.thesisBreak)*.995;max=Math.max(candleMax,a.overextension)*1.005;
    }
    if(!(max>min)){min=candleMin*.995;max=candleMax*1.005;}
    const y=v=>pad.t+(max-v)/(max-min)*(h-pad.t-pad.b),x=i=>pad.l+i/Math.max(1,candles.length-1)*(w-pad.l-pad.r);
    ctx.strokeStyle='#17283c';ctx.lineWidth=1;ctx.font='10px system-ui';ctx.fillStyle='#7790ad';
    for(let i=0;i<=5;i++){const yy=pad.t+i*(h-pad.t-pad.b)/5;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillText((max-i*(max-min)/5).toFixed(2),w-pad.r+8,yy+3);}
    if(!shortTerm){
      const entryY1=y(a.preferredEntryHigh),entryY2=y(a.preferredEntryLow);ctx.fillStyle='rgba(47,209,139,.12)';ctx.fillRect(pad.l,Math.min(entryY1,entryY2),w-pad.l-pad.r,Math.abs(entryY2-entryY1));
    }
    drawLevel(a.overextension,'#f4a340','Overextension');drawLevel(a.thesisBreak,'#ef6262','Thesis Break');drawLevel((a.preferredEntryLow+a.preferredEntryHigh)/2,'#2fd18b','Preferred Entry');
    const step=(w-pad.l-pad.r)/candles.length,body=Math.max(1.5,Math.min(5,step*.55));
    candles.forEach((c,i)=>{const xx=x(i),yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low),up=c.close>=c.open;ctx.strokeStyle=up?'#2fd18b':'#ef6262';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,yh);ctx.lineTo(xx,yl);ctx.stroke();ctx.fillRect(xx-body/2,Math.min(yo,yc),body,Math.max(1,Math.abs(yc-yo)));});
    const last=candles.at(-1),py=y(last.close);ctx.setLineDash([4,4]);ctx.strokeStyle='#7ebcff';ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(w-pad.r,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#7ebcff';ctx.fillText(last.close.toFixed(2),w-pad.r+8,py+3);
    if(shortTerm){ctx.fillStyle='#7790ad';ctx.fillText('Auto-scaled to visible candles',pad.l+8,h-10);}
    function drawLevel(v,color,label){if(!Number.isFinite(Number(v))||v<min||v>max)return;const yy=y(v);ctx.setLineDash([6,5]);ctx.strokeStyle=color;ctx.globalAlpha=.85;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=color;ctx.fillText(label,pad.l+8,yy-5);}
  }

  function bindSearch(){const input=$('symbolInput');$('loadSymbolBtn').addEventListener('click',()=>resolveAndLoad(input.value));input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();resolveAndLoad(input.value);}if(e.key==='Escape'&&$('symbolSuggestions'))$('symbolSuggestions').hidden=true;});input.addEventListener('input',()=>{clearTimeout(state.searchTimer);const q=input.value.trim();if(q.length<2){if($('symbolSuggestions'))$('symbolSuggestions').hidden=true;return;}state.searchTimer=setTimeout(async()=>{try{renderSearchResults(await searchSymbols(q));}catch(err){console.warn('Symbol preview unavailable',err);}},650);});document.addEventListener('click',e=>{if(!e.target.closest('.symbol-search-wrap')&&$('symbolSuggestions'))$('symbolSuggestions').hidden=true;});}

  ensureSearchUi();bindSearch();renderTimeframes();renderRecent();renderWatchlist();refreshSavedSignals().then(()=>{
    const urlSymbol=sanitizeSymbol(new URLSearchParams(location.search).get('symbol'));
    loadSymbol(urlSymbol||'XOM',state.recent.find(x=>x.symbol===(urlSymbol||'XOM'))||null);
  });window.addEventListener('resize',()=>{clearTimeout(window.__sfResize);window.__sfResize=setTimeout(resizeCanvas,120);});
})();
