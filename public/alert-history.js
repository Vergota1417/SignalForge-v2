(() => {
  'use strict';
  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);

  function statusClass(status){
    if(status==='BUY NOW')return'buy';
    if(status==='SETUP — READY SOON')return'setup';
    if(status==='WAIT FOR PULLBACK')return'pullback';
    if(status==='WAIT — SETUP NOT READY')return'wait';
    if(status==='AVOID')return'avoid';
    return'sell';
  }

  function ensureUi(){
    const nav=[...document.querySelectorAll('.topnav .nav-btn')];
    const alertsBtn=nav.find(btn=>btn.textContent.trim()==='Alerts');
    if(!alertsBtn||document.getElementById('alertHistoryPanel'))return;
    alertsBtn.disabled=false;
    alertsBtn.removeAttribute('title');

    const panel=document.createElement('section');
    panel.id='alertHistoryPanel';
    panel.className='alert-history-panel';
    panel.hidden=true;
    panel.innerHTML=`
      <div class="alert-history-head">
        <div><div class="eyebrow">Saved in D1</div><h2>Alert History</h2><div class="muted">Every saved SignalForge status transition, newest first.</div></div>
        <div class="alert-history-actions"><button id="refreshAlertHistory" class="btn ghost" type="button">Refresh</button><button id="closeAlertHistory" class="btn ghost" type="button">Close</button></div>
      </div>
      <div id="alertHistoryList" class="alert-history-list"><div class="muted">Loading alerts…</div></div>`;
    document.querySelector('.main-content')?.prepend(panel);

    const style=document.createElement('style');
    style.textContent=`
      .alert-history-panel{margin-bottom:1rem;padding:1rem;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:#0a1423}
      .alert-history-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:.85rem}.alert-history-head h2{margin:.1rem 0 .2rem}.alert-history-actions{display:flex;gap:.5rem;flex-wrap:wrap}
      .alert-history-list{display:grid;gap:.55rem;max-height:65vh;overflow:auto;padding-right:.15rem}
      .alert-history-row{display:grid;grid-template-columns:minmax(80px,.8fr) minmax(170px,1.3fr) minmax(110px,.8fr) minmax(90px,.7fr) minmax(150px,1fr);gap:.65rem;align-items:center;padding:.7rem .75rem;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#08111f}
      .alert-history-symbol{font-weight:800}.alert-history-status{font-size:.78rem;font-weight:800}.alert-history-status.buy{color:#2fd18b}.alert-history-status.setup{color:#7ebcff}.alert-history-status.pullback{color:#f4a340}.alert-history-status.wait{color:#a9b8c9}.alert-history-status.avoid,.alert-history-status.sell{color:#ef6262}.alert-history-reason{font-size:.78rem;color:#8fa4bd;line-height:1.35}.alert-history-time{font-size:.76rem;color:#8fa4bd}.alert-history-empty{padding:1rem;border:1px dashed rgba(255,255,255,.12);border-radius:10px;color:#8fa4bd}
      @media(max-width:800px){.alert-history-head{display:block}.alert-history-actions{margin-top:.75rem}.alert-history-row{grid-template-columns:1fr 1fr}.alert-history-reason,.alert-history-time{grid-column:1/-1}}
    `;
    document.head.appendChild(style);

    alertsBtn.addEventListener('click',()=>openHistory(alertsBtn));
    document.getElementById('refreshAlertHistory')?.addEventListener('click',loadHistory);
    document.getElementById('closeAlertHistory')?.addEventListener('click',()=>closeHistory(alertsBtn));
  }

  async function openHistory(button){
    const panel=document.getElementById('alertHistoryPanel');
    if(!panel)return;
    panel.hidden=false;
    document.querySelectorAll('.topnav .nav-btn').forEach(btn=>btn.classList.toggle('active',btn===button));
    panel.scrollIntoView({behavior:'smooth',block:'start'});
    await loadHistory();
  }

  function closeHistory(){
    const panel=document.getElementById('alertHistoryPanel');if(panel)panel.hidden=true;
    const dashboard=[...document.querySelectorAll('.topnav .nav-btn')].find(btn=>btn.textContent.trim()==='Dashboard');
    document.querySelectorAll('.topnav .nav-btn').forEach(btn=>btn.classList.toggle('active',btn===dashboard));
  }

  async function loadHistory(){
    const root=document.getElementById('alertHistoryList');if(!root)return;
    root.innerHTML='<div class="muted">Loading alerts…</div>';
    try{
      const res=await fetch(`${apiBase()}/api/alerts?limit=50`,{headers:{accept:'application/json'}});
      const body=await res.json();if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);
      const rows=Array.isArray(body.alerts)?body.alerts:[];
      root.innerHTML=rows.length?rows.map(row=>{
        const previous=row.previousStatus?`${esc(row.previousStatus)} → `:'';
        const when=Number(row.createdAt)?new Date(Number(row.createdAt)).toLocaleString():'—';
        return `<button type="button" class="alert-history-row" data-symbol="${esc(row.symbol)}">
          <span class="alert-history-symbol">${esc(row.symbol)}</span>
          <span class="alert-history-status ${statusClass(row.status)}">${previous}${esc(row.status)}</span>
          <span><strong>${money(row.price)}</strong> · ${Math.round(Number(row.readiness)||0)}%</span>
          <span class="alert-history-time">${esc(when)}</span>
          <span class="alert-history-reason">${esc(row.reason||'')}</span>
        </button>`;
      }).join(''):'<div class="alert-history-empty">No status-change alerts have been saved yet. History will fill automatically as scheduled scans change a symbol’s status.</div>';
      root.querySelectorAll('.alert-history-row').forEach(btn=>btn.addEventListener('click',()=>{
        const input=document.getElementById('symbolInput'),load=document.getElementById('loadSymbolBtn');
        if(input)input.value=btn.dataset.symbol;if(load)load.click();
      }));
    }catch(error){root.innerHTML=`<div class="alert-history-empty">Alert history unavailable: ${esc(error.message||'request failed')}</div>`;}
  }

  ensureUi();
})();
