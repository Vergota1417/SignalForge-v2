(() => {
  'use strict';
  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const state={rows:[],filter:'ALL',sort:'screenScore',query:''};
  const fmtMoney=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v)||0);
  const fmtPct=v=>`${Number(v)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const fmtCompact=v=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v)||0);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function ensureUi(){
    const main=document.querySelector('.main-content');
    if(!main||document.getElementById('smartScreenerView'))return;
    const section=document.createElement('section');
    section.id='smartScreenerView';
    section.className='sf-screen-view';
    section.hidden=true;
    section.innerHTML=`
      <div class="sf-screen-hero">
        <div><div class="eyebrow">Stage 8 · Smart Market Screener</div><h1>Find movement before deep analysis</h1><p>Discovery ranks activity first. Critical-gate analysis confirms whether it deserves capital.</p></div>
        <div class="sf-screen-actions"><button id="sfScreenRefresh" type="button">Refresh ranking</button><button id="sfScreenBack" type="button">Back to dashboard</button></div>
      </div>
      <div class="sf-screen-stats" id="sfScreenStats"></div>
      <div class="sf-screen-controls">
        <div id="sfScreenFilters" class="sf-screen-filters"></div>
        <label class="sf-screen-search"><span>Search</span><input id="sfScreenSearch" type="search" placeholder="Ticker or company" /></label>
        <label class="sf-screen-sort"><span>Sort</span><select id="sfScreenSort"><option value="screenScore">Best overall</option><option value="scoreVelocity">Fastest improving</option><option value="relativeVolume">Relative volume</option><option value="changePct">Price move</option></select></label>
      </div>
      <div class="sf-screen-method"><strong>Two-stage filter:</strong> cheap discovery narrows the market first; expensive/deep analysis only matters after a symbol earns attention.</div>
      <div id="sfScreenRows" class="sf-screen-rows" aria-live="polite"></div>
    `;
    main.prepend(section);
    injectStyles();
    bindUi();
    renderFilters();
  }

  function injectStyles(){
    if(document.getElementById('sfScreenerStyles'))return;
    const style=document.createElement('style');
    style.id='sfScreenerStyles';
    style.textContent=`
      .sf-screen-view{display:grid;gap:14px}.sf-screen-view[hidden]{display:none!important}
      .sf-screen-hero{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:18px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(135deg,#0c1728,#10223a)}
      .sf-screen-hero h1{margin:2px 0 6px;font-size:24px}.sf-screen-hero p{margin:0;color:var(--muted);max-width:680px}.sf-screen-actions{display:flex;gap:8px;flex-wrap:wrap}.sf-screen-actions button{border:1px solid var(--border);border-radius:9px;padding:9px 12px;background:var(--panel-2);cursor:pointer}
      .sf-screen-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.sf-stat{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}.sf-stat strong{display:block;font-size:20px}.sf-stat span{display:block;color:var(--muted);font-size:11px;margin-top:2px}
      .sf-screen-controls{display:grid;grid-template-columns:minmax(0,1fr) 190px 180px;gap:10px;align-items:end}.sf-screen-filters{display:flex;gap:6px;flex-wrap:wrap}.sf-filter{border:1px solid var(--border);background:var(--panel-2);color:var(--muted);border-radius:999px;padding:7px 10px;cursor:pointer}.sf-filter.active{color:var(--text);border-color:#2a5a8c;background:#17375a}.sf-screen-search,.sf-screen-sort{display:grid;gap:4px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.sf-screen-search input,.sf-screen-sort select{width:100%;border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--panel);color:var(--text);font-size:14px;text-transform:none;letter-spacing:0}
      .sf-screen-method{padding:10px 12px;border-left:3px solid var(--blue);background:var(--panel);color:var(--muted);font-size:12px}.sf-screen-method strong{color:var(--text)}
      .sf-screen-rows{display:grid;gap:8px}.sf-screen-row{display:grid;grid-template-columns:48px minmax(150px,1.2fr) 120px 100px 115px 110px minmax(180px,1.3fr);gap:10px;align-items:center;width:100%;padding:12px;border:1px solid var(--border);border-radius:11px;background:var(--panel);text-align:left;color:var(--text);cursor:pointer}.sf-screen-row:hover{border-color:#2a5a8c}.sf-rank{font-weight:900;color:var(--muted)}.sf-symbol strong{font-size:16px}.sf-symbol small{display:block;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sf-bucket{display:inline-flex;width:max-content;border:1px solid currentColor;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:850}.sf-bucket.actionable{color:var(--green)}.sf-bucket.ready-soon{color:var(--blue)}.sf-bucket.pullback{color:var(--orange)}.sf-bucket.avoid{color:var(--red)}.sf-bucket.watch,.sf-bucket.discovery{color:var(--yellow)}.sf-num strong{display:block}.sf-num small{display:block;color:var(--muted);font-size:10px}.sf-gates{font-weight:800}.sf-gates small{display:block;color:var(--muted);font-weight:400}.sf-reason{color:var(--muted);font-size:11px}.sf-reason strong{display:block;color:var(--text);font-size:11px;margin-bottom:2px}.sf-empty{padding:22px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);text-align:center}
      @media(max-width:1100px){.sf-screen-stats{grid-template-columns:repeat(3,1fr)}.sf-screen-row{grid-template-columns:42px 1fr 110px 95px 100px}.sf-screen-row .sf-hide-md{display:none}}
      @media(max-width:760px){.sf-screen-hero{align-items:flex-start;flex-direction:column}.sf-screen-controls{grid-template-columns:1fr}.sf-screen-stats{grid-template-columns:repeat(2,1fr)}.sf-screen-row{grid-template-columns:36px minmax(0,1fr) auto;align-items:start}.sf-screen-row .sf-mobile-hide{display:none}.sf-reason{grid-column:2/-1}.sf-symbol small{white-space:normal}.sf-screen-actions{width:100%}.sf-screen-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function bindUi(){
    document.getElementById('sfScreenRefresh').addEventListener('click',loadScreener);
    document.getElementById('sfScreenBack').addEventListener('click',showDashboard);
    document.getElementById('sfScreenSearch').addEventListener('input',e=>{state.query=e.target.value.trim().toUpperCase();renderRows();});
    document.getElementById('sfScreenSort').addEventListener('change',e=>{state.sort=e.target.value;renderRows();});
    const dashboard=document.getElementById('dashboardNavBtn');
    const screener=document.getElementById('screenerNavBtn');
    if(dashboard)dashboard.addEventListener('click',showDashboard);
    if(screener)screener.addEventListener('click',showScreener);
  }

  function renderFilters(){
    const filters=['ALL','ACTIONABLE','READY SOON','PULLBACK','WATCH','DISCOVERY','AVOID'];
    const root=document.getElementById('sfScreenFilters');
    root.innerHTML=filters.map(f=>`<button type="button" class="sf-filter ${state.filter===f?'active':''}" data-filter="${f}">${f}</button>`).join('');
    root.querySelectorAll('.sf-filter').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.filter;renderFilters();renderRows();}));
  }

  async function loadScreener(){
    const root=document.getElementById('sfScreenRows');
    root.innerHTML='<div class="sf-empty">Ranking cached market discovery…</div>';
    try{
      const res=await fetch(`${apiBase()}/api/screener?limit=40`,{headers:{accept:'application/json'}});
      const body=await res.json();
      if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);
      const screener=body.screener||{};
      state.rows=Array.isArray(screener.rows)?screener.rows:[];
      renderStats(screener.coverage||{});
      renderRows();
    }catch(error){
      root.innerHTML=`<div class="sf-empty">Smart Screener unavailable: ${esc(error.message||'request failed')}</div>`;
    }
  }

  function renderStats(c){
    const actionable=state.rows.filter(r=>r.bucket==='ACTIONABLE').length;
    const ready=state.rows.filter(r=>r.bucket==='READY SOON').length;
    document.getElementById('sfScreenStats').innerHTML=[
      [c.catalogSize||0,'Eligible catalog'],
      [c.weeklyPool||0,'Rotating pool'],
      [c.scannedSymbols||0,'With discovery history'],
      [actionable,'Buy-ready now'],
      [ready,'Ready soon']
    ].map(([n,label])=>`<div class="sf-stat"><strong>${fmtCompact(n)}</strong><span>${label}</span></div>`).join('');
  }

  function renderRows(){
    const q=state.query;
    let rows=state.rows.filter(r=>state.filter==='ALL'||r.bucket===state.filter).filter(r=>!q||String(r.symbol).includes(q)||String(r.name||'').toUpperCase().includes(q));
    rows=[...rows].sort((a,b)=>Number(b[state.sort]||0)-Number(a[state.sort]||0)||Number(b.screenScore||0)-Number(a.screenScore||0));
    const root=document.getElementById('sfScreenRows');
    if(!rows.length){root.innerHTML='<div class="sf-empty">No candidates match this filter yet.</div>';return;}
    root.innerHTML=rows.map((r,i)=>{
      const bucketClass=String(r.bucket||'WATCH').toLowerCase().replace(/\s+/g,'-');
      const gateText=r.deepAnalysis?`${r.gatesReady}/${r.gateTotal}`:'—';
      const status=r.deepAnalysis?r.status:'Discovery only';
      return `<button type="button" class="sf-screen-row" data-symbol="${esc(r.symbol)}">
        <span class="sf-rank">#${i+1}</span>
        <span class="sf-symbol"><strong>${esc(r.symbol)}</strong><small>${esc(r.name||r.symbol)}</small></span>
        <span><span class="sf-bucket ${bucketClass}">${esc(r.bucket)}</span></span>
        <span class="sf-num"><strong>${Number(r.screenScore||0).toFixed(1)}</strong><small>screen score</small></span>
        <span class="sf-num mobile-hide"><strong>${fmtPct(r.changePct)}</strong><small>price move</small></span>
        <span class="sf-num sf-mobile-hide"><strong>${Number(r.relativeVolume||0).toFixed(2)}x</strong><small>relative volume</small></span>
        <span class="sf-gates sf-mobile-hide">${gateText}<small>${esc(status)}</small></span>
        <span class="sf-reason"><strong>${esc(r.deepAnalysis?'Deep-analysis state':'Discovery candidate')}</strong>${esc(r.reason||'')}</span>
      </button>`;
    }).join('');
    root.querySelectorAll('.sf-screen-row').forEach(btn=>btn.addEventListener('click',()=>openSymbol(btn.dataset.symbol)));
  }

  function openSymbol(symbol){
    showDashboard();
    const input=document.getElementById('symbolInput');
    const load=document.getElementById('loadSymbolBtn');
    if(input)input.value=symbol;
    if(load)load.click();
  }

  function showScreener(){
    ensureUi();
    const view=document.getElementById('smartScreenerView');
    document.querySelectorAll('.main-content > section').forEach(section=>{section.hidden=section!==view;});
    document.getElementById('dashboardNavBtn')?.classList.remove('active');
    document.getElementById('screenerNavBtn')?.classList.add('active');
    view.hidden=false;
    loadScreener();
  }

  function showDashboard(){
    const view=document.getElementById('smartScreenerView');
    document.querySelectorAll('.main-content > section').forEach(section=>{if(section!==view)section.hidden=false;});
    if(view)view.hidden=true;
    document.getElementById('screenerNavBtn')?.classList.remove('active');
    document.getElementById('dashboardNavBtn')?.classList.add('active');
  }

  ensureUi();
})();
