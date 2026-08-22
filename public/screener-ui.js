(() => {
  'use strict';
  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const state={rows:[],simulation:null,filter:'ALL',sort:'screenScore',query:''};
  const fmtMoney=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v)||0);
  const fmtPct=v=>`${Number(v)>=0?'+':''}${(Number(v||0)*100).toFixed(2)}%`;
  const fmtPctRaw=v=>`${Number(v)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const fmtCompact=v=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v)||0);
  const fmtDate=v=>Number(v)?new Date(Number(v)).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
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
    ensureSimulationUi(main);
    injectStyles();
    bindUi();
    renderFilters();
  }

  function ensureSimulationUi(main){
    const nav=document.querySelector('.topnav');
    if(nav&&!document.getElementById('simulationNavBtn')){
      const btn=document.createElement('button');
      btn.id='simulationNavBtn';btn.className='nav-btn';btn.type='button';btn.textContent='Simulation';
      nav.appendChild(btn);
    }
    if(document.getElementById('simulationView'))return;
    const section=document.createElement('section');
    section.id='simulationView';section.className='sf-sim-view';section.hidden=true;
    section.innerHTML=`
      <div class="sf-screen-hero sf-sim-hero">
        <div><div class="eyebrow">Forward paper trading</div><h1>Can SignalForge make the right trades?</h1><p>This account starts now and only acts on signals that happen after the simulator starts. No future data and no retroactive cherry-picking.</p></div>
        <div class="sf-screen-actions"><button id="sfSimRefresh" type="button">Refresh simulation</button><button id="sfSimBack" type="button">Back to dashboard</button></div>
      </div>
      <div id="sfSimStatus" class="sf-sim-status"></div>
      <div id="sfSimStats" class="sf-sim-stats"></div>
      <div class="sf-sim-grid">
        <section class="sf-sim-panel"><div class="sf-sim-panel-head"><div><div class="eyebrow">Account curve</div><h2>Paper equity</h2></div><span id="sfSimStarted"></span></div><canvas id="sfSimChart" height="220"></canvas></section>
        <section class="sf-sim-panel"><div class="eyebrow">Rules locked before entry</div><h2>Simulation assumptions</h2><div id="sfSimRules" class="sf-sim-rules"></div></section>
      </div>
      <section class="sf-sim-panel"><div class="sf-sim-panel-head"><div><div class="eyebrow">Current virtual holdings</div><h2>Open paper positions</h2></div><span id="sfSimOpenCount"></span></div><div id="sfSimPositions" class="sf-sim-table-wrap"></div></section>
      <section class="sf-sim-panel"><div class="sf-sim-panel-head"><div><div class="eyebrow">Audit trail</div><h2>Closed paper trades</h2></div><span id="sfSimTradeCount"></span></div><div id="sfSimTrades" class="sf-sim-table-wrap"></div></section>
    `;
    main.prepend(section);
  }

  function injectStyles(){
    if(document.getElementById('sfScreenerStyles'))return;
    const style=document.createElement('style');
    style.id='sfScreenerStyles';
    style.textContent=`
      .sf-screen-view,.sf-sim-view{display:grid;gap:14px}.sf-screen-view[hidden],.sf-sim-view[hidden]{display:none!important}
      .sf-screen-hero{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:18px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(135deg,#0c1728,#10223a)}
      .sf-screen-hero h1{margin:2px 0 6px;font-size:24px}.sf-screen-hero p{margin:0;color:var(--muted);max-width:720px}.sf-screen-actions{display:flex;gap:8px;flex-wrap:wrap}.sf-screen-actions button{border:1px solid var(--border);border-radius:9px;padding:9px 12px;background:var(--panel-2);cursor:pointer}
      .sf-screen-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.sf-stat{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}.sf-stat strong{display:block;font-size:20px}.sf-stat span{display:block;color:var(--muted);font-size:11px;margin-top:2px}
      .sf-screen-controls{display:grid;grid-template-columns:minmax(0,1fr) 190px 180px;gap:10px;align-items:end}.sf-screen-filters{display:flex;gap:6px;flex-wrap:wrap}.sf-filter{border:1px solid var(--border);background:var(--panel-2);color:var(--muted);border-radius:999px;padding:7px 10px;cursor:pointer}.sf-filter.active{color:var(--text);border-color:#2a5a8c;background:#17375a}.sf-screen-search,.sf-screen-sort{display:grid;gap:4px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.sf-screen-search input,.sf-screen-sort select{width:100%;border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--panel);color:var(--text);font-size:14px;text-transform:none;letter-spacing:0}
      .sf-screen-method{padding:10px 12px;border-left:3px solid var(--blue);background:var(--panel);color:var(--muted);font-size:12px}.sf-screen-method strong{color:var(--text)}
      .sf-screen-rows{display:grid;gap:8px}.sf-screen-row{display:grid;grid-template-columns:48px minmax(150px,1.2fr) 120px 100px 115px 110px minmax(180px,1.3fr);gap:10px;align-items:center;width:100%;padding:12px;border:1px solid var(--border);border-radius:11px;background:var(--panel);text-align:left;color:var(--text);cursor:pointer}.sf-screen-row:hover{border-color:#2a5a8c}.sf-rank{font-weight:900;color:var(--muted)}.sf-symbol strong{font-size:16px}.sf-symbol small{display:block;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sf-bucket{display:inline-flex;width:max-content;border:1px solid currentColor;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:850}.sf-bucket.actionable{color:var(--green)}.sf-bucket.ready-soon{color:var(--blue)}.sf-bucket.pullback{color:var(--orange)}.sf-bucket.avoid{color:var(--red)}.sf-bucket.watch,.sf-bucket.discovery{color:var(--yellow)}.sf-num strong{display:block}.sf-num small{display:block;color:var(--muted);font-size:10px}.sf-gates{font-weight:800}.sf-gates small{display:block;color:var(--muted);font-weight:400}.sf-reason{color:var(--muted);font-size:11px}.sf-reason strong{display:block;color:var(--text);font-size:11px;margin-bottom:2px}.sf-empty{padding:22px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);text-align:center}
      .sf-sim-hero{background:linear-gradient(135deg,#0b1d19,#10243a)}.sf-sim-status{padding:11px 13px;border:1px solid var(--border);border-radius:10px;background:var(--panel);color:var(--muted);font-size:12px}.sf-sim-status strong{color:var(--text)}
      .sf-sim-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.sf-sim-stat{padding:13px;border:1px solid var(--border);border-radius:11px;background:var(--panel)}.sf-sim-stat strong{display:block;font-size:20px}.sf-sim-stat span{display:block;color:var(--muted);font-size:10px;margin-top:3px;text-transform:uppercase;letter-spacing:.05em}.sf-sim-stat.positive strong{color:var(--green)}.sf-sim-stat.negative strong{color:var(--red)}
      .sf-sim-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.7fr);gap:14px}.sf-sim-panel{border:1px solid var(--border);border-radius:14px;background:var(--panel);padding:15px;min-width:0}.sf-sim-panel h2{margin:2px 0 10px;font-size:18px}.sf-sim-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.sf-sim-panel-head>span{color:var(--muted);font-size:11px}.sf-sim-rules{display:grid;gap:8px}.sf-sim-rule{padding:9px 10px;border:1px solid var(--border);border-radius:9px;background:var(--panel-2);font-size:12px}.sf-sim-rule strong{display:block;margin-bottom:2px}.sf-sim-rule span{color:var(--muted)}
      #sfSimChart{width:100%;height:220px;display:block;border-radius:10px;background:#08111f}.sf-sim-table-wrap{overflow-x:auto}.sf-sim-table{width:100%;border-collapse:collapse;min-width:760px}.sf-sim-table th,.sf-sim-table td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--border);font-size:11px;white-space:nowrap}.sf-sim-table th{color:var(--muted);font-weight:700}.sf-sim-table td strong{font-size:12px}.sf-pnl-pos{color:var(--green)}.sf-pnl-neg{color:var(--red)}.sf-sim-note{padding:20px;color:var(--muted);text-align:center;border:1px dashed var(--border);border-radius:10px}
      @media(max-width:1100px){.sf-screen-stats{grid-template-columns:repeat(3,1fr)}.sf-screen-row{grid-template-columns:42px 1fr 110px 95px 100px}.sf-screen-row .sf-hide-md{display:none}.sf-sim-stats{grid-template-columns:repeat(3,1fr)}.sf-sim-grid{grid-template-columns:1fr}}
      @media(max-width:760px){.sf-screen-hero{align-items:flex-start;flex-direction:column}.sf-screen-controls{grid-template-columns:1fr}.sf-screen-stats{grid-template-columns:repeat(2,1fr)}.sf-screen-row{grid-template-columns:36px minmax(0,1fr) auto;align-items:start}.sf-screen-row .sf-mobile-hide{display:none}.sf-reason{grid-column:2/-1}.sf-symbol small{white-space:normal}.sf-screen-actions{width:100%}.sf-screen-actions button{flex:1}.sf-sim-stats{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function bindUi(){
    document.getElementById('sfScreenRefresh').addEventListener('click',loadScreener);
    document.getElementById('sfScreenBack').addEventListener('click',showDashboard);
    document.getElementById('sfScreenSearch').addEventListener('input',e=>{state.query=e.target.value.trim().toUpperCase();renderRows();});
    document.getElementById('sfScreenSort').addEventListener('change',e=>{state.sort=e.target.value;renderRows();});
    document.getElementById('sfSimRefresh')?.addEventListener('click',loadSimulation);
    document.getElementById('sfSimBack')?.addEventListener('click',showDashboard);
    const dashboard=document.getElementById('dashboardNavBtn');
    const screener=document.getElementById('screenerNavBtn');
    const simulation=document.getElementById('simulationNavBtn');
    if(dashboard)dashboard.addEventListener('click',showDashboard);
    if(screener)screener.addEventListener('click',showScreener);
    if(simulation)simulation.addEventListener('click',showSimulation);
  }

  function renderFilters(){
    const filters=['ALL','ACTIONABLE','READY SOON','PULLBACK','WATCH','DISCOVERY','AVOID'];
    const root=document.getElementById('sfScreenFilters');
    root.innerHTML=filters.map(f=>`<button type="button" class="sf-filter ${state.filter===f?'active':''}" data-filter="${f}">${f}</button>`).join('');
    root.querySelectorAll('.sf-filter').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.filter;renderFilters();renderRows();}));
  }

  async function fetchScreener(){
    const res=await fetch(`${apiBase()}/api/screener?limit=40`,{headers:{accept:'application/json'}});
    const body=await res.json();
    if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);
    const screener=body.screener||{};
    state.rows=Array.isArray(screener.rows)?screener.rows:[];
    state.simulation=screener.simulation||null;
    return screener;
  }

  async function loadScreener(){
    const root=document.getElementById('sfScreenRows');
    root.innerHTML='<div class="sf-empty">Ranking cached market discovery…</div>';
    try{
      const screener=await fetchScreener();
      renderStats(screener.coverage||{});
      renderRows();
    }catch(error){
      root.innerHTML=`<div class="sf-empty">Smart Screener unavailable: ${esc(error.message||'request failed')}</div>`;
    }
  }

  async function loadSimulation(){
    const status=document.getElementById('sfSimStatus');
    if(status)status.textContent='Refreshing forward paper account from saved SignalForge signals…';
    try{await fetchScreener();renderSimulation();}
    catch(error){if(status)status.innerHTML=`<strong>Simulation unavailable.</strong> ${esc(error.message||'request failed')}`;}
  }

  function renderStats(c){
    const actionable=state.rows.filter(r=>r.bucket==='ACTIONABLE').length;
    const ready=state.rows.filter(r=>r.bucket==='READY SOON').length;
    document.getElementById('sfScreenStats').innerHTML=[
      [c.catalogSize||0,'Eligible catalog'],[c.weeklyPool||0,'Rotating pool'],[c.scannedSymbols||0,'With discovery history'],[actionable,'Buy-ready now'],[ready,'Ready soon']
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
      return `<button type="button" class="sf-screen-row" data-symbol="${esc(r.symbol)}"><span class="sf-rank">#${i+1}</span><span class="sf-symbol"><strong>${esc(r.symbol)}</strong><small>${esc(r.name||r.symbol)}</small></span><span><span class="sf-bucket ${bucketClass}">${esc(r.bucket)}</span></span><span class="sf-num"><strong>${Number(r.screenScore||0).toFixed(1)}</strong><small>screen score</small></span><span class="sf-num mobile-hide"><strong>${fmtPctRaw(r.changePct)}</strong><small>price move</small></span><span class="sf-num sf-mobile-hide"><strong>${Number(r.relativeVolume||0).toFixed(2)}x</strong><small>relative volume</small></span><span class="sf-gates sf-mobile-hide">${gateText}<small>${esc(status)}</small></span><span class="sf-reason"><strong>${esc(r.deepAnalysis?'Deep-analysis state':'Discovery candidate')}</strong>${esc(r.reason||'')}</span></button>`;
    }).join('');
    root.querySelectorAll('.sf-screen-row').forEach(btn=>btn.addEventListener('click',()=>openSymbol(btn.dataset.symbol)));
  }

  function renderSimulation(){
    const s=state.simulation;
    if(!s){document.getElementById('sfSimStatus').innerHTML='<strong>Waiting for simulator.</strong> No paper account snapshot was returned yet.';return;}
    const trades=Array.isArray(s.closedTrades)?s.closedTrades:[],positions=Array.isArray(s.openPositions)?s.openPositions:[];
    document.getElementById('sfSimStatus').innerHTML=`<strong>${esc(s.mode||'FORWARD PAPER TEST')}</strong> · Starts with ${fmtMoney(s.startingCash)}. New positions open only after a real <strong>BUY NOW</strong> event. Existing historical signals are not counted as trades.`;
    const pf=s.profitFactor===null?'∞':Number(s.profitFactor||0).toFixed(2);
    document.getElementById('sfSimStats').innerHTML=[
      [fmtMoney(s.equity),'Account value',Number(s.totalPnl)>=0?'positive':'negative'],
      [fmtMoney(s.totalPnl),'Total P/L',Number(s.totalPnl)>=0?'positive':'negative'],
      [fmtPct(s.returnPct),'Return',Number(s.returnPct)>=0?'positive':'negative'],
      [`${Number(s.winRate||0)*100 .toFixed?.(1)||0}%`,'Win rate',''],
      [pf,'Profit factor',''],
      [fmtPct(s.maxDrawdown),'Max drawdown',Number(s.maxDrawdown)<0?'negative':'']
    ].map(([value,label,cls])=>`<div class="sf-sim-stat ${cls}"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
    document.getElementById('sfSimStarted').textContent=`Started ${fmtDate(s.startedAt)}`;
    document.getElementById('sfSimOpenCount').textContent=`${positions.length} open`;
    document.getElementById('sfSimTradeCount').textContent=`${trades.length} closed`;
    renderRules(s.assumptions||{});
    renderPositions(positions);
    renderTrades(trades);
    drawSimulationChart(Array.isArray(s.curve)?s.curve:[]);
  }

  function renderRules(a){
    const rows=[
      ['Entry',a.entryRule||'Open only on a new BUY NOW signal.'],
      ['Exit',a.exitRule||'Exit on SELL / EXIT, stop, or target.'],
      ['Risk per trade',`${(Number(a.riskPerTrade||0)*100).toFixed(1)}% of paper equity`],
      ['Max position',`${(Number(a.maxPositionPct||0)*100).toFixed(0)}% of paper equity`],
      ['Slippage',`${(Number(a.slippagePct||0)*100).toFixed(3)}% each side`],
      ['Look-ahead','Disabled — decisions use only information available at the signal time.']
    ];
    document.getElementById('sfSimRules').innerHTML=rows.map(([k,v])=>`<div class="sf-sim-rule"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join('');
  }

  function renderPositions(rows){
    const root=document.getElementById('sfSimPositions');
    if(!rows.length){root.innerHTML='<div class="sf-sim-note">No paper positions yet. SignalForge has to generate a new BUY NOW after the forward test starts.</div>';return;}
    root.innerHTML=`<table class="sf-sim-table"><thead><tr><th>Symbol</th><th>Entry</th><th>Mark</th><th>Shares</th><th>Stop</th><th>Target</th><th>Unrealized</th><th>Status</th><th>Opened</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.symbol)}</strong></td><td>${fmtMoney(r.entryPrice)}</td><td>${fmtMoney(r.mark)}</td><td>${Number(r.shares||0).toFixed(3)}</td><td>${fmtMoney(r.stopPrice)}</td><td>${fmtMoney(r.targetPrice)}</td><td class="${Number(r.unrealized)>=0?'sf-pnl-pos':'sf-pnl-neg'}">${fmtMoney(r.unrealized)} · ${fmtPct(r.unrealizedPct)}</td><td>${esc(r.currentStatus||'')}</td><td>${fmtDate(r.openedAt)}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderTrades(rows){
    const root=document.getElementById('sfSimTrades');
    if(!rows.length){root.innerHTML='<div class="sf-sim-note">No closed paper trades yet. This is expected at the beginning of a forward test.</div>';return;}
    root.innerHTML=`<table class="sf-sim-table"><thead><tr><th>Symbol</th><th>Entry</th><th>Exit</th><th>P/L</th><th>Return</th><th>Entry readiness</th><th>Exit</th><th>Held</th><th>Reason</th></tr></thead><tbody>${rows.map(r=>{const held=Math.max(0,Number(r.closedAt)-Number(r.openedAt));const hours=held/3600000;return`<tr><td><strong>${esc(r.symbol)}</strong></td><td>${fmtMoney(r.entryPrice)}</td><td>${fmtMoney(r.exitPrice)}</td><td class="${Number(r.pnl)>=0?'sf-pnl-pos':'sf-pnl-neg'}">${fmtMoney(r.pnl)}</td><td class="${Number(r.pnlPct)>=0?'sf-pnl-pos':'sf-pnl-neg'}">${fmtPct(r.pnlPct)}</td><td>${Number(r.entryReadiness||0).toFixed(0)}%</td><td>${esc(r.exitStatus)}</td><td>${hours<48?`${hours.toFixed(1)}h`:`${(hours/24).toFixed(1)}d`}</td><td>${esc(r.exitReason||'')}</td></tr>`;}).join('')}</tbody></table>`;
  }

  function drawSimulationChart(curve){
    const canvas=document.getElementById('sfSimChart');if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(280,rect.width),h=220;
    canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle='#08111f';c.fillRect(0,0,w,h);
    if(!curve.length){c.fillStyle='#8da1ba';c.font='12px system-ui';c.fillText('Equity curve begins when the forward test starts.',16,30);return;}
    const vals=curve.map(x=>Number(x.equity)||0),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(1,max-min),pad=18;
    c.strokeStyle='#1b2d43';c.lineWidth=1;for(let i=0;i<4;i++){const y=pad+i*(h-2*pad)/3;c.beginPath();c.moveTo(pad,y);c.lineTo(w-pad,y);c.stroke();}
    c.strokeStyle='#4ea1ff';c.lineWidth=2;c.beginPath();curve.forEach((p,i)=>{const x=pad+i/Math.max(1,curve.length-1)*(w-2*pad),y=pad+(max-Number(p.equity||0))/span*(h-2*pad);if(i===0)c.moveTo(x,y);else c.lineTo(x,y);});c.stroke();
    c.fillStyle='#8da1ba';c.font='10px system-ui';c.fillText(fmtMoney(max),pad,12);c.fillText(fmtMoney(min),pad,h-5);
  }

  function openSymbol(symbol){showDashboard();const input=document.getElementById('symbolInput'),load=document.getElementById('loadSymbolBtn');if(input)input.value=symbol;if(load)load.click();}

  function setActiveNav(id){['dashboardNavBtn','screenerNavBtn','simulationNavBtn'].forEach(x=>document.getElementById(x)?.classList.toggle('active',x===id));}
  function showScreener(){ensureUi();const view=document.getElementById('smartScreenerView');document.querySelectorAll('.main-content > section').forEach(section=>{section.hidden=section!==view;});setActiveNav('screenerNavBtn');view.hidden=false;loadScreener();}
  function showSimulation(){ensureUi();const view=document.getElementById('simulationView');document.querySelectorAll('.main-content > section').forEach(section=>{section.hidden=section!==view;});setActiveNav('simulationNavBtn');view.hidden=false;loadSimulation();}
  function showDashboard(){const screener=document.getElementById('smartScreenerView'),sim=document.getElementById('simulationView');document.querySelectorAll('.main-content > section').forEach(section=>{if(section!==screener&&section!==sim)section.hidden=false;});if(screener)screener.hidden=true;if(sim)sim.hidden=true;setActiveNav('dashboardNavBtn');}

  ensureUi();
})();
