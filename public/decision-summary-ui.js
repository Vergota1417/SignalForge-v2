(() => {
  'use strict';
  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||window.location.origin).replace(/\/$/,'');
  const DETAILS_KEY='signalforge_show_details_v1';
  const NEAR_READY_MS=15*60*1000;
  const DEEP_REFRESH_MS=4*60*60*1000;
  let timer=null,lastSymbol='';

  function ensureStyles(){
    if(document.getElementById('sfDecisionSummaryStyles'))return;
    const style=document.createElement('style');
    style.id='sfDecisionSummaryStyles';
    style.textContent=`
      .sf-decision-summary{margin:10px 0 12px;padding:14px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(135deg,rgba(78,161,255,.08),var(--panel) 42%,var(--panel-2));box-shadow:0 10px 28px rgba(0,0,0,.12)}
      .sf-summary-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sf-summary-eyebrow{font-size:9px;font-weight:850;letter-spacing:.09em;color:var(--muted)}.sf-summary-action{font-size:20px;font-weight:950;line-height:1.1;margin-top:4px}.sf-summary-action.buy{color:var(--green)}.sf-summary-action.wait,.sf-summary-action.setup{color:var(--yellow)}.sf-summary-action.pullback{color:var(--orange)}.sf-summary-action.avoid,.sf-summary-action.sell{color:var(--red)}
      .sf-summary-time{text-align:right;font-size:9px;color:var(--muted);line-height:1.45;min-width:112px}.sf-summary-time strong{display:block;color:var(--text);font-size:11px}
      .sf-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:12px}.sf-summary-cell{padding:9px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.018)}.sf-summary-cell small{display:block;color:var(--muted);font-size:8px;font-weight:750;text-transform:uppercase;letter-spacing:.06em}.sf-summary-cell strong{display:block;margin-top:3px;font-size:11px;color:var(--text)}.sf-summary-cell .exp{display:block;margin-top:2px;font-size:8px;color:var(--muted)}
      .sf-summary-cell.good strong{color:var(--green)}.sf-summary-cell.caution strong{color:var(--orange)}.sf-summary-cell.blocked strong{color:var(--red)}.sf-summary-cell.pending strong{color:var(--yellow)}
      .sf-summary-explain{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.sf-summary-box{padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--panel-2)}.sf-summary-box small{display:block;color:var(--muted);font-size:8px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.sf-summary-box strong{display:block;margin-top:4px;font-size:11px;line-height:1.45;color:var(--text)}
      .sf-summary-actions{display:flex;justify-content:flex-end;margin-top:9px}.sf-details-toggle{border:1px solid var(--border);background:transparent;color:var(--text);border-radius:8px;padding:7px 10px;font-size:10px;font-weight:800;cursor:pointer}
      body.sf-simple-mode .status-strip,body.sf-simple-mode .engine-section,body.sf-simple-mode .bottom-grid,body.sf-simple-mode #sfSessionRangeShadow,body.sf-simple-mode #sfOpeningRangeShadow{display:none!important}
      @media(max-width:700px){.sf-decision-summary{padding:11px}.sf-summary-top{align-items:center}.sf-summary-action{font-size:17px}.sf-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-summary-explain{grid-template-columns:1fr}.sf-summary-time{min-width:92px}.sf-summary-cell{padding:8px}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel(){
    ensureStyles();
    let panel=document.getElementById('sfDecisionSummary');
    if(panel)return panel;
    const hero=document.querySelector('.hero-card');if(!hero)return null;
    panel=document.createElement('section');panel.id='sfDecisionSummary';panel.className='sf-decision-summary';panel.setAttribute('aria-live','polite');
    panel.innerHTML=`
      <div class="sf-summary-top"><div><div class="sf-summary-eyebrow">DECISION SUMMARY</div><div class="sf-summary-action wait" data-summary-action>ANALYZING</div></div><div class="sf-summary-time"><span>Last checked</span><strong data-last-check>—</strong><span data-next-check>Next check —</span></div></div>
      <div class="sf-summary-grid">
        <div class="sf-summary-cell pending" data-cell-setup><small>Setup quality</small><strong data-setup>—</strong></div>
        <div class="sf-summary-cell pending" data-cell-entry><small>Entry location</small><strong data-entry>—</strong></div>
        <div class="sf-summary-cell pending" data-cell-participation><small>Participation</small><strong data-participation>—</strong></div>
        <div class="sf-summary-cell pending" data-cell-room><small>Room to run</small><strong data-room>—</strong><span class="exp">experimental</span></div>
        <div class="sf-summary-cell pending" data-cell-opening><small>Opening structure</small><strong data-opening>—</strong><span class="exp">experimental</span></div>
        <div class="sf-summary-cell pending" data-cell-rr><small>Risk / reward</small><strong data-rr>—</strong></div>
      </div>
      <div class="sf-summary-explain"><div class="sf-summary-box"><small>Why not buy?</small><strong data-blocker>Waiting for the current decision.</strong></div><div class="sf-summary-box"><small>What needs to happen next?</small><strong data-next-step>SignalForge is checking the production gates.</strong></div></div>
      <div class="sf-summary-actions"><button class="sf-details-toggle" type="button" data-details-toggle>Show Details</button></div>`;
    hero.insertAdjacentElement('afterend',panel);
    const btn=panel.querySelector('[data-details-toggle]');btn.addEventListener('click',toggleDetails);
    applyDetailsPreference();
    return panel;
  }

  async function refresh(){
    const panel=ensurePanel();if(!panel)return;
    const symbol=String(document.getElementById('tickerBadge')?.textContent||'').trim().toUpperCase();if(!symbol)return;
    lastSymbol=symbol;
    try{
      const response=await fetch(`${API}/api/signals`,{headers:{accept:'application/json'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const body=await response.json(),row=(body.signals||[]).find(x=>String(x.symbol||'').toUpperCase()===symbol)||null;
      if(lastSymbol!==symbol)return;
      render(panel,row);
    }catch(error){renderFallback(panel,String(error?.message||'request failed'));}
  }

  function render(panel,row){
    const a=row?.analysis||null,status=String(row?.status||a?.status||document.getElementById('statusBadge')?.textContent||'WAIT — SETUP NOT READY').trim();
    const exec=a?.execution||{},confirmation=a?.intradayConfirmation||{},range=a?.sessionRangeShadow||{},opening=range?.openingRangeShadow||{};
    const rr=finite(exec.currentRr)?Number(exec.currentRr):finite(a?.rr)?Number(a.rr):null;
    const action=actionFor(status);setText(panel,'[data-summary-action]',action.label);panel.querySelector('[data-summary-action]').className=`sf-summary-action ${action.kind}`;

    const readiness=finite(a?.readiness)?Number(a.readiness):0;
    setMetric(panel,'setup',readiness>=82?'STRONG':readiness>=60?'BUILDING':'WEAK',readiness>=82?'good':readiness>=60?'pending':'blocked');
    const nearEntry=exec.nearEntry===true;
    setMetric(panel,'entry',nearEntry?'GOOD':a?.engines?.entry?.ready?'READY':'OUTSIDE ZONE',nearEntry?'good':a?.engines?.entry?.ready?'pending':'blocked');
    const participation=confirmation.participationPass===true;
    setMetric(panel,'participation',participation?'CONFIRMED':a?.dailyGatesReady?'WAITING':'PENDING',participation?'good':'pending');
    const roomState=String(range?.state||'COLLECTING').toUpperCase();setMetric(panel,'room',roomState,shadowTone(roomState));
    const openingState=String(opening?.state||'COLLECTING').toUpperCase();setMetric(panel,'opening',openingState,openingTone(openingState));
    setMetric(panel,'rr',rr==null?'UNRESOLVED':`${rr.toFixed(2)} : 1${rr>=1.8?' PASS':' BLOCKED'}`,rr!=null&&rr>=1.8?'good':'blocked');

    const blockers=Array.isArray(exec.blockers)?exec.blockers:[];
    const blockerCopy=blockerFor(a,status,blockers,rr);
    setText(panel,'[data-blocker]',blockerCopy.why);
    setText(panel,'[data-next-step]',blockerCopy.next);
    const updated=Number(row?.updatedAt)||0;setText(panel,'[data-last-check]',ageLabel(updated));setText(panel,'[data-next-check]',nextCheckLabel(status,a,updated));
  }

  function blockerFor(a,status,blockers,rr){
    if(status==='BUY NOW')return{why:'Nothing is blocking BUY NOW. All production gates are currently cleared.',next:'If you act, use the displayed thesis-break/stop and structure target. SignalForge will keep rechecking the setup.'};
    if(status==='SELL / EXIT')return{why:'The saved thesis-break level has failed.',next:'Treat the setup as invalid until higher-timeframe structure repairs and a new entry setup forms.'};
    if(status==='AVOID')return{why:a?.reason||'Trend quality is not strong enough for a new entry.',next:'Do not force an entry. Wait for trend and higher-timeframe gates to rebuild.'};
    const first=blockers[0]||'';
    if(first==='CURRENT R/R'||(rr!=null&&rr<1.8))return{why:`Current reward/risk is ${rr==null?'unresolved':`${rr.toFixed(2)}:1`}. BUY NOW requires at least 1.80:1.`,next:'Price/structure must improve enough to restore at least 1.80:1 reward/risk without breaking the thesis.'};
    if(first==='PRICE LOCATION')return{why:'Price is outside the preferred execution area.',next:priceZoneCopy(a)};
    if(first==='PARTICIPATION')return{why:a?.intradayConfirmation?.reason||'Live participation has not confirmed the move yet.',next:'Wait for RVOL of at least 1.00x, positive 1-hour response, and the required 15-minute confirmation.'};
    if(first==='OVEREXTENSION'||status==='WAIT FOR PULLBACK')return{why:'Price is extended and chasing would worsen the entry.',next:`Wait for a pullback below the overextension area${finite(a?.overextension)?` near ${money(a.overextension)}`:''} while the thesis remains intact.`};
    if(first==='THESIS BREAK')return{why:'Current price is at or below the thesis-break area.',next:'No new BUY should occur until structure repairs and a fresh thesis is established.'};
    const failed=Array.isArray(a?.criticalFailed)?a.criticalFailed:[];
    if(first==='HIGHER-TIMEFRAME GATES'||failed.length)return{why:`Higher-timeframe gate${failed.length===1?'':'s'} still blocking: ${failed.join(', ')||'not all four engines are ready'}.`,next:'Let the blocking higher-timeframe gate improve; SignalForge will promote it to execution checks once all four are ready.'};
    return{why:a?.reason||'The setup has not cleared every production BUY requirement.',next:'SignalForge will keep monitoring the candidate and re-evaluate when the required conditions change.'};
  }

  function priceZoneCopy(a){const lo=Number(a?.preferredEntryLow),hi=Number(a?.preferredEntryHigh);return Number.isFinite(lo)&&Number.isFinite(hi)?`Price needs to return toward the preferred entry zone ${money(lo)}–${money(hi)} without breaking the thesis.`:'Price needs to move back into a defensible preferred entry area.';}
  function actionFor(status){if(status==='BUY NOW')return{label:'BUY NOW — GATES CLEARED',kind:'buy'};if(status==='SETUP — READY SOON')return{label:'WAIT — ALMOST READY',kind:'setup'};if(status==='WAIT FOR PULLBACK')return{label:'WAIT — DO NOT CHASE',kind:'pullback'};if(status==='AVOID')return{label:'AVOID NEW ENTRY',kind:'avoid'};if(status==='SELL / EXIT')return{label:'SELL / EXIT',kind:'sell'};return{label:'WAIT — SETUP NOT READY',kind:'wait'};}
  function shadowTone(v){return v==='GOOD'?'good':v==='STRETCHED'?'blocked':v==='CAUTION'?'caution':'pending';}
  function openingTone(v){return v==='ACCEPTED'||v==='RETEST HELD'?'good':v==='REJECTED'?'blocked':v==='BREAKOUT TEST'?'caution':'pending';}
  function setMetric(panel,key,value,tone){const cell=panel.querySelector(`[data-cell-${key}]`);if(cell)cell.className=`sf-summary-cell ${tone}`;setText(panel,`[data-${key}]`,value);}
  function setText(panel,selector,value){const el=panel.querySelector(selector);if(el)el.textContent=String(value??'—');}
  function ageLabel(ts){if(!ts)return'not yet';const d=Math.max(0,Date.now()-ts),m=Math.floor(d/60000);if(m<1)return'just now';if(m<60)return`${m} min ago`;const h=Math.floor(m/60);return`${h}h ${m%60}m ago`;}
  function nextCheckLabel(status,a,updated){if(!updated)return'Next check pending';const near=Boolean(a?.dailyGatesReady||status==='SETUP — READY SOON'||status==='WAIT FOR PULLBACK'||status==='BUY NOW'),interval=near?NEAR_READY_MS:DEEP_REFRESH_MS,due=updated+interval,remain=due-Date.now();if(remain<=0)return'Next check due now';const mins=Math.ceil(remain/60000);return near?`Next check ~${mins} min`:`Next deep check ~${Math.max(1,Math.ceil(mins/60))}h`;}
  function toggleDetails(){const showing=!document.body.classList.contains('sf-simple-mode');localStorage.setItem(DETAILS_KEY,showing?'0':'1');applyDetailsPreference();}
  function applyDetailsPreference(){const show=localStorage.getItem(DETAILS_KEY)==='1';document.body.classList.toggle('sf-simple-mode',!show);const btn=document.querySelector('[data-details-toggle]');if(btn)btn.textContent=show?'Hide Details':'Show Details';}
  function renderFallback(panel,message){setText(panel,'[data-blocker]',`Saved signal summary unavailable: ${message}.`);setText(panel,'[data-next-step]','The main decision card remains authoritative until the saved summary refreshes.');}
  function money(v){const n=Number(v);return Number.isFinite(n)?`$${n.toFixed(2)}`:'—';}
  function finite(v){return Number.isFinite(Number(v));}
  function schedule(){clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh();},60_000);}

  const ticker=document.getElementById('tickerBadge');if(ticker)new MutationObserver(()=>setTimeout(refresh,130)).observe(ticker,{childList:true,subtree:true,characterData:true});
  const status=document.getElementById('statusBadge');if(status)new MutationObserver(()=>setTimeout(refresh,170)).observe(status,{childList:true,subtree:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  window.addEventListener('load',()=>setTimeout(refresh,350));setTimeout(refresh,500);schedule();
})();
