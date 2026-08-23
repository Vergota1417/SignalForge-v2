(() => {
  'use strict';
  const API=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number.isFinite(Number(v))&&Number(v)>0?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v)):'—';
  const pct=v=>`${(Number(v||0)*100).toFixed(1)}%`;
  const dt=v=>Number(v)?new Date(Number(v)).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';

  function install(){
    const view=document.getElementById('smartScreenerView');
    if(!view||document.getElementById('sfWeekendIntel'))return Boolean(view);
    const panel=document.createElement('section');
    panel.id='sfWeekendIntel';panel.className='sf-weekend-intel';
    const stats=view.querySelector('#sfScreenStats');
    (stats||view.firstElementChild).insertAdjacentElement('afterend',panel);
    injectStyles();
    document.getElementById('sfScreenRefresh')?.addEventListener('click',()=>setTimeout(load,80));
    document.getElementById('screenerNavBtn')?.addEventListener('click',()=>setTimeout(load,100));
    load();return true;
  }

  function injectStyles(){
    if(document.getElementById('sfWeekendStyles'))return;
    const s=document.createElement('style');s.id='sfWeekendStyles';s.textContent=`
      .sf-weekend-intel{display:grid;gap:10px;padding:14px;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
      .sf-wi-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sf-wi-head h2{margin:2px 0 4px;font-size:18px}.sf-wi-head p{margin:0;color:var(--muted);font-size:12px}.sf-wi-lock{border:1px solid var(--orange);color:var(--orange);border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800;white-space:nowrap}
      .sf-wi-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.sf-wi-stat{padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--panel-2)}.sf-wi-stat strong{display:block;font-size:17px}.sf-wi-stat span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}
      .sf-wi-list{display:grid;gap:7px}.sf-wi-row{display:grid;grid-template-columns:110px 180px 85px 110px minmax(190px,1fr);gap:9px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2);cursor:pointer;color:var(--text);text-align:left;width:100%}.sf-wi-row>span{min-width:0}.sf-wi-symbolblock,.sf-wi-stateblock{display:grid;gap:3px}.sf-wi-symbolblock strong{font-size:14px}.sf-wi-status{display:block;font-size:10px;font-weight:850;line-height:1.3}.sf-wi-status.monday{color:var(--green)}.sf-wi-status.high{color:var(--blue)}.sf-wi-status.pullback{color:var(--orange)}.sf-wi-status.reject{color:var(--red)}.sf-wi-status.confirm{color:var(--yellow)}.sf-wi-small{display:block;color:var(--muted);font-size:10px;line-height:1.35}.sf-wi-change.up{color:var(--green)}.sf-wi-change.down{color:var(--red)}.sf-wi-plan{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.sf-wi-plan span{color:var(--muted);font-size:9px}.sf-wi-empty{padding:12px;color:var(--muted);font-size:11px;border:1px dashed var(--border);border-radius:9px}
      @media(max-width:900px){.sf-wi-summary{grid-template-columns:repeat(3,1fr)}.sf-wi-row{grid-template-columns:85px minmax(140px,1fr) 70px}.sf-wi-row .sf-wi-hide{display:none}}
      @media(max-width:620px){.sf-wi-head{flex-direction:column}.sf-wi-summary{grid-template-columns:repeat(2,1fr)}.sf-wi-row{grid-template-columns:1fr;gap:7px}.sf-wi-score{display:block}.sf-wi-score strong,.sf-wi-score .sf-wi-small{display:inline;margin-right:6px}.sf-wi-reason{grid-column:auto}.sf-wi-plan{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.sf-wi-lock{white-space:normal}}
    `;document.head.appendChild(s);
  }

  async function load(){
    const root=document.getElementById('sfWeekendIntel');if(!root)return;
    root.innerHTML='<div class="sf-wi-empty">Loading weekend research status…</div>';
    try{
      const res=await fetch(`${API()}/api/screener?limit=40`,{headers:{accept:'application/json'}}),body=await res.json();
      if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);
      render(root,body.screener||{});
    }catch(e){root.innerHTML=`<div class="sf-wi-empty">Weekend Intelligence unavailable: ${esc(e.message||'request failed')}</div>`;}
  }

  function render(root,screener){
    const mode=screener.marketMode||{},report=screener.weekendIntelligence;
    if(!mode.weekend){root.hidden=true;return;}root.hidden=false;
    if(!mode.weekendResearchWindowOpen){
      root.innerHTML=`<div class="sf-wi-head"><div><div class="eyebrow">Weekend Intelligence</div><h2>Saturday research is scheduled</h2><p>${esc(mode.executionMessage||'Weekend results are planning-only.')}</p></div><span class="sf-wi-lock">NO WEEKEND EXECUTION</span></div><div class="sf-wi-empty">Today’s weekend research window has not opened yet. After the scheduled research cycle, this panel will show what SignalForge found and what deserves Monday attention.</div>`;return;
    }
    if(!report){root.innerHTML='<div class="sf-wi-empty">The weekend research window is open, but no report has been saved yet. Refresh after the research cycle completes.</div>';return;}
    const c=report.counts||{},rows=Array.isArray(report.candidates)?report.candidates:[];
    root.innerHTML=`
      <div class="sf-wi-head"><div><div class="eyebrow">Weekend Intelligence · ${esc(report.weekKey||'')}</div><h2>What SignalForge found while the market is closed</h2><p>Generated ${esc(dt(report.generatedAt))} · ${esc(report.nextAction||mode.executionMessage||'Fresh Monday confirmation required.')}</p></div><span class="sf-wi-lock">RESEARCH ONLY · RECONFIRM MONDAY</span></div>
      <div class="sf-wi-summary">
        ${stat(report.researchedCount||0,'Researched')}${stat(c.mondayCandidates||0,'Monday candidates')}${stat(c.highPriority||0,'High priority')}${stat(c.pullback||0,'Pullback')}${stat(c.rejected||0,'Rejected')}
      </div>
      <div class="sf-wi-list">${rows.length?rows.map(rowHtml).join(''):'<div class="sf-wi-empty">No candidates were available for this weekend report.</div>'}</div>`;
    root.querySelectorAll('[data-wi-symbol]').forEach(btn=>btn.addEventListener('click',()=>openSymbol(btn.dataset.wiSymbol)));
  }

  function stat(v,label){return`<div class="sf-wi-stat"><strong>${Number(v)||0}</strong><span>${esc(label)}</span></div>`;}
  function rowHtml(r){
    const cls=r.weekendStatus==='MONDAY CANDIDATE'?'monday':r.weekendStatus==='HIGH-PRIORITY WATCH'?'high':r.weekendStatus==='PULLBACK CANDIDATE'?'pullback':r.weekendStatus==='REJECTED'?'reject':'confirm';
    const delta=Number(r.scoreChange),change=r.changeLabel==='NEW'?'NEW':Number.isFinite(delta)?`${delta>=0?'+':''}${delta.toFixed(1)}`:'—',changeClass=delta>=5?'up':delta<=-5?'down':'';
    return`<button type="button" class="sf-wi-row" data-wi-symbol="${esc(r.symbol)}">
      <span class="sf-wi-symbolblock"><strong>${esc(r.symbol)}</strong><span class="sf-wi-small">${esc(r.liveStatus||'')}</span></span>
      <span class="sf-wi-stateblock"><span class="sf-wi-status ${cls}">${esc(r.weekendStatus)}</span><span class="sf-wi-small">${esc(r.confidenceLabel||'')} · ${Number(r.gatesReady)||0}/4 hist. gates</span></span>
      <span class="sf-wi-score"><strong>${Number(r.confirmationScore||0).toFixed(0)}/100</strong><span class="sf-wi-small">confirmation</span></span>
      <span class="sf-wi-hide"><strong class="sf-wi-change ${changeClass}">${esc(change)}</strong><span class="sf-wi-small">${esc(r.changeLabel||'')}</span></span>
      <span class="sf-wi-reason"><span class="sf-wi-small">${esc(r.reason||'')}</span><span class="sf-wi-plan"><span>Entry ${money(r.preferredEntryLow)}–${money(r.preferredEntryHigh)}</span><span>Max chase ${money(r.maxChasePrice)}</span><span>Stop ${money(r.thesisBreak)}</span><span>Target ${money(r.target)}</span><span>Hist win ${pct(r.winRate)}</span></span></span>
    </button>`;
  }

  function openSymbol(symbol){document.getElementById('dashboardNavBtn')?.click();const input=document.getElementById('symbolInput');if(input)input.value=symbol;document.getElementById('loadSymbolBtn')?.click();}

  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer);},250);}
})();
