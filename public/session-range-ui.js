(() => {
  'use strict';
  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const REFRESH_MS=60_000;
  let timer=null,lastSymbol='';

  function ensureStyles(){
    if(document.getElementById('sfSessionRangeStyles'))return;
    const style=document.createElement('style');style.id='sfSessionRangeStyles';style.textContent=`
      .sf-range-shadow{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(0,1.3fr);gap:12px;margin-top:10px;padding:11px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}
      .sf-range-shadow-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sf-range-shadow-title{font-size:12px;font-weight:900;letter-spacing:.03em}.sf-range-shadow-badge{font-size:9px;font-weight:900;letter-spacing:.07em;padding:3px 6px;border:1px solid currentColor;border-radius:999px}
      .sf-range-shadow.good{color:var(--green)}.sf-range-shadow.normal{color:var(--blue)}.sf-range-shadow.caution{color:var(--orange)}.sf-range-shadow.stretched{color:var(--red)}.sf-range-shadow.insufficient{color:var(--muted)}
      .sf-range-shadow-copy{margin-top:5px;color:var(--muted);font-size:10px;line-height:1.4}.sf-range-shadow-note{margin-top:5px;font-size:9px;color:var(--muted)}
      .sf-range-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.sf-range-metric{padding:7px 8px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,.015)}.sf-range-metric small{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.06em}.sf-range-metric strong{display:block;color:var(--text);font-size:11px;margin-top:2px}
      @media(max-width:700px){.sf-range-shadow{grid-template-columns:1fr}.sf-range-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;document.head.appendChild(style);
  }

  function ensurePanel(){
    ensureStyles();
    let panel=document.getElementById('sfSessionRangeShadow');if(panel)return panel;
    const anchor=document.getElementById('chartAction')||document.querySelector('.chart-card');if(!anchor)return null;
    panel=document.createElement('section');panel.id='sfSessionRangeShadow';panel.className='sf-range-shadow insufficient';panel.setAttribute('aria-live','polite');panel.innerHTML=`
      <div><div class="sf-range-shadow-head"><span class="sf-range-shadow-title">ROOM TO RUN</span><span class="sf-range-shadow-badge" data-range-state>SHADOW</span></div><div class="sf-range-shadow-copy" data-range-copy>Waiting for the next 15-minute execution scan.</div><div class="sf-range-shadow-note">Experimental only · does not block or create BUY NOW.</div></div>
      <div class="sf-range-metrics"><div class="sf-range-metric"><small>ATR used</small><strong data-atr-usage>—</strong></div><div class="sf-range-metric"><small>Vs median day</small><strong data-median-usage>—</strong></div><div class="sf-range-metric"><small>Same-time pace</small><strong data-pace>—</strong></div><div class="sf-range-metric"><small>Price in range</small><strong data-position>—</strong></div></div>`;
    anchor.insertAdjacentElement('afterend',panel);return panel;
  }

  async function refresh(){
    const panel=ensurePanel();if(!panel)return;
    const symbol=String(document.getElementById('tickerBadge')?.textContent||'').trim().toUpperCase();if(!symbol)return;
    lastSymbol=symbol;
    try{
      const response=await fetch(`${API}/api/signals`,{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const body=await response.json(),row=(body.signals||[]).find(x=>String(x.symbol||'').toUpperCase()===symbol),range=row?.analysis?.sessionRangeShadow||null;
      if(lastSymbol!==symbol)return;
      render(panel,range);
    }catch(error){render(panel,null,`Room-to-run shadow unavailable: ${String(error?.message||'request failed')}`);}
  }

  function render(panel,range,error=''){
    const state=String(range?.state||'INSUFFICIENT').toUpperCase(),cls=state.toLowerCase();panel.className=`sf-range-shadow ${['good','normal','caution','stretched'].includes(cls)?cls:'insufficient'}`;
    panel.querySelector('[data-range-state]').textContent=state==='INSUFFICIENT'?'COLLECTING':state;
    panel.querySelector('[data-range-copy]').textContent=error||range?.reason||'Waiting for a 15-minute execution scan to calculate session range.';
    panel.querySelector('[data-atr-usage]').textContent=pctRatio(range?.atrUsage);
    panel.querySelector('[data-median-usage]').textContent=pctRatio(range?.medianRangeUsage);
    panel.querySelector('[data-pace]').textContent=ratio(range?.sameTimePace);
    panel.querySelector('[data-position]').textContent=pctRatio(range?.rangePosition);
  }
  function pctRatio(v){const n=Number(v);return Number.isFinite(n)?`${Math.round(n*100)}%`:'—';}
  function ratio(v){const n=Number(v);return Number.isFinite(n)?`${n.toFixed(2)}x`:'—';}
  function schedule(){clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh();},REFRESH_MS);}

  const ticker=document.getElementById('tickerBadge');if(ticker)new MutationObserver(()=>setTimeout(refresh,120)).observe(ticker,{childList:true,subtree:true,characterData:true});
  const status=document.getElementById('statusBadge');if(status)new MutationObserver(()=>setTimeout(refresh,160)).observe(status,{childList:true,subtree:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  window.addEventListener('load',()=>setTimeout(refresh,350));
  setTimeout(refresh,500);schedule();
})();
