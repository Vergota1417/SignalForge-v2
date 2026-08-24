(() => {
  'use strict';
  const DEFAULT=['XOM','NVDA','MSFT','AAPL','AMZN','TSLA'];
  const KEY='signalforge_pinned_watchlist_v1';
  const MAX=12;
  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  let symbols=load(),signals=new Map(),observer=null,rendering=false;

  function safe(v){const s=String(v||'').trim().toUpperCase();return/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(s)&&s!=='SPY'?s:'';}
  function load(){try{const rows=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(rows)){const clean=[...new Set(rows.map(safe).filter(Boolean))].slice(0,MAX);if(clean.length)return clean;}}catch{}return[...DEFAULT];}
  function save(next){symbols=[...new Set((next||[]).map(safe).filter(Boolean))].slice(0,MAX);if(!symbols.length)symbols=[...DEFAULT];localStorage.setItem(KEY,JSON.stringify(symbols));renderWatchlist();renderManager();}
  function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);}
  function pct(v){const n=Number(v)||0;return`${n>=0?'+':''}${(n*100).toFixed(2)}%`;}
  function statusShort(v){const s=String(v||'');if(s==='SETUP — READY SOON')return'READY SOON';if(s==='WAIT — SETUP NOT READY')return'WAIT';if(s==='WAIT FOR PULLBACK')return'PULLBACK';if(s==='SELL / EXIT')return'EXIT';return s||'NOT ANALYZED';}
  function statusClass(v){const s=String(v||'').toLowerCase();if(s.includes('buy'))return'buy';if(s.includes('ready'))return'ready';if(s.includes('pullback'))return'pullback';if(s.includes('avoid')||s.includes('sell'))return'bad';return'wait';}

  async function refreshSignals(){try{const r=await fetch(`${API}/api/signals`,{headers:{accept:'application/json'},cache:'no-store'}),b=await r.json();if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);signals=new Map((b.signals||[]).map(x=>[x.symbol,x]));renderWatchlist();}catch(e){console.warn('Pinned watchlist signal refresh failed',e);}}

  function setup(){
    const head=document.querySelector('.sidebar .sidebar-head'),root=document.getElementById('watchlist');if(!head||!root)return;
    const eyebrow=head.querySelector('.eyebrow'),title=head.querySelector('h2');if(eyebrow)eyebrow.textContent='Pinned';if(title)title.textContent='My Watchlist';
    if(!document.getElementById('editWatchlistBtn')){
      const scan=document.getElementById('scanBtn'),actions=document.createElement('div');actions.className='sf-watch-head-actions';
      const edit=document.createElement('button');edit.id='editWatchlistBtn';edit.className='icon-btn';edit.type='button';edit.title='Choose pinned stocks';edit.setAttribute('aria-label','Choose pinned stocks');edit.textContent='✎';edit.addEventListener('click',openManager);
      if(scan?.parentElement===head){head.replaceChild(actions,scan);actions.append(scan,edit);}else{actions.append(edit);head.appendChild(actions);}
    }
    ensureManager();ensureStyles();renderWatchlist();
    observer=new MutationObserver(()=>{if(rendering)return;queueMicrotask(renderWatchlist);});observer.observe(root,{childList:true,subtree:true});
    refreshSignals();setInterval(refreshSignals,60_000);
  }

  function renderWatchlist(){
    const root=document.getElementById('watchlist');if(!root)return;rendering=true;observer?.disconnect();
    const current=String(document.getElementById('tickerBadge')?.textContent||'').trim().toUpperCase();
    root.innerHTML=symbols.map(sym=>{const row=signals.get(sym),a=row?.analysis||null,close=a?.latest?.close,status=a?.status||'',change=a?.changePct;return`<button type="button" class="watch-item ${sym===current?'active':''}" data-sf-pin="${sym}"><div><div class="watch-symbol">${sym}</div><div class="watch-meta"><span class="watch-status sf-pin-${statusClass(status)}">${statusShort(status)}</span></div>${row?.updatedAt?`<div class="watch-meta"><small>Deep scan ${new Date(Number(row.updatedAt)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></div>`:''}</div><div class="watch-price">${close?money(close):'—'}<div class="price-change ${Number(change)>=0?'positive':'negative'}">${a?pct(change):'—'}</div></div></button>`;}).join('');
    root.querySelectorAll('[data-sf-pin]').forEach(btn=>btn.addEventListener('click',()=>loadSymbol(btn.dataset.sfPin)));
    root.dataset.sfPinned='1';rendering=false;observer?.observe(root,{childList:true,subtree:true});
  }

  function loadSymbol(sym){const input=document.getElementById('symbolInput'),loadBtn=document.getElementById('loadSymbolBtn');if(input)input.value=sym;loadBtn?.click();setTimeout(renderWatchlist,250);}
  function ensureManager(){if(document.getElementById('sfWatchlistManager'))return;const panel=document.createElement('div');panel.id='sfWatchlistManager';panel.className='sf-watch-manager';panel.hidden=true;panel.innerHTML=`<div class="sf-watch-sheet"><div class="sf-watch-sheet-head"><div><div class="eyebrow">Pinned shortcuts</div><h3>My Watchlist</h3></div><button type="button" class="icon-btn" data-close aria-label="Close watchlist editor">×</button></div><p>Choose up to ${MAX} stocks you personally want one-tap access to. Opportunity Radar continues scanning the market independently.</p><div class="sf-watch-add"><input data-input maxlength="6" placeholder="Ticker e.g. AMD" autocomplete="off"><button type="button" class="btn ghost" data-add>Add</button><button type="button" class="btn ghost" data-current>Add current</button></div><div class="sf-watch-msg" data-msg></div><div class="sf-watch-chips" data-list></div><div class="sf-watch-footer"><button type="button" class="btn ghost" data-defaults>Restore defaults</button><button type="button" class="btn" data-done>Done</button></div></div>`;document.body.appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click',closeManager);panel.querySelector('[data-done]').addEventListener('click',closeManager);panel.addEventListener('click',e=>{if(e.target===panel)closeManager();});panel.querySelector('[data-add]').addEventListener('click',addTyped);panel.querySelector('[data-current]').addEventListener('click',()=>addSymbol(document.getElementById('tickerBadge')?.textContent));panel.querySelector('[data-defaults]').addEventListener('click',()=>save(DEFAULT));panel.querySelector('[data-input]').addEventListener('keydown',e=>{if(e.key==='Enter')addTyped();});
  }
  function openManager(){const p=document.getElementById('sfWatchlistManager');if(p){p.hidden=false;renderManager();setTimeout(()=>p.querySelector('[data-input]')?.focus(),50);}}
  function closeManager(){const p=document.getElementById('sfWatchlistManager');if(p)p.hidden=true;}
  function addTyped(){const p=document.getElementById('sfWatchlistManager'),input=p?.querySelector('[data-input]');addSymbol(input?.value);if(input)input.value='';}
  function addSymbol(value){const s=safe(value),msg=document.querySelector('#sfWatchlistManager [data-msg]');if(!s){if(msg)msg.textContent='Enter a valid U.S. ticker. SPY stays reserved as the benchmark.';return;}if(symbols.includes(s)){if(msg)msg.textContent=`${s} is already pinned.`;return;}if(symbols.length>=MAX){if(msg)msg.textContent=`Watchlist is limited to ${MAX} pinned stocks.`;return;}if(msg)msg.textContent='';save([...symbols,s]);}
  function renderManager(){const p=document.getElementById('sfWatchlistManager');if(!p)return;const list=p.querySelector('[data-list]');list.innerHTML=symbols.map(s=>`<span class="sf-watch-chip"><strong>${s}</strong><button type="button" data-remove="${s}" aria-label="Remove ${s}">×</button></span>`).join('');list.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>save(symbols.filter(s=>s!==b.dataset.remove))));}

  function ensureStyles(){if(document.getElementById('sfWatchlistStyles'))return;const s=document.createElement('style');s.id='sfWatchlistStyles';s.textContent=`.sf-watch-head-actions{display:flex;gap:.35rem}.sf-pin-buy{color:var(--green)!important}.sf-pin-ready{color:var(--blue)!important}.sf-pin-pullback{color:var(--orange)!important}.sf-pin-bad{color:var(--red)!important}.sf-pin-wait{color:var(--muted)!important}.sf-watch-manager{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px;background:rgba(2,8,18,.72);backdrop-filter:blur(6px)}.sf-watch-manager[hidden]{display:none}.sf-watch-sheet{width:min(520px,100%);max-height:min(680px,88vh);overflow:auto;padding:18px;border:1px solid var(--border);border-radius:16px;background:#0a1525;box-shadow:0 22px 70px rgba(0,0,0,.45)}.sf-watch-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sf-watch-sheet h3{margin:.15rem 0 0;font-size:1.2rem}.sf-watch-sheet p{color:var(--muted);font-size:.78rem;line-height:1.45}.sf-watch-add{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px}.sf-watch-add input{min-width:0;padding:10px 11px;border:1px solid var(--border);border-radius:10px;background:#07111f;color:var(--text);text-transform:uppercase}.sf-watch-msg{min-height:20px;margin-top:6px;font-size:.72rem;color:var(--orange)}.sf-watch-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 16px}.sf-watch-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 8px 7px 10px;border:1px solid var(--border);border-radius:999px;background:var(--panel-2);font-size:.78rem}.sf-watch-chip button{width:20px;height:20px;border:0;border-radius:50%;background:rgba(255,255,255,.07);color:var(--muted);cursor:pointer}.sf-watch-footer{display:flex;justify-content:space-between;gap:8px}@media(max-width:560px){.sf-watch-add{grid-template-columns:1fr 1fr}.sf-watch-add input{grid-column:1/-1}.sf-watch-sheet{border-radius:14px;padding:15px}}`;document.head.appendChild(s);}
  setup();
})();
