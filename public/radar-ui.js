(() => {
  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const fmtPct=v=>`${Number(v)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const fmtVol=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)}x`:'—';
  const fmtTime=v=>Number(v)?new Date(Number(v)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';
  const statusShort=s=>s==='SETUP — READY SOON'?'READY SOON':s==='WAIT — SETUP NOT READY'?'WAIT':s||'NOT ANALYZED';
  const statusClass=s=>s==='BUY NOW'?'buy':s==='SETUP — READY SOON'?'setup':s==='WAIT FOR PULLBACK'?'pullback':s==='SELL / EXIT'?'sell':s==='AVOID'?'avoid':'wait';

  function ensureRadarUi(){
    const sidebar=document.querySelector('.sidebar');if(!sidebar||document.getElementById('opportunityRadar'))return;
    const block=document.createElement('section');block.className='radar-block';
    block.innerHTML=`<div class="radar-head"><div><div class="eyebrow">Opportunity Radar</div><h3>Dynamic discovery</h3></div><span id="radarUpdated" class="radar-updated">Loading…</span></div><div id="opportunityRadar" class="radar-list"></div><div id="radarCoverage" class="radar-note"></div><div class="radar-note">Discovery score asks whether something interesting is happening. Phase 4 opportunity score decides whether it deserves capital.</div>`;
    const note=sidebar.querySelector('.mini-note');if(note)note.after(block);else sidebar.appendChild(block);
    const style=document.createElement('style');style.textContent=`.radar-decision{display:block;margin-top:.18rem;font-size:.68rem;font-weight:800;letter-spacing:.02em}.radar-decision.buy{color:#2fd18b}.radar-decision.setup{color:#7ebcff}.radar-decision.pullback{color:#f4a340}.radar-decision.sell,.radar-decision.avoid{color:#ef6262}.radar-decision.wait{color:#8fa4bd}.radar-scan-time{display:block;margin-top:.12rem;font-size:.63rem;color:#72869f}`;document.head.appendChild(style);
  }
  async function fetchJson(path){const res=await fetch(`${apiBase()}${path}`,{headers:{accept:'application/json'}}),body=await res.json();if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);return body;}
  async function refreshRadar(){
    const root=document.getElementById('opportunityRadar');if(!root)return;
    try{
      const[radarBody,signalBody]=await Promise.all([fetchJson('/api/opportunity-radar'),fetchJson('/api/signals')]),radar=radarBody.radar||{},rows=radar.symbols||[],signals=new Map((signalBody.signals||[]).map(row=>[row.symbol,row]));
      root.innerHTML=rows.length?rows.map((r,i)=>{const signal=signals.get(r.symbol),score=Number(r.rollingDiscoveryScore??r.discoveryScore??r.score)||0,velocity=Number(r.scoreVelocity)||0;return`<button type="button" class="radar-item" data-symbol="${r.symbol}"><span class="radar-rank">#${i+1}</span><span class="radar-main"><strong>${r.symbol}</strong><small>${r.name||r.symbol}</small><span class="radar-decision ${statusClass(signal?.status)}">${statusShort(signal?.status)}</span>${signal?`<span class="radar-scan-time">Deep scan ${fmtTime(signal.updatedAt)}</span>`:''}</span><span class="radar-stats"><b>${Math.round(score)}</b><small>Discovery ${velocity>=0?'↑':'↓'} ${Math.abs(velocity).toFixed(1)} · ${fmtPct(r.changePct)} · RV ${fmtVol(r.relativeVolume)}</small></span></button>`;}).join(''):'<div class="radar-empty">Radar is warming up. Dynamic discovery fills this list during market hours.</div>';
      root.querySelectorAll('.radar-item').forEach(btn=>btn.addEventListener('click',()=>{const input=document.getElementById('symbolInput'),load=document.getElementById('loadSymbolBtn');if(input)input.value=btn.dataset.symbol;if(load)load.click();}));
      const updated=document.getElementById('radarUpdated');if(updated)updated.textContent=radar.updatedAt?`Updated ${fmtTime(radar.updatedAt)}`:`Pool ${radar.universeSize||0}`;
      const coverage=document.getElementById('radarCoverage');if(coverage)coverage.textContent=`Weekly pool ${radar.universeSize||0} · catalog ${radar.catalogSize||0} · ${radar.scannedSymbols||0} symbols have discovery history.`;
    }catch(error){root.innerHTML='<div class="radar-empty">Opportunity Radar unavailable.</div>';console.warn('Radar unavailable',error);}
  }
  ensureRadarUi();refreshRadar();setInterval(refreshRadar,5*60*1000);
})();
