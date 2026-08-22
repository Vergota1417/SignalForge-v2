(() => {
  'use strict';

  const CONFIG=window.SIGNALFORGE_CONFIG||{API_BASE_URL:window.location.origin};
  const TIMEFRAMES={
    '1D':{resolution:'5-minute candles · latest regular session'},
    '5D':{resolution:'15-minute candles · latest 5 regular sessions'},
    '1M':{resolution:'1-hour candles'},
    '3M':{resolution:'Daily candles'},
    '6M':{resolution:'Daily candles'},
    '1Y':{resolution:'Daily candles'},
    '2Y':{resolution:'Weekly candles'}
  };
  const WATCHLIST=['XOM','NVDA','MSFT','AAPL','AMZN','TSLA'];
  const RECENT_KEY='signalforge_recent_symbols_v1';
  const $=id=>document.getElementById(id);
  const canvas=$('priceChart');
  const ctx=canvas.getContext('2d');
  const state={
    symbol:'XOM',
    timeframe:'6M',
    candles:[],
    analysis:null,
    meta:null,
    watchAnalyses:{},
    watchUpdated:{},
    watchMeta:{},
    recent:loadRecent(),
    searchCache:new Map(),
    searchTimer:null,
    searchAbort:null
  };

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
  function sanitizeSymbol(value){
    const s=String(value||'').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6);
    return /^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)?s:'';
  }
  function fmtMoney(v){
    return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
  }
  function fmtScanTime(v){return Number(v)?new Date(Number(v)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';}
  function statusClass(status){
    if(status==='BUY NOW')return'status-buy';
    if(status==='SETUP — READY SOON')return'status-setup';
    if(status==='WAIT FOR PULLBACK')return'status-pullback';
    if(status==='WAIT — SETUP NOT READY')return'status-wait';
    if(status==='AVOID')return'status-avoid';
    return'status-sell';
  }
  function escapeHtml(v){
    return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function clamp(v,lo,hi){return Math.min(hi,Math.max(lo,v));}
  function finite(v){return Number.isFinite(Number(v));}

  function loadRecent(){
    try{
      const rows=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
      return Array.isArray(rows)?rows.slice(0,6):[];
    }catch{return[];}
  }
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
      const box=document.createElement('div');
      box.id='symbolSuggestions';
      box.className='symbol-suggestions';
      box.hidden=true;
      label.appendChild(box);
    }
    const sidebar=document.querySelector('.sidebar');
    if(sidebar&&!$('recentViewed')){
      const block=document.createElement('div');
      block.className='recent-block';
      block.innerHTML='<div class="eyebrow">Recently viewed</div><div id="recentViewed" class="recent-viewed"></div>';
      sidebar.appendChild(block);
    }
  }

  function ensureStage75Ui(){
    if(!$('sfStage75Styles')){
      const style=document.createElement('style');
      style.id='sfStage75Styles';
      style.textContent=`
        .chart-action{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:10px;padding:11px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}
        .chart-action-icon{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-weight:900;border:1px solid currentColor}
        .chart-action-title{font-weight:850;font-size:12px;letter-spacing:.025em}
        .chart-action-copy{color:var(--muted);font-size:11px;margin-top:2px}
        .chart-action-level{text-align:right;font-size:11px;color:var(--muted)}
        .chart-action-level strong{display:block;color:var(--text);font-size:13px}
        .chart-action.buy{color:var(--green);background:linear-gradient(90deg,var(--green-soft),var(--panel-2) 52%)}
        .chart-action.setup{color:var(--blue);background:linear-gradient(90deg,rgba(78,161,255,.12),var(--panel-2) 52%)}
        .chart-action.pullback{color:var(--orange);background:linear-gradient(90deg,var(--orange-soft),var(--panel-2) 52%)}
        .chart-action.wait{color:var(--yellow);background:linear-gradient(90deg,rgba(242,210,92,.09),var(--panel-2) 52%)}
        .chart-action.avoid,.chart-action.sell{color:var(--red);background:linear-gradient(90deg,var(--red-soft),var(--panel-2) 52%)}
        .level-legend.stage75{grid-template-columns:repeat(4,minmax(0,1fr))}
        .dot.target{background:var(--blue)}
        @media(max-width:900px){.level-legend.stage75{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:560px){.chart-action{grid-template-columns:auto minmax(0,1fr)}.chart-action-level{grid-column:1/-1;text-align:left;padding-left:44px}.level-legend.stage75{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }
    const legend=document.querySelector('.level-legend');
    if(legend){
      legend.classList.add('stage75');
      if(!$('targetLevel')){
        const target=document.createElement('div');
        target.innerHTML='<span class="dot target"></span><strong>Structure Target</strong><span id="targetLevel">—</span>';
        legend.appendChild(target);
      }
    }
    const wrap=document.querySelector('.canvas-wrap');
    if(wrap&&!$('chartAction')){
      const action=document.createElement('div');
      action.id='chartAction';
      action.className='chart-action wait';
      action.setAttribute('role','status');
      action.setAttribute('aria-live','polite');
      action.innerHTML='<div class="chart-action-icon" id="chartActionIcon">•</div><div><div class="chart-action-title" id="chartActionTitle">Analyzing entry</div><div class="chart-action-copy" id="chartActionCopy">SignalForge is checking the active decision gates.</div></div><div class="chart-action-level" id="chartActionLevel">—</div>';
      wrap.insertAdjacentElement('afterend',action);
    }
  }

  function guidanceFor(a){
    const entryMid=(Number(a.preferredEntryLow)+Number(a.preferredEntryHigh))/2;
    const entryRange=`${fmtMoney(a.preferredEntryLow)} – ${fmtMoney(a.preferredEntryHigh)}`;
    const failed=Array.isArray(a.criticalFailed)?a.criticalFailed:[];
    if(a.status==='BUY NOW'){
      return{
        kind:'buy',icon:'↑',title:'BUY WINDOW',
        copy:'All critical gates are cleared. The chart marks the current entry window instead of treating every pass count as a buy.',
        level:Number(a.latest.close),levelText:`Current ${fmtMoney(a.latest.close)}`,entryMid
      };
    }
    if(a.status==='SETUP — READY SOON'){
      return{
        kind:'setup',icon:'↘',title:'SETUP — READY SOON',
        copy:`The setup is close, but SignalForge still wants the remaining confirmation. Preferred entry is ${entryRange}.`,
        level:entryMid,levelText:`Preferred ${entryRange}`,entryMid
      };
    }
    if(a.status==='WAIT FOR PULLBACK'){
      return{
        kind:'pullback',icon:'↓',title:'WAIT FOR PULLBACK',
        copy:`Do not chase strength. Let price move toward the preferred entry zone at ${entryRange} while the thesis stays intact.`,
        level:entryMid,levelText:`Pullback zone ${entryRange}`,entryMid
      };
    }
    if(a.status==='SELL / EXIT'){
      return{
        kind:'sell',icon:'↓',title:'SELL / EXIT',
        copy:`The thesis-break level near ${fmtMoney(a.thesisBreak)} has failed. This is an exit condition, not a new-entry discount.`,
        level:Number(a.thesisBreak),levelText:`Thesis break ${fmtMoney(a.thesisBreak)}`,entryMid
      };
    }
    if(a.status==='AVOID'){
      return{
        kind:'avoid',icon:'×',title:'AVOID NEW ENTRY',
        copy:'Trend quality is not strong enough. Being below an upper risk line does not automatically make the stock a buy.',
        level:null,levelText:'No entry',entryMid
      };
    }
    return{
      kind:'wait',icon:'•',title:'WATCH — NOT READY',
      copy:failed.length?`Critical gates still blocking BUY: ${failed.join(', ')}.`:'The setup has not cleared the required gates yet.',
      level:entryMid,levelText:`Preferred ${entryRange}`,entryMid
    };
  }

  function renderChartAction(a){
    ensureStage75Ui();
    const g=guidanceFor(a);
    const root=$('chartAction');
    if(!root)return;
    root.className=`chart-action ${g.kind}`;
    $('chartActionIcon').textContent=g.icon;
    $('chartActionTitle').textContent=g.title;
    $('chartActionCopy').textContent=g.copy;
    const rr=finite(a.rr)?Number(a.rr):0;
    const rrText=finite(a.target)?`R/R ${rr.toFixed(2)} : 1`:'R/R unresolved';
    $('chartActionLevel').innerHTML=`<strong>${escapeHtml(g.levelText)}</strong>${escapeHtml(rrText)}`;
  }

  async function refreshSavedSignals(){
    try{
      const payload=await apiGet('/api/signals');
      for(const row of payload.signals||[]){
        if(row?.symbol&&row.analysis){
          state.watchAnalyses[row.symbol]=row.analysis;
          state.watchUpdated[row.symbol]=Number(row.updatedAt)||0;
        }
      }
    }catch(err){console.warn('Saved signal state unavailable',err);}
    renderWatchlist();
  }

  async function fetchMarket(symbol,timeframe){
    return apiGet(`/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
  }

  async function searchSymbols(query){
    const key=String(query||'').trim().toUpperCase();
    if(state.searchCache.has(key))return state.searchCache.get(key);
    const payload=await apiGet(`/api/symbol-search?q=${encodeURIComponent(query)}`);
    const results=Array.isArray(payload.results)?payload.results:[];
    state.searchCache.set(key,results);
    return results;
  }

  function renderSearchResults(results){
    const box=$('symbolSuggestions');
    if(!box)return;
    if(!results.length){
      box.innerHTML='<div class="symbol-suggestion-empty">No matching U.S. stocks or ETFs found.</div>';
      box.hidden=false;
      return;
    }
    box.innerHTML=results.map((r,i)=>`<button type="button" class="symbol-suggestion" data-index="${i}"><span><strong>${escapeHtml(r.symbol)}</strong> ${escapeHtml(r.name)}</span><small>${escapeHtml([r.exchange,r.type].filter(Boolean).join(' · '))}</small></button>`).join('');
    box.hidden=false;
    box.querySelectorAll('.symbol-suggestion').forEach(btn=>btn.addEventListener('click',()=>{
      const r=results[Number(btn.dataset.index)];
      box.hidden=true;
      $('symbolInput').value=r.symbol;
      loadSymbol(r.symbol,r);
    }));
  }

  async function resolveAndLoad(raw){
    const typed=String(raw||'').trim();
    if(!typed)return;
    $('stockSubtitle').textContent='Finding stock…';
    try{
      const results=await searchSymbols(typed);
      const exactTicker=sanitizeSymbol(typed);
      const selected=(exactTicker&&results.find(r=>r.symbol===exactTicker))||results[0];
      if(!selected)throw new Error('No matching U.S. stock or ETF found.');
      $('symbolSuggestions').hidden=true;
      $('symbolInput').value=selected.symbol;
      await loadSymbol(selected.symbol,selected);
    }catch(err){showLoadError(err.message||'Stock search failed.');}
  }

  async function loadSymbol(symbol,meta=null){
    symbol=sanitizeSymbol(symbol);
    if(!symbol){showLoadError('Enter a valid ticker or choose a search result.');return;}
    state.symbol=symbol;
    state.meta=meta||state.recent.find(x=>x.symbol===symbol)||state.watchMeta[symbol]||null;
    $('symbolInput').value=symbol;
    $('stockSubtitle').textContent='Loading verified market data…';
    renderTimeframes();
    renderWatchlist();
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
      state.candles=chartPayload.candles.map(c=>({...c,time:Number(c.time)}));
      state.analysis=decisionAnalysis;
      if(state.meta)rememberSymbol(state.meta);
      else rememberSymbol({symbol,name:symbol});
      const info=state.meta?[state.meta.name,state.meta.type,state.meta.exchange].filter(Boolean).join(' · '):'Verified Twelve Data symbol';
      $('stockSubtitle').textContent=info;
      $('chartDataSource').textContent=`Data: ${chartPayload.source}${chartPayload.cached?' · cached':''}`;
      $('candleResolution').textContent=`Resolution: ${TIMEFRAMES[state.timeframe].resolution}`;
      renderAll();
    }catch(err){showLoadError(err.message||'Unable to load this stock.');}
  }

  function showLoadError(message){
    state.candles=[];
    state.analysis=null;
    $('stockSubtitle').textContent=message;
    $('priceValue').textContent='—';
    $('priceChange').textContent='—';
    $('statusBadge').textContent='DATA UNAVAILABLE';
    $('statusBadge').className='status-badge status-avoid';
    $('statusReason').textContent='SignalForge will not substitute demo candles for a failed live stock request.';
    $('chartDataSource').textContent='Data: unavailable';
    if($('chartAction')){
      $('chartAction').className='chart-action avoid';
      $('chartActionTitle').textContent='DATA UNAVAILABLE';
      $('chartActionCopy').textContent='No action guidance is shown without valid market data.';
      $('chartActionLevel').textContent='—';
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  function renderAll(){
    const a=state.analysis;
    if(!a)return;
    ensureStage75Ui();
    renderHero(a);
    renderReadiness(a);
    renderWhy(a);
    renderEngines(a);
    renderLevels(a);
    renderTriggers(a);
    renderChartAction(a);
    renderWatchlist();
    resizeCanvas();
  }

  function renderTimeframes(){
    const root=$('timeframeTabs');
    root.innerHTML='';
    Object.keys(TIMEFRAMES).forEach(tf=>{
      const b=document.createElement('button');
      b.type='button';
      b.className=`timeframe-btn ${tf===state.timeframe?'active':''}`;
      b.textContent=tf;
      b.setAttribute('role','tab');
      b.setAttribute('aria-selected',tf===state.timeframe?'true':'false');
      b.addEventListener('click',()=>{
        state.timeframe=tf;
        loadSymbol(state.symbol,state.meta);
      });
      root.appendChild(b);
    });
  }

  function renderWatchlist(){
    const root=$('watchlist');
    root.innerHTML='';
    WATCHLIST.forEach(sym=>{
      const a=state.watchAnalyses[sym],updated=state.watchUpdated[sym];
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=`watch-item ${sym===state.symbol?'active':''}`;
      const status=a?a.status.split(' — ')[0]:'Not yet analyzed';
      const scan=a&&updated?`<div class="watch-meta"><small>Last deep scan ${fmtScanTime(updated)}</small></div>`:'';
      btn.innerHTML=`<div><div class="watch-symbol">${sym}</div><div class="watch-meta"><span class="watch-status ${a?statusClass(a.status):''}">${status}</span></div>${scan}</div><div class="watch-price">${a?fmtMoney(a.latest.close):'—'}<div class="${a&&a.changePct>=0?'price-change positive':'price-change negative'}">${a?`${(a.changePct*100).toFixed(2)}%`:'—'}</div></div>`;
      btn.addEventListener('click',()=>loadSymbol(sym,state.watchMeta[sym]||state.recent.find(x=>x.symbol===sym)||null));
      root.appendChild(btn);
    });
  }

  function renderRecent(){
    const root=$('recentViewed');
    if(!root)return;
    if(!state.recent.length){
      root.innerHTML='<div class="muted recent-empty">Stocks you open will appear here.</div>';
      return;
    }
    root.innerHTML=state.recent.map(r=>`<button type="button" class="recent-item" data-symbol="${escapeHtml(r.symbol)}"><strong>${escapeHtml(r.symbol)}</strong><span>${escapeHtml(r.name||r.symbol)}</span></button>`).join('');
    root.querySelectorAll('.recent-item').forEach(btn=>btn.addEventListener('click',()=>{
      const meta=state.recent.find(r=>r.symbol===btn.dataset.symbol);
      loadSymbol(btn.dataset.symbol,meta);
    }));
  }

  function renderHero(a){
    $('tickerBadge').textContent=a.symbol;
    $('stockTitle').textContent=state.meta?.name?`${a.symbol} · ${state.meta.name}`:a.symbol;
    $('chartTitle').textContent=`${a.symbol} chart`;
    $('priceValue').textContent=fmtMoney(a.latest.close);
    $('priceChange').textContent=`${a.changePct>=0?'+':''}${(a.changePct*100).toFixed(2)}%`;
    $('priceChange').className=`price-change ${a.changePct>0?'positive':a.changePct<0?'negative':'neutral'}`;
    $('statusBadge').textContent=a.status;
    $('statusBadge').className=`status-badge ${statusClass(a.status)}`;
    $('statusReason').textContent=a.reason;
  }

  function renderReadiness(a){
    $('readinessValue').textContent=`${a.readiness}%`;
    $('readinessLabel').textContent=a.status==='BUY NOW'?'Confirmed':a.status==='SETUP — READY SOON'?'Ready soon':a.status==='WAIT FOR PULLBACK'?'Overextended':a.status==='AVOID'?'Avoid':'Not ready';
    $('readinessGauge').style.setProperty('--pct',`${a.readiness}%`);
    $('checkSummary').textContent=`${a.passed} / ${a.total} checks passed`;
    $('gateSummary').textContent=a.criticalFailed?.length
      ?`${a.criticalFailed.length} critical gate${a.criticalFailed.length>1?'s':''} blocking BUY: ${a.criticalFailed.join(', ')}`
      :a.intradayConfirmation?.pass
        ?'All higher-timeframe gates + 15m confirmation passed.'
        :a.dailyGatesReady
          ?'Higher-timeframe gates passed; waiting for selective 15m confirmation.'
          :'All four critical gates are ready.';
  }

  function renderWhy(a){
    const why=[];
    if(a.latest.close>a.overextension)why.push(['Strong trend, but price is overextended','Current price is above the overextension line. That is a chase-risk warning, not an automatic sell signal.']);
    if(!a.engines.entry.ready)why.push(['Entry gate is not ready','Wait for a better location, healthier RSI, or a pullback into the preferred entry zone.']);
    if(!a.engines.probability.ready)why.push(['Probability confirmation is incomplete',`Walk-forward result is ${(a.wf.winRate*100).toFixed(0)}% across ${a.wf.sample} samples.`]);
    if(!a.engines.riskReward.ready)why.push(['Risk / reward is not good enough',finite(a.target)?`Current estimated reward/risk is ${Number(a.rr).toFixed(2)}:1.`:'No defensible structure target is currently resolved.']);
    if(a.dailyGatesReady&&!a.intradayConfirmation?.pass)why.push(['15-minute confirmation is still required',a.intradayConfirmation?.reason||'The scheduled scanner has not confirmed the intraday setup yet.']);
    if(!why.length)why.push(['All BUY gates are cleared','Higher-timeframe and intraday confirmation are satisfied.']);
    $('whyList').innerHTML=why.slice(0,4).map(([t,c])=>`<div class="why-item"><div class="why-title">${escapeHtml(t)}</div><div class="why-copy">${escapeHtml(c)}</div></div>`).join('');
  }

  function renderEngines(a){
    $('engineGrid').innerHTML=Object.values(a.engines).map((e,idx)=>`<article class="engine-card"><div class="engine-top"><div class="engine-name">${idx+1}. ${escapeHtml(e.name)}</div><div class="engine-state ${e.state.toLowerCase()}">${e.state}</div></div><div class="metric-list">${e.metrics.map(m=>{const cls=m.pass?'pass':m.warn?'warn':'fail';return`<div class="metric"><div class="metric-icon ${cls}">${m.pass?'✓':m.warn?'!':'×'}</div><div><div class="metric-name">${escapeHtml(m.name)}</div><div class="metric-value">${escapeHtml(m.value)}</div></div></div>`;}).join('')}</div><div class="engine-foot">${e.passes} / ${e.total} passed · critical gate ${e.ready?'cleared':'not cleared'}</div></article>`).join('');
  }

  function renderLevels(a){
    $('entryLevel').textContent=`${fmtMoney(a.preferredEntryLow)} – ${fmtMoney(a.preferredEntryHigh)}`;
    $('overLevel').textContent=fmtMoney(a.overextension);
    $('stopLevel').textContent=fmtMoney(a.thesisBreak);
    if($('targetLevel'))$('targetLevel').textContent=finite(a.target)?fmtMoney(a.target):'Unresolved';
  }

  function renderTriggers(a){
    const rows=[
      ['BUY NOW','All four higher-timeframe gates plus selective 15-minute confirmation.',a.status==='BUY NOW'],
      ['READY SOON','Higher-timeframe setup is close or complete but BUY confirmation is not final.',a.status==='SETUP — READY SOON'],
      ['PULLBACK',`Price moves back under ${fmtMoney(a.overextension)} without breaking the thesis.`,a.status==='WAIT FOR PULLBACK'],
      ['SELL / EXIT',`Price breaks the thesis area near ${fmtMoney(a.thesisBreak)}.`,a.status==='SELL / EXIT']
    ];
    $('triggerMap').innerHTML=rows.map(([l,d,on])=>`<div class="trigger-row"><div class="trigger-label">${l}</div><div class="trigger-desc">${d}</div><div class="trigger-state ${on?'status-buy':'status-wait'}">${on?'ACTIVE':'INACTIVE'}</div></div>`).join('');
  }

  function resizeCanvas(){
    const rect=canvas.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(300,Math.floor(rect.width*dpr));
    canvas.height=Math.floor(360*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    drawChart();
  }

  function drawChart(){
    if(!state.analysis||!state.candles.length)return;
    const a=state.analysis,candles=state.candles,w=canvas.getBoundingClientRect().width,h=360;
    const g=guidanceFor(a);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#08111f';
    ctx.fillRect(0,0,w,h);
    const pad={l:52,r:72,t:20,b:30};
    const highs=candles.map(c=>Number(c.high)),lows=candles.map(c=>Number(c.low));
    const shortTerm=state.timeframe==='1D'||state.timeframe==='5D';
    const candleMin=Math.min(...lows),candleMax=Math.max(...highs);
    let min,max;
    if(shortTerm){
      const span=Math.max(candleMax-candleMin,Number(candles.at(-1)?.close||1)*.002);
      const margin=span*.08;
      min=candleMin-margin;
      max=candleMax+margin;
    }else{
      const levelMins=[candleMin,Number(a.thesisBreak),Number(a.preferredEntryLow)].filter(Number.isFinite);
      const levelMaxs=[candleMax,Number(a.overextension),Number(a.preferredEntryHigh),Number(a.target)].filter(Number.isFinite);
      min=Math.min(...levelMins)*.995;
      max=Math.max(...levelMaxs)*1.005;
    }
    if(!(max>min)){
      min=candleMin*.995;
      max=candleMax*1.005;
    }
    const plotW=w-pad.l-pad.r;
    const plotH=h-pad.t-pad.b;
    const y=v=>pad.t+(max-v)/(max-min)*plotH;
    const x=i=>pad.l+i/Math.max(1,candles.length-1)*plotW;

    ctx.strokeStyle='#17283c';
    ctx.lineWidth=1;
    ctx.font='10px system-ui';
    ctx.fillStyle='#7790ad';
    for(let i=0;i<=5;i++){
      const yy=pad.t+i*plotH/5;
      ctx.beginPath();
      ctx.moveTo(pad.l,yy);
      ctx.lineTo(w-pad.r,yy);
      ctx.stroke();
      ctx.fillText((max-i*(max-min)/5).toFixed(2),w-pad.r+8,yy+3);
    }

    if(!shortTerm){
      const entryY1=y(a.preferredEntryHigh),entryY2=y(a.preferredEntryLow);
      ctx.fillStyle='rgba(47,209,139,.12)';
      ctx.fillRect(pad.l,Math.min(entryY1,entryY2),plotW,Math.abs(entryY2-entryY1));
      drawRiskRewardBox();
    }

    drawLevel(a.overextension,'#f4a340','Overextension / Don’t Chase');
    drawLevel(a.thesisBreak,'#ef6262','Thesis Break / Stop');
    drawLevel((Number(a.preferredEntryLow)+Number(a.preferredEntryHigh))/2,'#2fd18b','Preferred Entry');
    if(finite(a.target))drawLevel(Number(a.target),'#4ea1ff','Structure Target');

    const step=plotW/candles.length;
    const body=Math.max(1.5,Math.min(5,step*.55));
    candles.forEach((c,i)=>{
      const xx=x(i),yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low),up=c.close>=c.open;
      ctx.strokeStyle=up?'#2fd18b':'#ef6262';
      ctx.fillStyle=ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(xx,yh);
      ctx.lineTo(xx,yl);
      ctx.stroke();
      ctx.fillRect(xx-body/2,Math.min(yo,yc),body,Math.max(1,Math.abs(yc-yo)));
    });

    const last=candles.at(-1);
    const py=y(last.close);
    ctx.setLineDash([4,4]);
    ctx.strokeStyle='#7ebcff';
    ctx.beginPath();
    ctx.moveTo(pad.l,py);
    ctx.lineTo(w-pad.r,py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#7ebcff';
    ctx.fillText(Number(last.close).toFixed(2),w-pad.r+8,py+3);

    drawActionMarker();

    if(shortTerm){
      ctx.fillStyle='#7790ad';
      ctx.fillText('Intraday view · decision levels stay based on the higher-timeframe analysis',pad.l+8,h-10);
    }

    function drawLevel(v,color,label){
      v=Number(v);
      if(!Number.isFinite(v)||v<min||v>max)return;
      const yy=y(v);
      ctx.setLineDash([6,5]);
      ctx.strokeStyle=color;
      ctx.globalAlpha=.86;
      ctx.beginPath();
      ctx.moveTo(pad.l,yy);
      ctx.lineTo(w-pad.r,yy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha=1;
      ctx.fillStyle=color;
      const maxLabelWidth=Math.max(70,plotW*.55);
      const text=fitText(label,maxLabelWidth);
      ctx.fillText(text,pad.l+8,clamp(yy-5,pad.t+10,h-pad.b-4));
    }

    function drawRiskRewardBox(){
      const current=Number(a.latest?.close);
      const stop=Number(a.thesisBreak);
      const target=Number(a.target);
      if(![current,stop,target].every(Number.isFinite)||!(target>current)||!(current>stop))return;
      const boxW=clamp(plotW*.16,64,112);
      const left=w-pad.r-boxW-7;
      const right=w-pad.r-7;
      const yCurrent=y(current),yTarget=y(target),yStop=y(stop);

      ctx.save();
      ctx.fillStyle='rgba(47,209,139,.10)';
      ctx.fillRect(left,Math.min(yTarget,yCurrent),right-left,Math.abs(yCurrent-yTarget));
      ctx.fillStyle='rgba(239,98,98,.10)';
      ctx.fillRect(left,Math.min(yCurrent,yStop),right-left,Math.abs(yStop-yCurrent));
      ctx.strokeStyle='rgba(255,255,255,.10)';
      ctx.strokeRect(left,Math.min(yTarget,yStop),right-left,Math.abs(yStop-yTarget));
      ctx.font='9px system-ui';
      const rewardPct=(target/current-1)*100;
      const riskPct=(current-stop)/current*100;
      if(Math.abs(yCurrent-yTarget)>18){
        ctx.fillStyle='#2fd18b';
        ctx.fillText(`Reward +${rewardPct.toFixed(1)}%`,left+5,(yTarget+yCurrent)/2+3);
      }
      if(Math.abs(yStop-yCurrent)>18){
        ctx.fillStyle='#ef6262';
        ctx.fillText(`Risk -${riskPct.toFixed(1)}%`,left+5,(yCurrent+yStop)/2+3);
      }
      ctx.restore();
    }

    function drawActionMarker(){
      const current=Number(a.latest?.close);
      const entryMid=Number(g.entryMid);
      const color=g.kind==='buy'?'#2fd18b':g.kind==='setup'?'#4ea1ff':g.kind==='pullback'?'#f4a340':g.kind==='wait'?'#f2d25c':'#ef6262';
      const xAnchor=w-pad.r-18;

      if(g.kind==='pullback'||g.kind==='setup'){
        if(entryMid>=min&&entryMid<=max&&current>=min&&current<=max){
          const y1=y(current),y2=y(entryMid);
          drawArrow(xAnchor,y1,xAnchor,y2,color);
          drawChip(g.kind==='pullback'?'WAIT → ENTRY ZONE':'READY SOON',color,xAnchor-116,clamp((y1+y2)/2-10,pad.t+4,h-pad.b-22));
        }else{
          drawChip(g.title,color,w-pad.r-126,pad.t+8);
        }
      }else if(g.kind==='buy'){
        const yy=current>=min&&current<=max?y(current):pad.t+24;
        drawArrow(xAnchor,yy+24,xAnchor,yy+3,color);
        drawChip('BUY WINDOW',color,xAnchor-96,clamp(yy-22,pad.t+4,h-pad.b-22));
      }else if(g.kind==='sell'){
        const yy=current>=min&&current<=max?y(current):pad.t+24;
        drawArrow(xAnchor,yy-22,xAnchor,yy+5,color);
        drawChip('EXIT / THESIS BROKEN',color,xAnchor-132,clamp(yy+9,pad.t+4,h-pad.b-22));
      }else{
        drawChip(g.kind==='avoid'?'AVOID NEW ENTRY':'WATCH — GATES BLOCK BUY',color,w-pad.r-144,pad.t+8);
      }
    }

    function drawArrow(x1,y1,x2,y2,color){
      const head=6;
      const angle=Math.atan2(y2-y1,x2-x1);
      ctx.save();
      ctx.strokeStyle=color;
      ctx.fillStyle=color;
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2,y2);
      ctx.lineTo(x2-head*Math.cos(angle-Math.PI/6),y2-head*Math.sin(angle-Math.PI/6));
      ctx.lineTo(x2-head*Math.cos(angle+Math.PI/6),y2-head*Math.sin(angle+Math.PI/6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawChip(text,color,xPos,yPos){
      ctx.save();
      ctx.font='700 9px system-ui';
      const label=fitText(text,132);
      const width=Math.min(140,ctx.measureText(label).width+14);
      const xSafe=clamp(xPos,pad.l+4,w-pad.r-width-4);
      const ySafe=clamp(yPos,pad.t+3,h-pad.b-19);
      ctx.globalAlpha=.96;
      ctx.fillStyle='#0b1626';
      ctx.fillRect(xSafe,ySafe,width,18);
      ctx.strokeStyle=color;
      ctx.strokeRect(xSafe+.5,ySafe+.5,width-1,17);
      ctx.globalAlpha=1;
      ctx.fillStyle=color;
      ctx.fillText(label,xSafe+7,ySafe+12);
      ctx.restore();
    }

    function fitText(text,maxWidth){
      text=String(text||'');
      if(ctx.measureText(text).width<=maxWidth)return text;
      let out=text;
      while(out.length>6&&ctx.measureText(`${out}…`).width>maxWidth)out=out.slice(0,-1);
      return `${out}…`;
    }
  }

  function bindSearch(){
    const input=$('symbolInput');
    $('loadSymbolBtn').addEventListener('click',()=>resolveAndLoad(input.value));
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();resolveAndLoad(input.value);}
      if(e.key==='Escape'&&$('symbolSuggestions'))$('symbolSuggestions').hidden=true;
    });
    input.addEventListener('input',()=>{
      clearTimeout(state.searchTimer);
      const q=input.value.trim();
      if(q.length<2){
        if($('symbolSuggestions'))$('symbolSuggestions').hidden=true;
        return;
      }
      state.searchTimer=setTimeout(async()=>{
        try{renderSearchResults(await searchSymbols(q));}
        catch(err){console.warn('Symbol preview unavailable',err);}
      },650);
    });
    document.addEventListener('click',e=>{
      if(!e.target.closest('.symbol-search-wrap')&&$('symbolSuggestions'))$('symbolSuggestions').hidden=true;
    });
  }

  ensureSearchUi();
  ensureStage75Ui();
  bindSearch();
  renderTimeframes();
  renderRecent();
  renderWatchlist();
  refreshSavedSignals().then(()=>{
    const urlSymbol=sanitizeSymbol(new URLSearchParams(location.search).get('symbol'));
    loadSymbol(urlSymbol||'XOM',state.recent.find(x=>x.symbol===(urlSymbol||'XOM'))||null);
  });
  window.addEventListener('resize',()=>{
    clearTimeout(window.__sfResize);
    window.__sfResize=setTimeout(resizeCanvas,120);
  });
})();