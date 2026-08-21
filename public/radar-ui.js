(() => {
  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const fmtPct=v=>`${Number(v)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const fmtVol=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)}x`:'—';

  function ensureRadarUi(){
    const sidebar=document.querySelector('.sidebar');
    if(!sidebar||document.getElementById('opportunityRadar')) return;
    const block=document.createElement('section');
    block.className='radar-block';
    block.innerHTML=`<div class="radar-head"><div><div class="eyebrow">Opportunity Radar</div><h3>Rotating candidates</h3></div><span id="radarUpdated" class="radar-updated">Loading…</span></div><div id="opportunityRadar" class="radar-list"></div><div class="radar-note">Discovery score is a prefilter only. BUY still requires SignalForge trend, entry, probability, risk/reward, and selective 15-minute confirmation.</div>`;
    const note=sidebar.querySelector('.mini-note');
    if(note) note.after(block); else sidebar.appendChild(block);
  }

  async function refreshRadar(){
    const root=document.getElementById('opportunityRadar');if(!root)return;
    try{
      const res=await fetch(`${apiBase()}/api/opportunity-radar`,{headers:{accept:'application/json'}});
      const body=await res.json();if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);
      const radar=body.radar||{};const rows=radar.symbols||[];
      root.innerHTML=rows.length?rows.map((r,i)=>`<button type="button" class="radar-item" data-symbol="${r.symbol}"><span class="radar-rank">#${i+1}</span><span class="radar-main"><strong>${r.symbol}</strong><small>${r.name||r.symbol}</small></span><span class="radar-stats"><b>${Math.round(Number(r.score)||0)}</b><small>${fmtPct(r.changePct)} · RV ${fmtVol(r.relativeVolume)}</small></span></button>`).join(''):'<div class="radar-empty">Radar is warming up. Discovery fills this list during market hours.</div>';
      root.querySelectorAll('.radar-item').forEach(btn=>btn.addEventListener('click',()=>{
        const input=document.getElementById('symbolInput');const load=document.getElementById('loadSymbolBtn');
        if(input)input.value=btn.dataset.symbol;if(load)load.click();
      }));
      const updated=document.getElementById('radarUpdated');
      if(updated)updated.textContent=radar.updatedAt?`Updated ${new Date(radar.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:`Universe ${radar.universeSize||0}`;
    }catch(error){root.innerHTML='<div class="radar-empty">Opportunity Radar unavailable.</div>';console.warn('Radar unavailable',error);}
  }

  ensureRadarUi();refreshRadar();setInterval(refreshRadar,5*60*1000);
})();
