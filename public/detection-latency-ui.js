(() => {
  'use strict';
  const CONFIG=window.SIGNALFORGE_CONFIG||{API_BASE_URL:window.location.origin};
  let lastSymbol='',timer=null,requestId=0;
  function apiBase(){return String(CONFIG.API_BASE_URL||window.location.origin).replace(/\/$/,'');}
  function symbol(){return String(document.getElementById('symbolInput')?.value||'').trim().toUpperCase();}
  function valid(s){return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s);}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
  function money(v){const n=Number(v);return Number.isFinite(n)?`$${n.toFixed(2)}`:'—';}
  function pct(v){const n=Number(v);return Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—';}
  function minutes(v){const n=Number(v);return Number.isFinite(n)?`${Math.round(n)} min`:'—';}
  function when(v){return Number(v)?new Date(Number(v)).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
  function ensure(){
    if(document.getElementById('sfDetectionAudit'))return document.getElementById('sfDetectionAudit');
    const root=document.createElement('section');root.id='sfDetectionAudit';root.className='panel sf-detection-audit';
    root.innerHTML='<div class="panel-head"><div><div class="eyebrow">Stage 14.28 · stored evidence</div><h2>Missed Opportunity Audit</h2></div><span id="sfDetectionBadge" class="sf-detection-badge">CHECKING</span></div><div id="sfDetectionSummary" class="sf-detection-summary">Checking when SignalForge first saw this setup…</div><div id="sfDetectionGrid" class="sf-detection-grid"></div><div id="sfDetectionFoot" class="muted sf-detection-foot"></div>';
    const anchor=document.querySelector('.engine-section')||document.querySelector('.bottom-grid');if(anchor)anchor.insertAdjacentElement('beforebegin',root);else document.querySelector('.main-content')?.appendChild(root);
    if(!document.getElementById('sfDetectionStyles')){const style=document.createElement('style');style.id='sfDetectionStyles';style.textContent=`
      .sf-detection-audit{margin-top:14px}.sf-detection-badge{font-size:11px;font-weight:850;padding:6px 9px;border:1px solid var(--border);border-radius:999px}.sf-detection-summary{margin:8px 0 12px;font-size:13px;line-height:1.45}.sf-detection-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.sf-detection-cell{padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--panel-2)}.sf-detection-cell small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.04em}.sf-detection-cell strong{display:block;margin-top:4px;font-size:13px}.sf-detection-foot{margin-top:10px;font-size:10px}.sf-detection-badge.warn{color:var(--orange)}.sf-detection-badge.critical{color:var(--red)}.sf-detection-badge.ok{color:var(--green)}.sf-detection-badge.info{color:var(--blue)}@media(max-width:760px){.sf-detection-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
      document.head.appendChild(style);
    }
    return root;
  }
  async function refresh(force=false){
    const s=symbol();if(!valid(s))return;if(!force&&s===lastSymbol)return;lastSymbol=s;const mine=++requestId;ensure();
    const badge=document.getElementById('sfDetectionBadge'),summary=document.getElementById('sfDetectionSummary'),grid=document.getElementById('sfDetectionGrid'),foot=document.getElementById('sfDetectionFoot');if(!badge||!summary||!grid||!foot)return;
    badge.textContent='CHECKING';badge.className='sf-detection-badge info';summary.textContent='Checking stored radar and analysis timing…';grid.innerHTML='';
    try{
      const res=await fetch(`${apiBase()}/api/detection-latency?symbol=${encodeURIComponent(s)}&days=3`,{headers:{accept:'application/json'}}),body=await res.json();if(mine!==requestId)return;if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);const a=body.audit||{},d=a.assessment?.detection||{},x=a.assessment?.execution||{},m=a.milestones||{},l=a.latency||{};
      badge.textContent=d.label||'AUDITED';badge.className=`sf-detection-badge ${String(d.severity||'INFO').toLowerCase()}`;summary.innerHTML=`<strong>${esc(d.reason||'Detection timing is available.')}</strong><br>${esc(x.label||'')} — ${esc(x.reason||'')}`;
      grid.innerHTML=[cell('First radar',m.firstRadar?`${money(m.firstRadar.price)} · ${when(m.firstRadar.at)}`:'No stored scan'),cell('First movement',m.firstMovement?`${money(m.firstMovement.price)} · ${when(m.firstMovement.at)}`:'Not triggered'),cell('READY latency',m.firstReady?`${minutes(l.movementToReadyMinutes)} · ${pct(l.priceAdvanceMovementToReadyPct)}`:'No READY'),cell('BUY evidence',m.firstBuy?`${money(m.firstBuy.price)} · ${when(m.firstBuy.at)}`:(a.assessment?.validBuyMissed==='POSSIBLE_ENGINE_INCONSISTENCY'?'REVIEW POSSIBLE MISS':'No valid BUY proven'))].join('');
      const coverage=a.coverage||{},raw=`${a.radarObservationCount||0} radar + ${a.analysisObservationCount||0} analysis snapshots`;foot.textContent=`${raw}. Audit uses stored evidence only: 0 provider requests. Broad discovery coverage: ${coverage.weekdays?.join('/')||'—'} ${coverage.startEt||'—'}–${coverage.endEt||'—'} ET; extended hours ${coverage.extendedHours?'included':'not included'}.`;
    }catch(err){if(mine!==requestId)return;badge.textContent='AUDIT UNAVAILABLE';badge.className='sf-detection-badge warn';summary.textContent=err.message||'Detection audit unavailable.';foot.textContent='This does not change the live trading decision.';}
  }
  function cell(label,value){return`<div class="sf-detection-cell"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;}
  function watch(){const s=symbol();if(valid(s)&&s!==lastSymbol)refresh();clearTimeout(timer);timer=setTimeout(watch,1500);}
  document.addEventListener('DOMContentLoaded',()=>{ensure();watch();});
  window.addEventListener('focus',()=>refresh(true));
})();
