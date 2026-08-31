(() => {
  'use strict';
  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const esc=v=>String(v??'').replace(/[&<>'\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
  const fmtPct=v=>`${Number(v)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const fmtCompact=v=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v)||0);
  let loading=false;

  function ensurePanel(){
    const view=document.getElementById('smartScreenerView');
    if(!view||document.getElementById('sfTopOpportunities'))return;
    const panel=document.createElement('section');
    panel.id='sfTopOpportunities';
    panel.className='mp-opportunities';
    panel.innerHTML=`
      <div class="mp-head">
        <div>
          <div class="eyebrow">SignalForge · live discovery</div>
          <h2>Top Opportunities</h2>
          <p>Opportunity Score answers <strong>“what deserves attention?”</strong> Trade Confidence answers <strong>“is it actually ready?”</strong></p>
        </div>
        <div id="sfOpportunityCoverage" class="mp-coverage">Loading coverage…</div>
      </div>
      <div id="sfOpportunityRows" class="mp-grid"><div class="mp-empty">Loading SignalForge opportunities…</div></div>
      <div class="mp-rule"><strong>Important:</strong> a high Opportunity Score is not a BUY signal. BUY NOW still requires the full SignalForge hard-gate path.</div>
    `;
    const hero=view.querySelector('.sf-screen-hero');
    if(hero?.nextSibling)view.insertBefore(panel,hero.nextSibling);else view.prepend(panel);
    injectStyles();
  }

  function injectStyles(){
    if(document.getElementById('sfOpportunityStyles'))return;
    const style=document.createElement('style');style.id='sfOpportunityStyles';style.textContent=`
      .mp-opportunities{display:grid;gap:12px;padding:15px;border:1px solid #254869;border-radius:14px;background:linear-gradient(135deg,rgba(16,34,58,.96),rgba(9,20,36,.96));box-shadow:0 14px 36px rgba(0,0,0,.16)}
      .mp-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.mp-head h2{margin:2px 0 4px;font-size:21px}.mp-head p{margin:0;color:var(--muted);font-size:12px;max-width:720px}.mp-head p strong{color:var(--text)}
      .mp-coverage{border:1px solid var(--border);border-radius:999px;padding:7px 10px;color:var(--muted);font-size:11px;white-space:nowrap;background:var(--panel)}
      .mp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.mp-card{display:grid;gap:9px;padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(8,17,31,.82);color:var(--text);text-align:left;cursor:pointer}.mp-card:hover{border-color:#3c79ad}.mp-card-top{display:flex;justify-content:space-between;gap:10px}.mp-symbol strong{font-size:17px}.mp-symbol small{display:block;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}
      .mp-state{align-self:flex-start;border:1px solid currentColor;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;white-space:nowrap}.mp-state.actionable{color:var(--green)}.mp-state.ready-soon{color:var(--blue)}.mp-state.pullback{color:var(--orange)}.mp-state.avoid{color:var(--red)}.mp-state.discovery,.mp-state.watch{color:var(--yellow)}
      .mp-scores{display:grid;grid-template-columns:1fr 1fr;gap:7px}.mp-score{padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--panel)}.mp-score strong{display:block;font-size:20px}.mp-score span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em;margin-top:1px}.mp-score.pending strong{font-size:14px;padding-top:3px}
      .mp-meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:10px}.mp-meta strong{color:var(--text)}.mp-reason{color:var(--muted);font-size:10px;line-height:1.35;min-height:28px}.mp-rule{padding:9px 10px;border-left:3px solid var(--blue);background:rgba(255,255,255,.025);color:var(--muted);font-size:10px}.mp-rule strong{color:var(--text)}.mp-empty{grid-column:1/-1;padding:18px;border:1px dashed var(--border);border-radius:10px;color:var(--muted);text-align:center}
      @media(max-width:1000px){.mp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:680px){.mp-head{flex-direction:column}.mp-coverage{white-space:normal}.mp-grid{grid-template-columns:1fr}.mp-card{padding:11px}.mp-symbol small{max-width:220px}.mp-rule{font-size:9px}}
    `;document.head.appendChild(style);
  }

  function stateClass(bucket){return String(bucket||'DISCOVERY').toLowerCase().replace(/\s+/g,'-');}
  function displayState(row){if(row.tradeConfidence===null||row.tradeConfidence===undefined)return'DISCOVERY';return String(row.status||row.bucket||'WATCH');}
  function topRows(rows){return (rows||[]).filter(r=>r&&r.bucket!=='AVOID'&&Number(r.opportunityScore)>=0).sort((a,b)=>Number(b.opportunityScore||0)-Number(a.opportunityScore||0)||Number(b.tradeConfidence??-1)-Number(a.tradeConfidence??-1)||Number(b.screenScore||0)-Number(a.screenScore||0)).slice(0,6);}

  function render(screener){
    ensurePanel();
    const coverage=screener?.coverage||{},rows=topRows(screener?.rows||[]),root=document.getElementById('sfOpportunityRows'),coverageRoot=document.getElementById('sfOpportunityCoverage');
    if(coverageRoot)coverageRoot.textContent=`${fmtCompact(coverage.scannedSymbols||0)} scanned · ${fmtCompact(coverage.catalogSize||0)} catalog · ${fmtCompact(coverage.deepAnalyzed||0)} deep analyzed`;
    if(!root)return;
    if(!rows.length){root.innerHTML='<div class="mp-empty">No qualified SignalForge opportunities yet. Discovery is still building history.</div>';return;}
    root.innerHTML=rows.map((r,i)=>{
      const confidence=r.tradeConfidence===null||r.tradeConfidence===undefined?null:Number(r.tradeConfidence),status=displayState(r),bucketClass=stateClass(r.bucket);
      return `<button type="button" class="mp-card" data-symbol="${esc(r.symbol)}">
        <div class="mp-card-top"><div class="mp-symbol"><strong>#${i+1} ${esc(r.symbol)}</strong><small>${esc(r.name||r.symbol)}</small></div><span class="mp-state ${bucketClass}">${esc(status)}</span></div>
        <div class="mp-scores"><div class="mp-score"><strong>${Number(r.opportunityScore||0).toFixed(0)}</strong><span>Opportunity Score</span></div><div class="mp-score ${confidence===null?'pending':''}"><strong>${confidence===null?'Pending':confidence.toFixed(0)}</strong><span>Trade Confidence</span></div></div>
        <div class="mp-meta"><span><strong>${fmtPct(r.changePct)}</strong> move</span><span><strong>${Number(r.relativeVolume||0).toFixed(2)}x</strong> RVOL</span><span><strong>${r.deepAnalysis?`${Number(r.gatesReady||0)}/${Number(r.gateTotal||4)}`:'—'}</strong> gates</span></div>
        <div class="mp-reason">${esc(r.reason||'Discovery candidate awaiting deeper validation.')}</div>
      </button>`;
    }).join('');
    root.querySelectorAll('.mp-card').forEach(btn=>btn.addEventListener('click',()=>openSymbol(btn.dataset.symbol)));
  }

  async function load(){
    if(loading)return;loading=true;ensurePanel();const root=document.getElementById('sfOpportunityRows');if(root)root.innerHTML='<div class="mp-empty">Refreshing SignalForge opportunities…</div>';
    try{const res=await fetch(`${apiBase()}/api/screener?limit=40`,{headers:{accept:'application/json'}}),body=await res.json();if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);render(body.screener||{});}catch(error){if(root)root.innerHTML=`<div class="mp-empty">SignalForge opportunities unavailable: ${esc(error.message||'request failed')}</div>`;}finally{loading=false;}
  }

  function openSymbol(symbol){const dashboard=document.getElementById('dashboardNavBtn'),input=document.getElementById('symbolInput'),loadBtn=document.getElementById('loadSymbolBtn');dashboard?.click();if(input)input.value=symbol;if(loadBtn)loadBtn.click();}
  function bind(){ensurePanel();document.getElementById('screenerNavBtn')?.addEventListener('click',()=>setTimeout(load,0));document.getElementById('sfScreenRefresh')?.addEventListener('click',()=>setTimeout(load,0));const view=document.getElementById('smartScreenerView');if(view)new MutationObserver(()=>{if(!view.hidden)load();}).observe(view,{attributes:true,attributeFilter:['hidden']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
