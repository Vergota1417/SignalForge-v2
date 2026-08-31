(() => {
  'use strict';

  const main=()=>document.querySelector('.main-content');
  const navButtons=()=>[...document.querySelectorAll('.topnav .nav-btn')];
  const AUX_SELECTORS=['#smartScreenerView','#simulationView','.portfolio-panel','#alertHistoryPanel','#sfAnalysisDock','#sfSystemDock'];
  let dashboardSections=[];

  function captureDashboardSections(){
    const root=main();if(!root)return;
    dashboardSections=[...root.children].filter(section=>!matchesAux(section));
  }
  function matchesAux(section){return AUX_SELECTORS.some(selector=>section.matches?.(selector));}
  function allMainSections(){return [...(main()?.children||[])];}
  function setActive(button){navButtons().forEach(btn=>btn.classList.toggle('active',btn===button));}
  function dashboardButton(){return document.getElementById('dashboardNavBtn');}
  function setView(name){
    [...document.body.classList].filter(x=>x.startsWith('sf-view-')).forEach(x=>document.body.classList.remove(x));
    document.body.classList.add(`sf-view-${name}`);document.body.dataset.sfView=name;
    window.dispatchEvent(new CustomEvent('signalforge:view-changed',{detail:{view:name}}));
  }

  function showOnly(target,button,view='dashboard'){
    if(!target)return false;
    allMainSections().forEach(section=>{section.hidden=section!==target;});
    setActive(button||null);target.hidden=false;setView(view);return true;
  }
  function showDashboard(){
    if(!dashboardSections.length)captureDashboardSections();
    const keep=new Set(dashboardSections.filter(section=>section.isConnected));
    allMainSections().forEach(section=>{section.hidden=!keep.has(section);});
    setActive(dashboardButton());setView('dashboard');
  }
  function showDock(id,button,view){
    const target=document.getElementById(id);
    if(showOnly(target,button,view))return;
    setActive(button||null);setView(view);
    setTimeout(()=>{const retry=document.getElementById(id);if(retry)showOnly(retry,button,view);},140);
  }
  function reconcileNav(button){
    const label=String(button?.textContent||'').trim();
    if(button?.id==='dashboardNavBtn'||label==='Dashboard'){showDashboard();return;}
    if(button?.id==='screenerNavBtn'||label==='Screener'){showOnly(document.getElementById('smartScreenerView'),button,'screener');return;}
    if(button?.id==='analysisNavBtn'||label==='Analysis'){showDock('sfAnalysisDock',button,'analysis');return;}
    if(button?.id==='systemNavBtn'||label==='System'){showDock('sfSystemDock',button,'system');return;}
    if(button?.id==='simulationNavBtn'||label==='Simulation'){showOnly(document.getElementById('simulationView'),button,'simulation');return;}
    if(label==='Portfolio'){showOnly(document.querySelector('.portfolio-panel'),button,'portfolio');return;}
    if(label==='Alerts'){showOnly(document.getElementById('alertHistoryPanel'),button,'alerts');}
  }

  async function refreshScanner(button){
    if(button.dataset.sfRefreshing==='1')return;
    button.dataset.sfRefreshing='1';button.disabled=true;button.setAttribute('aria-busy','true');
    const original=button.textContent;button.textContent='…';
    try{
      const base=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
      const stamp=Date.now();
      const responses=await Promise.all([
        fetch(`${base}/api/signals?_=${stamp}`,{headers:{accept:'application/json'},cache:'no-store'}),
        fetch(`${base}/api/opportunity-radar?_=${stamp}`,{headers:{accept:'application/json'},cache:'no-store'})
      ]);
      if(responses.some(res=>!res.ok))throw new Error('Saved scanner refresh failed.');
      button.textContent='✓';
      setTimeout(()=>location.reload(),180);
    }catch(error){
      console.warn('[SignalForge UI] scanner refresh failed',error);
      button.textContent='!';button.title='Refresh failed. Tap again.';
      setTimeout(()=>{button.textContent=original;button.disabled=false;button.removeAttribute('aria-busy');button.dataset.sfRefreshing='0';},1400);
    }
  }

  document.addEventListener('click',event=>{
    const scan=event.target.closest?.('#scanBtn');
    if(scan){event.preventDefault();refreshScanner(scan);return;}
    const nav=event.target.closest?.('.topnav .nav-btn');
    if(nav&&!nav.disabled){setTimeout(()=>reconcileNav(nav),0);return;}
    if(event.target.closest?.('#sfScreenBack,#sfSimBack,#closeAlertHistory,.portfolio-panel [data-close]'))setTimeout(showDashboard,0);
  });

  const observer=new MutationObserver(()=>{
    if(!dashboardSections.length)captureDashboardSections();
    const active=navButtons().find(btn=>btn.classList.contains('active'));
    if(active)setTimeout(()=>reconcileNav(active),0);
  });

  captureDashboardSections();
  const root=main();if(root)observer.observe(root,{childList:true});
  setView('dashboard');
  window.SignalForgeUiRouter={showDashboard,reconcileNav,refreshScanner,showAnalysis:()=>reconcileNav(document.getElementById('analysisNavBtn')),showSystem:()=>reconcileNav(document.getElementById('systemNavBtn'))};
})();
