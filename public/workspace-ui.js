(() => {
  'use strict';

  let organizeTimer=null;
  const ANALYSIS_SELECTORS=['.decision-card','#sfUnifiedSelected','.engine-section','.bottom-grid','#sfSessionRangeShadow','#sfOpeningRangeShadow','#sfActivityRhythmCard','#sfAuctionMethod','#sfDetectionAudit'];
  const SYSTEM_SELECTORS=['#sfProviderHealth','#sfExecutionTrace'];

  function injectStyles(){
    if(document.getElementById('sfWorkspaceStyles'))return;
    const style=document.createElement('style');style.id='sfWorkspaceStyles';style.textContent=`
      .topnav{display:flex;gap:4px;max-width:100%;overflow-x:auto;scrollbar-width:none}.topnav::-webkit-scrollbar{display:none}.topnav .nav-btn{flex:0 0 auto}
      .sf-workspace-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:13px 14px;border:1px solid var(--border);border-radius:13px;background:linear-gradient(135deg,rgba(78,161,255,.07),var(--panel-2));margin-bottom:2px}.sf-workspace-head h1{margin:2px 0 0;font-size:19px}.sf-workspace-head p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.4}.sf-workspace-symbol{font-size:12px;font-weight:950;color:#7ebcff;white-space:nowrap}
      body.sf-view-analysis .page-grid,body.sf-view-system .page-grid,body.sf-view-screener .page-grid,body.sf-view-simulation .page-grid,body.sf-view-portfolio .page-grid,body.sf-view-alerts .page-grid{grid-template-columns:minmax(0,1fr)!important}
      body.sf-view-analysis .sidebar,body.sf-view-system .sidebar,body.sf-view-screener .sidebar,body.sf-view-simulation .sidebar,body.sf-view-portfolio .sidebar,body.sf-view-alerts .sidebar{display:none!important}
      body:not(.sf-view-screener) #sfMarketCrawler{display:none!important}
      body.sf-cockpit-mode.sf-view-analysis #sfAnalysisDock{display:grid!important}body.sf-cockpit-mode.sf-view-system #sfSystemDock{display:grid!important}
      body.sf-view-analysis #sfAnalysisDock,body.sf-view-system #sfSystemDock{gap:10px;max-width:1180px;width:100%;margin:0 auto}
      body.sf-view-analysis #sfAnalysisDock>.decision-card{display:block!important;width:auto!important;max-width:none!important}
      .sf-cockpit-controls{display:none!important}
      body.sf-view-dashboard .sf-cockpit-groups{grid-template-columns:minmax(0,1fr)!important}body.sf-view-dashboard .sf-cockpit-groups .sf-cockpit-group:nth-of-type(2){display:none!important}
      body.sf-view-dashboard .sf-cockpit-help{display:none!important}
      body.sf-view-dashboard .radar-item:nth-child(n+4){display:none!important}body.sf-view-dashboard .radar-card-foot,body.sf-view-dashboard .radar-unified-reason,body.sf-view-dashboard #sfRadarLiveRule{display:none!important}
      body.sf-view-dashboard .radar-unified{padding:6px!important;gap:4px!important}.sf-radar-more{width:100%;margin-top:7px;padding:7px 9px;border:1px solid #2a5a8c;border-radius:8px;background:#10243b;color:#9fc9f5;font-size:9px;font-weight:900;cursor:pointer}
      body.sf-view-dashboard .chart-action{display:none!important}.sf-chart-details-toggle{margin-left:auto;border:1px solid var(--border);background:var(--panel-2);color:var(--muted);border-radius:7px;padding:5px 8px;font-size:9px;font-weight:850;cursor:pointer}.sf-chart-details-toggle.active{color:var(--text);border-color:#2a5a8c;background:#132b47}
      body.sf-view-dashboard .chart-card:not(.sf-chart-details-open) #sfChartDecisionContext,body.sf-view-dashboard .chart-card:not(.sf-chart-details-open) .sf-volume-wrap,body.sf-view-dashboard .chart-card:not(.sf-chart-details-open) .sf-marker-note,body.sf-view-dashboard .chart-card:not(.sf-chart-details-open) .sf-lod-status{display:none!important}
      body.sf-cockpit-mode.sf-view-dashboard #sfTradePlan[data-sf-plan-usable="0"]{display:none!important}
      .sf-dashboard-system{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:9px 0 0;padding:8px 10px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.015);cursor:pointer}.sf-dashboard-system-main{display:flex;align-items:center;gap:7px;min-width:0}.sf-dashboard-system-dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(47,209,139,.09)}.sf-dashboard-system.warn .sf-dashboard-system-dot{background:var(--orange);box-shadow:0 0 0 3px rgba(244,163,64,.09)}.sf-dashboard-system strong{font-size:9px;letter-spacing:.04em}.sf-dashboard-system span{font-size:8px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sf-dashboard-system-open{font-size:8px!important;color:#7ebcff!important;flex:0 0 auto}
      @media(max-width:760px){.topnav{order:3;width:100%;padding-bottom:2px}.sf-workspace-head{padding:11px}.sf-workspace-head h1{font-size:17px}.sf-dashboard-system{align-items:flex-start}.sf-dashboard-system-main{align-items:flex-start;flex-wrap:wrap}.sf-dashboard-system span{white-space:normal}.sf-radar-more{font-size:10px}}
    `;document.head.appendChild(style);
  }

  function selectedSymbol(){return String(window.SignalForgeSelection?.symbol||document.getElementById('tickerBadge')?.textContent||document.getElementById('symbolInput')?.value||'').trim().toUpperCase()||'—';}
  function ensureHeader(dock,kind){
    if(!dock)return;
    const id=kind==='analysis'?'sfAnalysisPageHead':'sfSystemPageHead';let head=document.getElementById(id);
    if(!head){head=document.createElement('section');head.id=id;head.className='sf-workspace-head';dock.prepend(head);}
    if(kind==='analysis')head.innerHTML=`<div><div class="eyebrow">Selected-stock reasoning</div><h1>Analysis</h1><p>Core gates, execution context, Auction Method and historical evidence. This page explains the decision; it does not create a separate trading signal.</p></div><div class="sf-workspace-symbol">${escapeHtml(selectedSymbol())}</div>`;
    else head.innerHTML=`<div><div class="eyebrow">Backend proof + diagnostics</div><h1>System</h1><p>Scheduler, providers, database, evidence, execution trace and self-test. Use this page to verify SignalForge itself is working.</p></div><div class="sf-workspace-symbol">${escapeHtml(selectedSymbol())}</div>`;
  }

  function moveInto(dock,selectors){
    if(!dock)return;
    for(const selector of selectors){const node=document.querySelector(selector);if(node&&node!==dock&&node.parentNode!==dock)dock.appendChild(node);}
  }

  function organizeDocks(){
    const analysis=document.getElementById('sfAnalysisDock'),system=document.getElementById('sfSystemDock');
    if(analysis){moveInto(analysis,ANALYSIS_SELECTORS);ensureHeader(analysis,'analysis');}
    if(system){moveInto(system,SYSTEM_SELECTORS);ensureHeader(system,'system');}
  }

  function ensureRadarMore(){
    const block=document.querySelector('.radar-block');if(!block||document.getElementById('sfRadarMore'))return;
    const button=document.createElement('button');button.id='sfRadarMore';button.className='sf-radar-more';button.type='button';button.textContent='Open Full Screener →';button.addEventListener('click',()=>document.getElementById('screenerNavBtn')?.click());
    const coverage=document.getElementById('radarCoverage');(coverage||block.lastElementChild)?.insertAdjacentElement('afterend',button);
  }

  function ensureChartDetails(){
    const card=document.querySelector('.chart-card'),head=card?.querySelector('.chart-head');if(!card||!head||head.querySelector('[data-sf-chart-details]'))return;
    const button=document.createElement('button');button.type='button';button.className='sf-chart-details-toggle';button.dataset.sfChartDetails='1';button.textContent='Chart details';button.title='Show candle diagnostics, crosshair calculations and volume details';
    button.addEventListener('click',()=>{const open=card.classList.toggle('sf-chart-details-open');button.classList.toggle('active',open);button.textContent=open?'Hide chart details':'Chart details';});head.appendChild(button);
  }

  function meaningfulText(el){const text=String(el?.textContent||'').trim();return text&&text!=='—'&&!/COLLECTING|UNRESOLVED|NOT AVAILABLE/i.test(text);}
  function updateTradePlan(){
    const plan=document.getElementById('sfTradePlan');if(!plan)return;
    const status=String(document.querySelector('[data-summary-action]')?.textContent||document.getElementById('statusBadge')?.textContent||'').toUpperCase();
    const actionable=/BUY|READY SOON|PULLBACK|SELL|EXIT/.test(status)&&!/AVOID/.test(status),entry=plan.querySelector('[data-entry]'),stop=plan.querySelector('[data-stop]');
    plan.dataset.sfPlanUsable=actionable&&meaningfulText(entry)&&meaningfulText(stop)?'1':'0';
  }

  function stateOk(text){return /HEALTHY|CONNECTED|SCHEDULED|RUNNING|PASS|ENABLED/i.test(String(text||''))&&!/FAIL|ERROR|OFFLINE/i.test(String(text||''));}
  function updateSystemMini(){
    const summary=document.getElementById('sfDecisionSummary');if(!summary)return;
    let root=document.getElementById('sfDashboardSystemHealth');if(!root){root=document.createElement('button');root.type='button';root.id='sfDashboardSystemHealth';root.className='sf-dashboard-system';root.innerHTML='<span class="sf-dashboard-system-main"><i class="sf-dashboard-system-dot"></i><strong>SYSTEM</strong><span data-sf-system-copy>Checking backend proof…</span></span><span class="sf-dashboard-system-open">View System →</span>';root.addEventListener('click',()=>document.getElementById('systemNavBtn')?.click());summary.appendChild(root);}
    const backend=document.getElementById('sfBackendState')?.textContent||document.getElementById('sfOpsHealth')?.textContent||'',market=document.getElementById('sfMarketState')?.textContent||'',scanner=document.getElementById('sfScannerState')?.textContent||document.getElementById('sfOpsRadar')?.textContent||'',errors=document.getElementById('sfOpsErrors')?.textContent||'';
    const known=Boolean(backend||market||scanner),healthy=known&&stateOk(backend)&&stateOk(market)&&stateOk(scanner)&&!/^\s*[1-9]\d*\s*\//.test(errors);
    root.classList.toggle('warn',known&&!healthy);root.querySelector('strong').textContent=!known?'SYSTEM CHECKING':healthy?'SYSTEM HEALTHY':'SYSTEM CHECK';
    root.querySelector('[data-sf-system-copy]').textContent=!known?'Loading backend status…':`Market ${stateOk(market)?'✓':'⚠'} · Scanner ${stateOk(scanner)?'✓':'⚠'} · Errors ${errors||'—'}`;
  }

  function retireLegacyExpansion(){
    try{localStorage.setItem('signalforge_cockpit_analysis_v1','0');localStorage.setItem('signalforge_cockpit_system_v1','0');localStorage.setItem('signalforge_show_details_v1','0');}catch{}
    document.body.classList.remove('sf-analysis-open','sf-system-open');
  }

  function organize(){injectStyles();retireLegacyExpansion();organizeDocks();ensureRadarMore();ensureChartDetails();updateTradePlan();updateSystemMini();}
  function schedule(){clearTimeout(organizeTimer);organizeTimer=setTimeout(organize,60);}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  document.body.classList.add('sf-view-dashboard');
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  window.addEventListener('signalforge:selected-symbol',schedule);
  window.addEventListener('signalforge:view-changed',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',organize,{once:true});else organize();
})();
