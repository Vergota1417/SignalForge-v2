(() => {
  'use strict';

  const $=id=>document.getElementById(id);

  function ensureStyles(){
    if($('sfGateUiStyles'))return;
    const style=document.createElement('style');
    style.id='sfGateUiStyles';
    style.textContent=`
      .gate-rail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:10px}
      .gate-chip{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--panel-2);font-size:10px;font-weight:750}
      .gate-dot{width:7px;height:7px;border-radius:50%}
      .gate-chip.pass{color:var(--green)}.gate-chip.pass .gate-dot{background:var(--green)}
      .gate-chip.warn{color:var(--orange)}.gate-chip.warn .gate-dot{background:var(--orange)}
      .gate-chip.fail{color:var(--red)}.gate-chip.fail .gate-dot{background:var(--red)}
      .gate-chip-name{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gate-chip-state{font-size:9px;letter-spacing:.05em}
      .supporting-checks{display:block;margin-top:4px;color:var(--muted);font-size:11px}
      @media(max-width:430px){.gate-rail{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureRail(){
    const copy=document.querySelector('.readiness-copy');
    if(!copy)return null;
    let rail=$('gateRail');
    if(!rail){
      rail=document.createElement('div');
      rail.id='gateRail';
      rail.className='gate-rail';
      copy.appendChild(rail);
    }
    return rail;
  }

  function syncGateUi(){
    ensureStyles();
    const cards=[...document.querySelectorAll('#engineGrid .engine-card')];
    if(!cards.length)return;

    let ready=0;
    let passedChecks=0;
    let totalChecks=0;
    const gates=cards.map(card=>{
      const rawName=card.querySelector('.engine-name')?.textContent?.trim()||'Gate';
      const name=rawName.replace(/^\d+\.\s*/, '');
      const state=(card.querySelector('.engine-state')?.textContent||'FAIL').trim().toUpperCase();
      const foot=card.querySelector('.engine-foot')?.textContent||'';
      const counts=foot.match(/(\d+)\s*\/\s*(\d+)\s*passed/i);
      if(counts){passedChecks+=Number(counts[1]);totalChecks+=Number(counts[2]);}
      const isReady=state==='PASS';
      if(isReady)ready++;
      return{name,state,isReady};
    });

    const summary=$('checkSummary');
    if(summary)summary.textContent=`${ready} / ${gates.length} critical gates ready`;

    const gateSummary=$('gateSummary');
    if(gateSummary){
      const blocked=gates.filter(g=>!g.isReady).map(g=>g.name);
      const support=totalChecks?`Supporting checks: ${passedChecks} / ${totalChecks}.`:'Supporting checks are shown inside each engine.';
      gateSummary.textContent=blocked.length?`${support} Blocking BUY: ${blocked.join(', ')}.`:`${support} All four critical gates are cleared.`;
    }

    const rail=ensureRail();
    if(rail){
      rail.innerHTML=gates.map(g=>{
        const cls=g.isReady?'pass':g.state==='WARN'?'warn':'fail';
        const label=g.isReady?'READY':g.state==='WARN'?'NEAR':'BLOCKED';
        return `<div class="gate-chip ${cls}"><span class="gate-dot"></span><span class="gate-chip-name">${g.name}</span><span class="gate-chip-state">${label}</span></div>`;
      }).join('');
    }

    const status=$('statusBadge')?.textContent?.trim();
    const heading=document.querySelector('.why-box h3');
    if(heading){
      heading.textContent=status==='BUY NOW'?'Why this is a BUY now':status==='SELL / EXIT'?'Why this is an EXIT':'Why this is not a BUY yet';
    }
  }

  const engineGrid=$('engineGrid');
  if(engineGrid){
    new MutationObserver(syncGateUi).observe(engineGrid,{childList:true,subtree:true,characterData:true});
  }
  syncGateUi();
})();