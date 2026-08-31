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

  function refresh(){clarifyChartSource();clarifyRadarReview();addRadarRule();}
  const observer=new MutationObserver(()=>refresh());
  function bind(){observer.observe(document.body,{childList:true,subtree:true,characterData:true});refresh();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
