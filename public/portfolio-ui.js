(() => {
  'use strict';
  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  const TOKEN_KEY='signalforge_push_test_token_v1';
  const nav=document.querySelector('.topnav'),main=document.querySelector('.main-content');
  if(!nav||!main)return;

  const btn=document.createElement('button');btn.type='button';btn.className='nav-btn';btn.textContent='Portfolio';nav.appendChild(btn);
  const panel=document.createElement('section');panel.className='portfolio-panel';panel.hidden=true;
  panel.innerHTML=`
    <div class="portfolio-head"><div><div class="eyebrow">Capital management</div><h2>Portfolio + strategy</h2><p class="muted">Record what you actually bought. SignalForge manages owned positions separately from new-capital opportunities.</p></div><button type="button" class="btn ghost" data-close>Close</button></div>
    <div class="portfolio-actions">
      <div class="portfolio-buy-card"><div class="eyebrow">Record a purchase</div><div class="portfolio-form">
        <label>Symbol<input data-symbol maxlength="6" placeholder="NVDA"></label><label>Entry price<input data-entry type="number" min="0.01" step="0.01" placeholder="173.40"></label><label>Shares<input data-shares type="number" min="0.0001" step="0.0001" placeholder="1"></label><label>Buy date<input data-date type="date"></label><button type="button" class="btn" data-save>Save purchase</button>
      </div><div class="muted portfolio-msg" data-msg></div></div>
      <div class="portfolio-summary" data-summary></div>
    </div>
    <div class="section-head"><div><div class="eyebrow">Owned positions</div><h2>What should I do with money already invested?</h2></div></div>
    <div class="portfolio-list" data-list></div>
    <div class="section-head"><div><div class="eyebrow">Weekly research</div><h2>Best current uses of new capital</h2><div class="muted" data-weekly>Waiting for weekly research status…</div></div></div>
    <div class="strategy-list" data-ranked></div>`;
  main.prepend(panel);

  const q=s=>panel.querySelector(s),symbol=q('[data-symbol]'),entry=q('[data-entry]'),shares=q('[data-shares]'),date=q('[data-date]');
  date.value=new Date().toISOString().slice(0,10);btn.addEventListener('click',()=>open());q('[data-close]').addEventListener('click',close);q('[data-save]').addEventListener('click',save);

  async function authHeaders(){const token=localStorage.getItem(TOKEN_KEY)||'';if(!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw new Error('Enable phone alerts first so SignalForge can authorize private portfolio access.');if(!('serviceWorker'in navigator))throw new Error('Portfolio access requires the installed SignalForge app or a browser with service workers.');const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager?.getSubscription();if(!sub?.endpoint)throw new Error('Enable phone alerts first so SignalForge can authorize private portfolio access.');return {'x-sf-endpoint':sub.endpoint,'x-sf-token':token};}
  async function api(path,options={}){const auth=await authHeaders();const r=await fetch(`${API}${path}`,{...options,headers:{accept:'application/json',...auth,...(options.headers||{})}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);}
  function pct(v){return `${Number(v)>=0?'+':''}${((Number(v)||0)*100).toFixed(1)}%`;}
  function stateClass(v){return String(v||'').toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'');}
  function dt(v){return v?new Date(Number(v)).toLocaleString():'—';}

  async function open(){panel.hidden=false;document.querySelectorAll('.topnav .nav-btn').forEach(x=>x.classList.toggle('active',x===btn));const current=(document.getElementById('tickerBadge')?.textContent||'').trim();if(current)symbol.value=current;const price=Number(String(document.getElementById('priceValue')?.textContent||'').replace(/[^0-9.]/g,''));if(price>0&&!entry.value)entry.value=price.toFixed(2);await refresh();panel.scrollIntoView({behavior:'smooth',block:'start'});}
  function close(){panel.hidden=true;const dash=[...document.querySelectorAll('.topnav .nav-btn')].find(x=>x.textContent.trim()==='Dashboard');document.querySelectorAll('.topnav .nav-btn').forEach(x=>x.classList.toggle('active',x===dash));}
  async function save(){const s=String(symbol.value||'').trim().toUpperCase(),ep=Number(entry.value),sh=Number(shares.value),boughtAt=date.value?new Date(`${date.value}T12:00:00`).getTime():Date.now();q('[data-msg]').textContent='Saving…';try{await api('/api/portfolio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({symbol:s,entryPrice:ep,shares:sh,boughtAt})});q('[data-msg]').textContent=`${s} is now tracked as an owned position.`;await refresh();}catch(e){q('[data-msg]').textContent=e.message;}}
  async function remove(s){if(!confirm(`Stop tracking ${s} as an owned position?`))return;await api('/api/portfolio',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({symbol:s})});await refresh();}

  async function refresh(){try{const [portfolio,strategy]=await Promise.all([api('/api/portfolio'),api('/api/strategy')]);renderPositions(portfolio.positions||[]);renderWeekly(strategy.weekly||{});renderRanked(strategy.ranked||[]);}catch(e){q('[data-list]').innerHTML=`<div class="muted portfolio-empty">${esc(e.message)}</div>`;q('[data-ranked]').innerHTML='';q('[data-weekly]').textContent='Weekly research unavailable while private portfolio access is locked.';q('[data-summary]').innerHTML='<strong>Private portfolio locked</strong><span>Authorization is tied to your enabled SignalForge phone alerts.</span>';}}
  function renderWeekly(w){if(!w.weekKey){q('[data-weekly]').textContent='The first weekly research pass has not run yet.';return;}const progress=Number(w.progress)||0;q('[data-weekly]').textContent=w.complete?`Week of ${w.weekKey} · complete · ${w.scanned}/${w.universeSize} symbols · finished ${dt(w.completedAt)}`:`Week of ${w.weekKey} · ${progress}% complete · ${w.scanned}/${w.universeSize} symbols researched so far`;}
  function renderPositions(rows){const list=q('[data-list]'),summary=q('[data-summary]');if(!rows.length){list.innerHTML='<div class="muted portfolio-empty">No purchases recorded yet.</div>';summary.innerHTML='<strong>0 positions</strong><span>Record a real buy so SignalForge can manage the position instead of treating it as a candidate.</span>';return;}const total=rows.reduce((a,r)=>a+Number(r.strategy?.marketValue||0),0),cost=rows.reduce((a,r)=>a+Number(r.strategy?.costBasis||0),0);summary.innerHTML=`<strong>${rows.length} position${rows.length===1?'':'s'} · ${money(total)}</strong><span>Open P/L ${pct(cost?total/cost-1:0)} · ${money(total-cost)}</span>`;list.innerHTML=rows.map(r=>{const s=r.strategy;return `<article class="portfolio-row"><div><div class="portfolio-symbol">${esc(r.symbol)}</div><div class="muted">Entry ${money(r.entryPrice)} · ${Number(r.shares).toFixed(4)} shares</div><div class="muted">Current ${s?money(s.price):'Waiting for analysis'} ${s?`· P/L ${pct(s.gainPct)} (${money(s.gainAmount)})`:''}</div></div><div class="portfolio-decision"><span class="strategy-state ${stateClass(s?.state)}">${esc(s?.state||'WAITING')}</span><small>${esc(s?.reason||'This position needs a saved analysis.')}</small></div><button type="button" class="icon-btn" data-remove="${esc(r.symbol)}" title="Remove position">×</button></article>`;}).join('');list.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>remove(b.dataset.remove)));}
  function renderRanked(rows){const root=q('[data-ranked]');if(!rows.length){root.innerHTML='<div class="muted">No weekly ranking is available yet.</div>';return;}root.innerHTML=rows.slice(0,12).map((r,i)=>`<button type="button" class="strategy-row" data-load="${esc(r.symbol)}"><span class="strategy-rank">#${i+1}</span><span><strong>${esc(r.symbol)}</strong><small>${esc(r.strategy.state)} · opportunity ${r.strategy.opportunityScore}/100</small></span><span>${Number(r.strategy.rr||0).toFixed(2)}:1 R/R</span></button>`).join('');root.querySelectorAll('[data-load]').forEach(b=>b.addEventListener('click',()=>{const input=document.getElementById('symbolInput');if(input)input.value=b.dataset.load;document.getElementById('loadSymbolBtn')?.click();close();}));}
})();
