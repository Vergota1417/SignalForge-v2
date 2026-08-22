(() => {
  'use strict';

  const main=()=>document.querySelector('.main-content');
  const navButtons=()=>[...document.querySelectorAll('.topnav .nav-btn')];
  const AUX_SELECTORS=['#smartScreenerView','#simulationView','.portfolio-panel','#alertHistoryPanel'];
  let dashboardSections=[];

  function captureDashboardSections(){
    const root=main();if(!root)return;
    dashboardSections=[...root.children].filter(section=>!matchesAux(section));
  }
  function matchesAux(section){return AUX_SELECTORS.some(selector=>section.matches?.(selector));}
  function allMainSections(){return [...(main()?.children||[])];}
  function setActive(button){navButtons().forEach(btn=>btn.classList.toggle('active',btn===button));}
  function dashboardButton(){return document.getElementById('dashboardNavBtn');}

  function showOnly(target,button){
    if(!target)return;
    allMainSections().forEach(section=>{section.hidden=section!==target;});
    setActive(button||null);
    target.hidden=false;
  }
  function showDashboard(){
    if(!dashboardSections.length)captureDashboardSections();
    const keep=new Set(dashboardSections.filter(section=>section.isConnected));
    allMainSections().forEach(section=>{section.hidden=!keep.has(section);});
    setActive(dashboardButton());
  }
  function reconcileNav(button){
    const label=String(button?.textContent||'').trim();
    if(button?.id==='dashboardNavBtn'||label==='Dashboard'){showDashboard();return;}
    if(button?.id==='screenerNavBtn'||label==='Screener'){showOnly(document.getElementById('smartScreenerView'),button);return;}
    if(button?.id==='simulationNavBtn'||label==='Simulation'){showOnly(document.getElementById('simulationView'),button);return;}
    if(label==='Portfolio'){showOnly(document.querySelector('.portfolio-panel'),button);return;}
    if(label==='Alerts'){showOnly(document.getElementById('alertHistoryPanel'),button);}
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
      button.textContent='!';
      button.title='Refresh failed. Tap again.';
      setTimeout(()=>{button.textContent=original;button.disabled=false;button.removeAttribute('aria-busy');button.dataset.sfRefreshing='0';},1400);
    }
  }

  document.addEventListener('click',event=>{
    const scan=event.target.closest?.('#scanBtn');
    if(scan){event.preventDefault();refreshScanner(scan);return;}

    const nav=event.target.closest?.('.topnav .nav-btn');
    if(nav&&!nav.disabled){setTimeout(()=>reconcileNav(nav),0);return;}

    if(event.target.closest?.('#sfScreenBack,#sfSimBack,#closeAlertHistory,.portfolio-panel [data-close]')){
      setTimeout(showDashboard,0);
    }
  });

  const observer=new MutationObserver(()=>{
    if(!dashboardSections.length)captureDashboardSections();
    const active=navButtons().find(btn=>btn.classList.contains('active'));
    if(active)setTimeout(()=>reconcileNav(active),0);
  });

  captureDashboardSections();
  const root=main();if(root)observer.observe(root,{childList:true});
  window.SignalForgeUiRouter={showDashboard,reconcileNav,refreshScanner};
})();
