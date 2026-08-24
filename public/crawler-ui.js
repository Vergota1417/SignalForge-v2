(() => {
  'use strict';
  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  let paused=false;

  const money=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)):'—';
  const pct=v=>`${Number(v)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const clean=v=>String(v||'').replace(/[<>&"']/g,'');
  const stateClass=v=>String(v||'QUIET').toLowerCase().replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'');

  function ensureUi(){
    if(document.getElementById('sfMarketCrawler'))return;
    const topbar=document.querySelector('.topbar'),shell=document.querySelector('.app-shell');
    if(!topbar||!shell)return;
    const root=document.createElement('section');
    root.id='sfMarketCrawler';
    root.className='sf-crawler';
    root.setAttribute('aria-label','Live Opportunity Radar stock crawler');
    root.innerHTML=`<div class="sf-crawler-label"><span class="sf-crawler-live" aria-hidden="true"></span><strong>RADAR</strong></div><div class="sf-crawler-window"><div id="sfCrawlerTrack" class="sf-crawler-track"><div class="sf-crawler-placeholder">Loading live candidates…</div></div></div><button id="sfCrawlerPause" class="sf-crawler-pause" type="button" aria-pressed="false" aria-label="Pause stock crawler" title="Pause crawler">Ⅱ</button>`;
    topbar.insertAdjacentElement('afterend',root);
    ensureStyles();
    document.getElementById('sfCrawlerPause')?.addEventListener('click',togglePause);
  }

  function ensureStyles(){
    if(document.getElementById('sfCrawlerStyles'))return;
    const s=document.createElement('style');s.id='sfCrawlerStyles';s.textContent=`
      .sf-crawler{--sf-crawl-duration:48s;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;min-width:0;height:38px;border-bottom:1px solid var(--border);background:#07111f;overflow:hidden}
      .sf-crawler-label{height:100%;display:flex;align-items:center;gap:6px;padding:0 10px;border-right:1px solid var(--border);font-size:10px;letter-spacing:.08em;color:#9bb0c8;white-space:nowrap}.sf-crawler-live{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(47,209,139,.10)}
      .sf-crawler-window{min-width:0;overflow:hidden;mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%)}
      .sf-crawler-track{display:flex;width:max-content;will-change:transform;animation:sfCrawlerMove var(--sf-crawl-duration) linear infinite}.sf-crawler.paused .sf-crawler-track,.sf-crawler:focus-within .sf-crawler-track{animation-play-state:paused}
      .sf-crawler-group{display:flex;align-items:center;flex:none;padding-right:28px}.sf-crawler-item{display:inline-flex;align-items:center;gap:7px;height:30px;margin:0;padding:0 12px;border:0;border-right:1px solid rgba(126,151,181,.14);background:transparent;color:var(--text);font:inherit;white-space:nowrap;cursor:pointer}.sf-crawler-item:focus-visible{outline:2px solid var(--blue);outline-offset:-2px;border-radius:4px}.sf-crawler-symbol{font-size:12px;font-weight:950;letter-spacing:.02em}.sf-crawler-price{font-size:11px;color:#d5e1ee}.sf-crawler-change{font-size:11px;font-weight:850}.sf-crawler-change.up{color:var(--green)}.sf-crawler-change.down{color:var(--red)}.sf-crawler-state{font-size:9px;font-weight:900;letter-spacing:.035em;padding:3px 5px;border:1px solid #31475e;border-radius:999px;color:#9bb0c8}.sf-crawler-state.buy-now{color:var(--green);border-color:rgba(47,209,139,.55)}.sf-crawler-state.ready-soon{color:var(--blue);border-color:rgba(78,161,255,.55)}.sf-crawler-state.building,.sf-crawler-state.wait-for-pullback{color:var(--orange);border-color:rgba(244,163,64,.5)}.sf-crawler-state.avoid,.sf-crawler-state.sell-exit{color:var(--red);border-color:rgba(239,98,98,.5)}.sf-crawler-metric{font-size:10px;color:#8095ae}.sf-crawler-metric b{color:#b9cade}.sf-crawler-pause{width:38px;height:38px;border:0;border-left:1px solid var(--border);background:#07111f;color:#7e95af;font-size:12px;cursor:pointer}.sf-crawler-pause:hover{color:var(--text)}.sf-crawler-placeholder{display:flex;align-items:center;height:38px;padding:0 18px;color:var(--muted);font-size:11px}
      @keyframes sfCrawlerMove{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
      @media(max-width:760px){.sf-crawler{height:35px;grid-template-columns:auto minmax(0,1fr) 34px}.sf-crawler-label{padding:0 7px;font-size:9px}.sf-crawler-label strong{display:none}.sf-crawler-item{height:28px;padding:0 9px;gap:5px}.sf-crawler-symbol{font-size:11px}.sf-crawler-price,.sf-crawler-change{font-size:10px}.sf-crawler-state{font-size:8px}.sf-crawler-metric{font-size:9px}.sf-crawler-pause{width:34px;height:35px}}
      @media(prefers-reduced-motion:reduce){.sf-crawler-window{overflow-x:auto;mask-image:none;-webkit-mask-image:none}.sf-crawler-track{animation:none}.sf-crawler-group:nth-child(2){display:none}}
    `;document.head.appendChild(s);
  }

  async function refresh(){
    const track=document.getElementById('sfCrawlerTrack');if(!track)return;
    try{
      const res=await fetch(`${API}/api/opportunity-radar`,{headers:{accept:'application/json'},cache:'no-store'}),body=await res.json();
      if(!res.ok)throw new Error(body.error||`HTTP ${res.status}`);
      const rows=Array.isArray(body?.radar?.symbols)?body.radar.symbols:[];
      render(rows);
    }catch(error){track.innerHTML='<div class="sf-crawler-placeholder">Radar crawler temporarily unavailable.</div>';console.warn('Radar crawler unavailable',error);}
  }

  function render(rows){
    const root=document.getElementById('sfMarketCrawler'),track=document.getElementById('sfCrawlerTrack');if(!root||!track)return;
    if(!rows.length){track.innerHTML='<div class="sf-crawler-placeholder">Radar is warming up — no live candidates yet.</div>';return;}
    const items=rows.map(itemHtml).join(''),group=`<div class="sf-crawler-group">${items}</div>`;
    track.innerHTML=group+group;
    root.style.setProperty('--sf-crawl-duration',`${Math.max(34,rows.length*8)}s`);
    track.querySelectorAll('[data-crawler-symbol]').forEach(btn=>btn.addEventListener('click',()=>loadSymbol(btn.dataset.crawlerSymbol)));
  }

  function itemHtml(r){
    const u=r.unifiedAction||{},state=String(u.state||'QUIET'),readiness=u.readiness==null?'—':Math.round(Number(u.readiness)||0),gates=`${Number(u.gatesReady)||0}/${Number(u.gateTotal)||4}`,change=Number(r.changePct)||0;
    return`<button type="button" class="sf-crawler-item" data-crawler-symbol="${clean(r.symbol)}" aria-label="Open ${clean(r.symbol)}, ${clean(state)}, readiness ${readiness}, gates ${gates}"><span class="sf-crawler-symbol">${clean(r.symbol)}</span><span class="sf-crawler-price">${money(r.price)}</span><span class="sf-crawler-change ${change>=0?'up':'down'}">${pct(change)}</span><span class="sf-crawler-state ${stateClass(state)}">${clean(state)}</span><span class="sf-crawler-metric">Ready <b>${readiness}</b></span><span class="sf-crawler-metric">Gates <b>${gates}</b></span></button>`;
  }

  function loadSymbol(symbol){
    const input=document.getElementById('symbolInput'),load=document.getElementById('loadSymbolBtn');
    if(input)input.value=symbol;
    load?.click();
  }

  function togglePause(){
    const root=document.getElementById('sfMarketCrawler'),btn=document.getElementById('sfCrawlerPause');if(!root||!btn)return;
    paused=!paused;root.classList.toggle('paused',paused);btn.setAttribute('aria-pressed',String(paused));btn.setAttribute('aria-label',paused?'Resume stock crawler':'Pause stock crawler');btn.title=paused?'Resume crawler':'Pause crawler';btn.textContent=paused?'▶':'Ⅱ';
  }

  ensureUi();
  refresh();
  setInterval(refresh,60_000);
})();
