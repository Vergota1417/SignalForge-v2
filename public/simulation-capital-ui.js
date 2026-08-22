(() => {
  'use strict';
  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  const TOKEN_KEY='signalforge_push_test_token_v1';
  let refreshTimer=null;

  async function authHeaders(){
    const token=localStorage.getItem(TOKEN_KEY)||'';
    if(!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw new Error('Enable phone alerts first so SignalForge can authorize simulation money changes.');
    if(!('serviceWorker'in navigator))throw new Error('Simulation money changes require the installed SignalForge app or a browser with service workers.');
    const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager?.getSubscription();
    if(!sub?.endpoint)throw new Error('Enable phone alerts first so SignalForge can authorize simulation money changes.');
    return{'x-sf-endpoint':sub.endpoint,'x-sf-token':token};
  }

  async function post(path,body){
    const auth=await authHeaders();
    const res=await fetch(`${API}${path}`,{method:'POST',headers:{accept:'application/json','content-type':'application/json',...auth},body:JSON.stringify(body||{})});
    const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);return data;
  }

  async function loadSnapshot(){
    try{const res=await fetch(`${API}/api/screener?limit=5`,{headers:{accept:'application/json'}}),data=await res.json();if(res.ok&&data?.screener?.simulation)applySnapshot(data.screener.simulation);}catch(error){console.warn('[SignalForge Simulation Capital] snapshot unavailable',error);}
  }

  function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function install(){
    const view=document.getElementById('simulationView');if(!view)return false;if(document.getElementById('sfSimCapitalControls'))return true;
    const hero=view.querySelector('.sf-sim-hero');if(!hero)return false;
    const panel=document.createElement('section');panel.id='sfSimCapitalControls';panel.className='sf-sim-capital';
    panel.innerHTML=`<div class="sf-sim-capital-copy"><div class="eyebrow">Real-size paper account</div><h2>Match the simulation to money you actually have</h2><p>Starting capital and later deposits are tracked separately from trading profit, so adding cash can never make SignalForge look more profitable.</p></div><div class="sf-sim-capital-grid"><div class="sf-sim-capital-card"><label>Starting capital<input id="sfSimStartAmount" type="number" min="1" step="0.01" value="300" inputmode="decimal"></label><button id="sfSimSetStart" type="button">Set starting capital</button><small id="sfSimStartHelp">Available only before the first paper trade or contribution.</small></div><div class="sf-sim-capital-card"><label>Add contribution<input id="sfSimContributionAmount" type="number" min="0.01" step="0.01" placeholder="100" inputmode="decimal"></label><label>Note <input id="sfSimContributionNote" maxlength="200" placeholder="Weekly deposit"></label><button id="sfSimAddContribution" type="button">Add contribution</button></div></div><div id="sfSimCapitalSummary" class="sf-sim-capital-summary">Waiting for paper-account totals…</div><div id="sfSimCapitalMsg" class="sf-sim-capital-msg" aria-live="polite"></div>`;
    hero.insertAdjacentElement('afterend',panel);injectStyles();
    document.getElementById('sfSimSetStart').addEventListener('click',setStart);document.getElementById('sfSimAddContribution').addEventListener('click',addContribution);observeSimulation();loadSnapshot();return true;
  }

  function injectStyles(){
    if(document.getElementById('sfSimCapitalStyles'))return;
    const style=document.createElement('style');style.id='sfSimCapitalStyles';style.textContent=`.sf-sim-capital{display:grid;gap:12px;padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}.sf-sim-capital-copy h2{margin:2px 0 5px}.sf-sim-capital-copy p{margin:0;color:var(--muted);max-width:800px}.sf-sim-capital-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sf-sim-capital-card{display:grid;gap:8px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}.sf-sim-capital-card label{display:grid;gap:4px;color:var(--muted);font-size:11px}.sf-sim-capital-card input{width:100%;min-height:42px;border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--panel);color:var(--text);font-size:16px}.sf-sim-capital-card button{min-height:42px;border:1px solid #2a5a8c;border-radius:8px;background:#17375a;color:var(--text);cursor:pointer;font-weight:750}.sf-sim-capital-card button:disabled{opacity:.45;cursor:not-allowed}.sf-sim-capital-card small,.sf-sim-capital-msg{color:var(--muted);font-size:11px}.sf-sim-capital-msg[data-error="1"]{color:var(--red)}.sf-sim-capital-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.sf-sim-capital-summary>div{padding:10px;border-radius:9px;background:var(--panel-2)}.sf-sim-capital-summary strong{display:block;font-size:16px}.sf-sim-capital-summary span{color:var(--muted);font-size:10px}@media(max-width:700px){.sf-sim-capital-grid,.sf-sim-capital-summary{grid-template-columns:1fr 1fr}}@media(max-width:430px){.sf-sim-capital-grid,.sf-sim-capital-summary{grid-template-columns:1fr}}`;document.head.appendChild(style);
  }

  async function setStart(){
    const btn=document.getElementById('sfSimSetStart'),amount=Number(document.getElementById('sfSimStartAmount').value);btn.disabled=true;showMsg('Updating starting capital…');
    try{const data=await post('/api/simulation/start',{amount});applySnapshot(data.simulation);showMsg(`Starting capital set to ${money(amount)}.`);refreshSimulation();}
    catch(error){showMsg(error.message||'Unable to update starting capital.',true);}finally{btn.disabled=false;loadSnapshot();}
  }

  async function addContribution(){
    const btn=document.getElementById('sfSimAddContribution'),amount=Number(document.getElementById('sfSimContributionAmount').value),note=document.getElementById('sfSimContributionNote').value.trim();btn.disabled=true;showMsg('Adding contribution…');
    try{const data=await post('/api/simulation/contribution',{amount,note});document.getElementById('sfSimContributionAmount').value='';document.getElementById('sfSimContributionNote').value='';applySnapshot(data.simulation);showMsg(`${money(amount)} contribution added. It will not count as trading profit.`);refreshSimulation();}
    catch(error){showMsg(error.message||'Unable to add contribution.',true);}finally{btn.disabled=false;loadSnapshot();}
  }

  function showMsg(message,error=false){const el=document.getElementById('sfSimCapitalMsg');if(!el)return;el.textContent=message;el.dataset.error=error?'1':'0';}
  function refreshSimulation(){document.getElementById('sfSimRefresh')?.click();}

  function applySnapshot(s){
    if(!s)return;
    const root=document.getElementById('sfSimCapitalSummary');if(root)root.innerHTML=[[money(s.startingCash),'Starting capital'],[money(s.contributed),'Added contributions'],[money(s.netDeposits),'Total money deposited'],[money(s.strategyPnl),'SignalForge P/L']].map(([v,l])=>`<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('');
    const start=document.getElementById('sfSimStartAmount'),btn=document.getElementById('sfSimSetStart'),help=document.getElementById('sfSimStartHelp');if(start&&document.activeElement!==start)start.value=Number(s.startingCash||300).toFixed(2);if(btn)btn.disabled=Boolean(s.capitalLocked);if(help)help.textContent=s.capitalLocked?'Starting capital is locked. Use contributions for new money.':'Available until the first paper trade or contribution.';
  }

  function observeSimulation(){
    const status=document.getElementById('sfSimStatus');if(!status)return;
    new MutationObserver(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(loadSnapshot,250);}).observe(status,{childList:true,subtree:true,characterData:true});
  }

  if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer);},250);}
})();
