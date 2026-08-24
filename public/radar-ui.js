(() => {
  const apiBase=()=>String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const fmtPct=v=>`${Number(v)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const fmtVol=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)}x`:'—';
  const fmtTime=v=>Number(v)?new Date(Number(v)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';
  const statusShort=s=>s==='SETUP — READY SOON'?'READY SOON':s==='WAIT — SETUP NOT READY'?'WAIT':s||'NOT ANALYZED';
  const statusClass=s=>s==='BUY NOW'?'buy':s==='SETUP — READY SOON'?'setup':s==='WAIT FOR PULLBACK'?'pullback':s==='SELL / EXIT'?'sell':s==='AVOID'?'avoid':'wait';
  const movementClass=s=>s==='EARLY MOVEMENT — BUILDING'?'building':s==='MOVEMENT WATCH'?'watch':'quiet';

  function ensureRadarUi(){
    const sidebar=document.querySelector('.sidebar');if(!sidebar||document.getElementById('opportunityRadar'))return;
    const block=document.createElement('section');block.className='radar-block';
    block.innerHTML=`<div class="radar-head"><div><div class="eyebrow">Opportunity Radar</div><h3>Dynamic discovery</h3></div><span id="radarUpdated" class="radar-updated">Loading…</span></div><div id="opportunityRadar" class="radar-list"></div><div id="radarCoverage" class="radar-note"></div><div class="radar-note">Early Movement shows developing participation before a BUY. It is a watch signal, not permission to enter. The saved live BUY gates remain authoritative.</div>`;
    const note=sidebar.querySelector('.mini-note');if(note)note.after(block);else sidebar.appendChild(block);
    ensureClock();
    const style=document.createElement('style');style.textContent=`.radar-decision{display:block;margin-top:.18rem;font-size:.68rem;font-weight:800;letter-spacing:.02em}.radar-decision.buy{color:#2fd18b}.radar-decision.setup{color:#7ebcff}.radar-decision.pullback{color:#f4a340}.radar-decision.sell,.radar-decision.avoid{color:#ef6262}.radar-decision.wait{color:#8fa4bd}.radar-movement{display:block;margin-top:.22rem;padding:.2rem .35rem;border-radius:.35rem;font-size:.64rem;font-weight:800}.radar-movement.building{background:rgba(47,209,139,.12);color:#2fd18b}.radar-movement.watch{background:rgba(244,163,64,.12);color:#f4a340}.radar-movement.quiet{color:#72869f}.radar-movement-reason{display:block;margin-top:.1rem;font-size:.6rem;color:#8fa4bd;font-weight:600}.radar-scan-time,.radar-eta{display:block;margin-top:.12rem;font-size:.63rem;color:#72869f}.radar-eta strong{color:#a9bed5;font-weight:750}.sf-market-clock{display:grid;justify-items:end;line-height:1.2;margin-right:2px;white-space:nowrap}.sf-market-clock strong{font-size:.72rem}.sf-market-clock span{font-size:.61rem;color:#72869f}.eta-due{color:#f4a340!important}@media(max-width:760px){.sf-market-clock{order:2;justify-items:start;margin-left:auto}.top-actions{order:4}}`;document.head.appendChild(style);
  }
  function ensureClock(){
    const actions=document.querySelector('.top-actions');if(!actions||document.getElementById('sfMarketClock'))return;
    const clock=document.createElement('div');clock.id='sfMarketClock';clock.className='sf-market-clock';clock.setAttribute('aria-label','Local and U.S. market time');actions.before(clock);updateClock();setInterval(updateClock,30_000);
  }
  function updateClock(){
    const root=document.getElementById('sfMarketClock');if(!root)return;const now=new Date();
    const local=now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),market=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(now);
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local';root.innerHTML=`<strong>Local ${local}</strong><span>${escShort(zone)} · Market ${market}</span>`;
  }
  async function fetchJson(path){const res=await fetch(`${apiBase()}${path}`,{headers:{accept:'application/json'}}),body=await res.json();if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);return body;}
  async function refreshRadar(){
    const root=document.getElementById('opportunityRadar');if(!root)return;
    try{
      const[radarBody,signalBody]=await Promise.all([fetchJson('/api/opportunity-radar'),fetchJson('/api/signals')]),radar=radarBody.radar||{},rows=radar.symbols||[],signals=new Map((signalBody.signals||[]).map(row=>[row.symbol,row]));
      root.innerHTML=rows.length?rows.map((r,i)=>{const signal=signals.get(r.symbol),score=Number(r.rollingDiscoveryScore??r.discoveryScore??r.score)||0,velocity=Number(r.scoreVelocity)||0,eta=etaLine(r.expectation,signal),movement=r.earlyMovement||{},movementState=String(movement.state||'QUIET'),reasons=(movement.reasons||[]).join(' · ');return`<button type="button" class="radar-item" data-symbol="${r.symbol}"><span class="radar-rank">#${i+1}</span><span class="radar-main"><strong>${r.symbol}</strong><small>${r.name||r.symbol}</small><span class="radar-decision ${statusClass(signal?.status)}">${statusShort(signal?.status)}</span><span class="radar-movement ${movementClass(movementState)}">${movementState} · ${Number(movement.acceleration)||0}/100</span>${reasons?`<span class="radar-movement-reason">${escShort(reasons)} · ${escShort(movement.action||'')}</span>`:''}${signal?`<span class="radar-scan-time">Last deep scan ${fmtTime(signal.updatedAt)}</span>`:''}<span class="radar-eta ${eta.due?'eta-due':''}"><strong>${eta.label}</strong> ${eta.text}</span></span><span class="radar-stats"><b>${Math.round(score)}</b><small>Discovery ${velocity>=0?'↑':'↓'} ${Math.abs(velocity).toFixed(1)} · ${fmtPct(r.changePct)} · RV ${fmtVol(r.relativeVolume)}</small></span></button>`;}).join(''):'<div class="radar-empty">Radar is warming up. Dynamic discovery fills this list during market hours.</div>';
      root.querySelectorAll('.radar-item').forEach(btn=>btn.addEventListener('click',()=>{const input=document.getElementById('symbolInput'),load=document.getElementById('loadSymbolBtn');if(input)input.value=btn.dataset.symbol;if(load)load.click();}));
      const updated=document.getElementById('radarUpdated');if(updated)updated.textContent=radar.updatedAt?`Updated ${fmtTime(radar.updatedAt)}`:`Pool ${radar.universeSize||0}`;
      const coverage=document.getElementById('radarCoverage');if(coverage){const building=rows.filter(r=>r.earlyMovement?.state==='EARLY MOVEMENT — BUILDING').length,watching=rows.filter(r=>r.earlyMovement?.state==='MOVEMENT WATCH').length;coverage.textContent=`Early movement: ${building} building · ${watching} watch. Weekly pool ${radar.universeSize||0} · catalog ${radar.catalogSize||0} · ${radar.scannedSymbols||0} symbols have discovery history.`;}
    }catch(error){root.innerHTML='<div class="radar-empty">Opportunity Radar unavailable.</div>';console.warn('Radar unavailable',error);}
  }
  function etaLine(expectation,signal){
    const deep=expectation?.deepAnalysis,discovery=expectation?.discovery;
    if(deep?.state==='SCHEDULED'||deep?.state==='DUE / RETRY')return formatEta(deep.label,deep.at,deep.state==='DUE / RETRY');
    if(!signal&&deep?.state==='PROMOTION PENDING')return formatEta('Promotion decision',deep.at,false);
    if(!signal&&deep?.state==='NOT SELECTED THIS WEEK')return formatEta('Next promotion opportunity',deep.at,false);
    if(discovery?.at)return formatEta('Next discovery check',discovery.at,false);
    return{label:'Next check',text:'schedule pending',due:false};
  }
  function formatEta(label,at,due){
    if(!(Number(at)>0))return{label,text:'schedule pending',due:false};const ms=Number(at)-Date.now();if(ms<=0)return{label,text:'due / awaiting scheduled run',due:true};
    const local=new Date(Number(at)).toLocaleTimeString([],{weekday:'short',hour:'numeric',minute:'2-digit'}),market=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(Number(at)));
    return{label,text:`${countdown(ms)} · ${local} local · ${market}`,due};
  }
  function countdown(ms){const total=Math.max(0,Math.floor(ms/1000)),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),mins=Math.floor(total%3600/60);if(days)return`in ${days}d ${hours}h`;if(hours)return`in ${hours}h ${mins}m`;return`in ${Math.max(1,mins)}m`;}
  function escShort(v){return String(v||'').replace(/[<>&"']/g,'');}
  ensureRadarUi();refreshRadar();setInterval(refreshRadar,60_000);
})();
