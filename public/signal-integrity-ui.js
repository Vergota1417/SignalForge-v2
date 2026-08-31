(() => {
  'use strict';

  function clarifyChartSource(){
    const el=document.getElementById('chartDataSource');if(!el)return;
    const text=String(el.textContent||'');
    if(!/^Data:/i.test(text)||/unavailable/i.test(text)||/LIVE UPSTREAM|CACHED SNAPSHOT/i.test(text))return;
    if(/cached/i.test(text))el.textContent=text.replace(/\s*·\s*cached/i,' · CACHED SNAPSHOT');
    else el.textContent=`${text} · LIVE UPSTREAM`;
  }

  function clarifyRadarReview(){
    document.querySelectorAll('.radar-eta strong,.sf-radar-next strong').forEach(el=>{
      const text=String(el.textContent||'').trim();
      if(text==='Promotion decision'||text==='Next promotion opportunity')el.textContent='Weekly research review';
      const row=el.closest('.radar-eta,.sf-radar-next');
      if(row)row.title='This is the next scheduled research/promotion review. Live SignalForge action states can still change during market-hour scans and execution checks.';
    });
  }

  function addRadarRule(){
    const block=document.querySelector('.radar-block');if(block&&!document.getElementById('sfRadarLiveRule')){
      const note=document.createElement('div');note.id='sfRadarLiveRule';note.className='radar-note';note.textContent='Live action states can change during market-hour scans. The dated weekly research review is separate and does not freeze BUY / READY / WAIT decisions.';block.appendChild(note);
    }
    const strip=document.getElementById('sfRadarStrip');if(strip&&!document.getElementById('sfRadarStripLiveRule')){
      const note=document.createElement('div');note.id='sfRadarStripLiveRule';note.className='sf-radar-strip-coverage';note.textContent='Live states keep updating; dated review timing is research-only.';strip.appendChild(note);
    }
  }

  function clarifyDecisionCopy(){
    document.querySelectorAll('.why-item').forEach(item=>{
      const title=item.querySelector('.why-title'),copy=item.querySelector('.why-copy');if(!title||!copy)return;
      const titleText=String(title.textContent||'').trim(),copyText=String(copy.textContent||'').trim();
      if(/Probability confirmation is incomplete/i.test(titleText)&&/0\s+samples/i.test(copyText))copy.textContent='No walk-forward sample exists yet. Probability and forward expectancy are not established.';
      if(/Risk \/ reward is not good enough/i.test(titleText)&&/\d+(?:\.\d+)?:1/.test(copyText)){
        const riskCard=[...document.querySelectorAll('#engineGrid .engine-card')].find(card=>/RISK \/ REWARD/i.test(card.querySelector('.engine-name')?.textContent||''));
        const stopTooTight=/too tight|invalid/i.test(riskCard?.textContent||'');
        if(stopTooTight){const rr=copyText.match(/\d+(?:\.\d+)?:1/)?.[0]||'calculated R/R';title.textContent='Risk / Reward blocked';copy.textContent=`The ${rr} ratio is not trusted because the structural stop is too tight.`;}
      }
    });
    const blocker=document.querySelector('[data-blocker]');
    if(blocker&&/reward\/risk|risk \/ reward/i.test(blocker.textContent||'')&&/\d+(?:\.\d+)?:1/.test(blocker.textContent||'')){
      const riskCard=[...document.querySelectorAll('#engineGrid .engine-card')].find(card=>/RISK \/ REWARD/i.test(card.querySelector('.engine-name')?.textContent||''));
      if(/too tight|invalid/i.test(riskCard?.textContent||'')){const rr=String(blocker.textContent||'').match(/\d+(?:\.\d+)?:1/)?.[0]||'calculated R/R';blocker.textContent=`${rr} is not trusted because the structural stop is too tight.`;}
    }
  }

  function refresh(){clarifyChartSource();clarifyRadarReview();addRadarRule();clarifyDecisionCopy();}
  const observer=new MutationObserver(()=>refresh());
  function bind(){observer.observe(document.body,{childList:true,subtree:true,characterData:true});refresh();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
