(() => {
  'use strict';
  const API=String(window.SIGNALFORGE_CONFIG?.API_BASE_URL||location.origin).replace(/\/$/,'');
  const PREF_KEY='signalforge_pattern_overlay_v1';
  const HEALTH_REFRESH_MS=5*60_000;
  const DEFAULTS={support:true,resistance:true,channel:'auto',breakout:true,double:false,triangles:false,headShoulders:false,wedges:false,labels:true};
  let prefs=loadPrefs(),currentSymbol='',patternContext=null,currentMarket=null,patternHealth=null,healthFetchedAt=0,timer=null;

  injectStyles();
  installMarketCapture();

  function installMarketCapture(){
    if(window.__sfPatternFetchCapture)return;window.__sfPatternFetchCapture=true;
    const priorFetch=window.fetch.bind(window);
    window.fetch=async function(input,init){
      const response=await priorFetch(input,init);try{const url=new URL(typeof input==='string'?input:input?.url||'',location.origin);if(url.origin===location.origin&&url.pathname==='/api/market-data'&&response.ok){const clone=response.clone();clone.json().then(payload=>{if(payload?.symbol&&payload?.candles?.length){currentMarket=payload;if(payload.analysis?.patternContext)patternContext=payload.analysis.patternContext;setTimeout(()=>{renderPanel();applyOverlays();},0);}}).catch(()=>{});}}catch{}return response;
    };
  }

  function injectStyles(){if(document.getElementById('sfPatternContextStyles'))return;const style=document.createElement('style');style.id='sfPatternContextStyles';style.textContent=`
    .sf-pattern-card{margin:7px 0 9px;padding:9px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.012)}
    .sf-pattern-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.sf-pattern-title{font-size:10px;font-weight:900;letter-spacing:.05em}.sf-pattern-sub{margin-top:2px;color:var(--muted);font-size:8px;line-height:1.35}.sf-pattern-state{border:1px solid var(--border);border-radius:999px;padding:3px 7px;font-size:8px;font-weight:900;white-space:nowrap}.sf-pattern-state.good{color:var(--green)}.sf-pattern-state.warn{color:var(--yellow)}.sf-pattern-state.bad{color:var(--red)}
    .sf-pattern-quick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:7px}.sf-pattern-stat{padding:6px;background:var(--panel-2);border-radius:7px;min-width:0}.sf-pattern-stat small,.sf-pattern-stat strong{display:block}.sf-pattern-stat small{font-size:7px;color:var(--muted);text-transform:uppercase}.sf-pattern-stat strong{margin-top:2px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sf-pattern-controls{margin-top:7px;display:grid;gap:5px}.sf-pattern-control-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.sf-pattern-control-label{width:48px;color:#60758d;font-size:7px;text-transform:uppercase;font-weight:800}.sf-pattern-btn{border:1px solid var(--border);background:#0a1524;color:var(--muted);border-radius:7px;padding:4px 6px;font-size:8px;font-weight:800;cursor:pointer}.sf-pattern-btn.on{border-color:rgba(126,188,255,.5);background:rgba(126,188,255,.10);color:var(--text)}.sf-pattern-btn.detected::after{content:' •';color:var(--yellow)}.sf-pattern-btn.confirmed::after{content:' ✓';color:var(--green)}
    .sf-pattern-explain{margin-top:7px;padding:7px;border-radius:7px;background:#08111f;color:var(--muted);font-size:8px;line-height:1.45}.sf-pattern-explain strong{color:var(--text)}
    .sf-pattern-validation{margin-top:5px;padding:6px 7px;border:1px solid rgba(126,188,255,.18);border-radius:7px;color:#8fa4bd;background:rgba(126,188,255,.035);font-size:7.5px;line-height:1.4}.sf-pattern-validation strong{color:var(--text)}
    .sf-pattern-list{margin-top:5px;display:grid;gap:4px}.sf-pattern-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;padding:6px;border:1px solid var(--border);border-radius:7px;background:rgba(255,255,255,.01);cursor:pointer}.sf-pattern-item strong{font-size:8.5px}.sf-pattern-item small{display:block;margin-top:2px;color:var(--muted);font-size:7.5px}.sf-pattern-confidence{font-size:8px;font-weight:900;color:var(--blue)}
    .sf-pattern-help{margin-top:6px;border-top:1px solid var(--border);padding-top:5px}.sf-pattern-help summary{font-size:8px;font-weight:800;color:var(--muted);cursor:pointer}.sf-pattern-help p{font-size:8px;color:var(--muted);line-height:1.45;margin:5px 0 0}
    @media(max-width:700px){.sf-pattern-card{padding:8px}.sf-pattern-quick{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-pattern-control-label{width:42px}.sf-pattern-btn{padding:4px 5px;font-size:7.5px}.sf-pattern-head{align-items:center}}
  `;document.head.appendChild(style);}

  function ensurePanel(){
    const chart=document.querySelector('.chart-card');if(!chart)return null;let card=document.getElementById('sfPatternContextCard');if(card)return card;
    card=document.createElement('section');card.id='sfPatternContextCard';card.className='sf-pattern-card';card.innerHTML=`
      <div class="sf-pattern-head"><div><div class="sf-pattern-title">STRUCTURE + PATTERNS · SHADOW</div><div class="sf-pattern-sub" data-pattern-sub>Priority structure first. Optional chart patterns stay hidden until selected.</div></div><span class="sf-pattern-state" data-pattern-state>COLLECTING</span></div>
      <div class="sf-pattern-quick"><div class="sf-pattern-stat"><small>Support</small><strong data-pattern-support>—</strong></div><div class="sf-pattern-stat"><small>Resistance</small><strong data-pattern-resistance>—</strong></div><div class="sf-pattern-stat"><small>Channel</small><strong data-pattern-channel>—</strong></div><div class="sf-pattern-stat"><small>Breakout</small><strong data-pattern-breakout>—</strong></div></div>
      <div class="sf-pattern-controls">
        <div class="sf-pattern-control-row"><span class="sf-pattern-control-label">Structure</span><button class="sf-pattern-btn" data-toggle="support">Support</button><button class="sf-pattern-btn" data-toggle="resistance">Resistance</button><button class="sf-pattern-btn" data-toggle="channel">Channel</button><button class="sf-pattern-btn" data-toggle="breakout">Breakouts</button></div>
        <div class="sf-pattern-control-row"><span class="sf-pattern-control-label">Patterns</span><button class="sf-pattern-btn" data-toggle="double">Double</button><button class="sf-pattern-btn" data-toggle="triangles">Triangles</button><button class="sf-pattern-btn" data-toggle="headShoulders">H&amp;S</button><button class="sf-pattern-btn" data-toggle="wedges">Wedges</button></div>
        <div class="sf-pattern-control-row"><span class="sf-pattern-control-label">View</span><button class="sf-pattern-btn" data-toggle="labels">Labels</button><button class="sf-pattern-btn" data-action="priority">Priority only</button><button class="sf-pattern-btn" data-action="hide">Hide all</button></div>
      </div>
      <div class="sf-pattern-explain" data-pattern-explain>Waiting for a fresh saved daily analysis. Support and resistance are the first priority; pattern overlays remain optional.</div>
      <div class="sf-pattern-validation" data-pattern-validation>10-session shadow validation · collecting pattern setup episodes · cannot affect BUY NOW.</div>
      <div class="sf-pattern-list" data-pattern-list></div>
      <details class="sf-pattern-help"><summary>How SignalForge detects these structures</summary><p>Support and resistance are clustered from repeated swing lows/highs using ATR-aware tolerance. Trend channels use regression through recent pivot lows and highs. Triangles and wedges require converging boundaries. Double structures require two similar swing levels with a meaningful middle reversal. Head &amp; Shoulders requires three pivots with a larger center head and comparable shoulders. A pattern can be DETECTED, TESTING, CONFIRMED, or FAILED. Validation treats a multi-day appearance of the same ticker/pattern as one setup episode until the pattern disappears, changes, or the observation gap exceeds seven calendar days. Pattern-state transitions are measured separately. This entire layer stays shadow-only and cannot authorize or block BUY NOW.</p></details>`;
    const activity=chart.querySelector('#sfActivityRhythmCard');if(activity)activity.insertAdjacentElement('afterend',card);else{const wrap=chart.querySelector('.canvas-wrap');wrap?.insertAdjacentElement('beforebegin',card);}bindPanel(card);return card;
  }

  function bindPanel(card){
    card.querySelectorAll('[data-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.toggle;if(key==='channel'){prefs.channel=prefs.channel==='auto'?true:prefs.channel===true?false:'auto';}else prefs[key]=!prefs[key];savePrefs();renderPanel();applyOverlays();}));
    card.querySelector('[data-action="priority"]')?.addEventListener('click',()=>{prefs={...DEFAULTS};savePrefs();renderPanel();applyOverlays();});
    card.querySelector('[data-action="hide"]')?.addEventListener('click',()=>{prefs={support:false,resistance:false,channel:false,breakout:false,double:false,triangles:false,headShoulders:false,wedges:false,labels:false};savePrefs();renderPanel();applyOverlays();});
  }

  async function refresh(){
    ensurePanel();const symbol=selectedSymbol();if(!symbol)return;currentSymbol=symbol;
    try{const r=await fetch(`${API}/api/signals`,{headers:{accept:'application/json'},cache:'no-store'}),b=await r.json();if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);if(currentSymbol!==symbol)return;const row=(b.signals||[]).find(x=>String(x.symbol||'').toUpperCase()===symbol);if(row?.analysis?.patternContext)patternContext=row.analysis.patternContext;renderPanel();applyOverlays();void refreshHealth();}catch(error){renderUnavailable(String(error?.message||'Pattern context unavailable.'));void refreshHealth();}
  }

  async function refreshHealth(){
    if(Date.now()-healthFetchedAt<HEALTH_REFRESH_MS&&patternHealth){renderValidation();return;}
    try{const response=await fetch(`${API}/api/evidence-evaluation?horizon=10&minSample=20`,{headers:{accept:'application/json'},cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);patternHealth=body?.evaluation?.patternContext||null;healthFetchedAt=Date.now();renderValidation();}catch{renderValidation();}
  }

  function renderPanel(){const card=ensurePanel();if(!card)return;const p=patternContext;if(!p){renderUnavailable('Pattern Context will populate on the next fresh daily/deep analysis for this ticker.');return;}
    set(card,'[data-pattern-support]',levelText(p.support,'below'));set(card,'[data-pattern-resistance]',levelText(p.resistance,'above'));set(card,'[data-pattern-channel]',`${p.channel?.type||'NO CLEAR'}${Number(p.channel?.confidence)?` ${Math.round(p.channel.confidence)}`:''}`);set(card,'[data-pattern-breakout]',String(p.breakout?.state||'INSIDE'));
    const state=card.querySelector('[data-pattern-state]'),primary=p.primaryPattern;state.textContent=primary?`${primary.type} ${primary.confidence}`:`${p.structureState||'STRUCTURE'} ${Math.round(Number(p.structureConfidence)||0)}`;state.className=`sf-pattern-state ${tone(primary?.bias,p.breakout?.direction)}`;
    set(card,'[data-pattern-sub]',`${selectedSymbol()} · daily structure · ${Number(p.lookbackBars)||0} bars · shadow-only`);set(card,'[data-pattern-explain]',p.reason||'Structure context is available.');
    const families=new Map((p.patterns||[]).map(x=>[x.family,x]));card.querySelectorAll('[data-toggle]').forEach(btn=>{const key=btn.dataset.toggle,on=key==='channel'?channelEnabled(p):Boolean(prefs[key]);btn.classList.toggle('on',on);const family=key==='double'?'double':key==='triangles'?'triangles':key==='headShoulders'?'head-shoulders':key==='wedges'?'wedges':null,det=family?families.get(family):null;btn.classList.toggle('detected',Boolean(det&&det.state!=='CONFIRMED'));btn.classList.toggle('confirmed',Boolean(det?.state==='CONFIRMED'));if(key==='channel')btn.textContent=`Channel ${prefs.channel==='auto'?'Auto':on?'On':'Off'}`;});renderPatternList(card,p.patterns||[]);renderValidation();}

  function renderValidation(){const card=ensurePanel(),node=card?.querySelector('[data-pattern-validation]');if(!node)return;const health=patternHealth,primary=patternContext?.primaryPattern;if(!health){node.textContent='10-session shadow validation · collecting pattern setup episodes · cannot affect BUY NOW.';return;}const required=Number(health.minSample)||20,horizon=Number(health.horizon)||10,patternDays=Number(health.patternDaySampleSize)||0;if(primary){const key=`${primary.type} · ${primary.state||'UNKNOWN'}`,row=(health.patternSegments?.patternState||[]).find(item=>item.key===key);if(row){const need=Math.max(0,required-Number(row.sampleSize||0));if(need>0){node.innerHTML=`<strong>${escapeHtml(primary.type)} · ${escapeHtml(primary.state)}</strong> · ${row.sampleSize}/${required} ${horizon}-session state episodes · collecting ${need} more · ${patternDays} pattern-days logged · shadow-only.`;return;}const candidate=(health.reviewCandidates||[]).some(item=>item.key===key);node.innerHTML=`<strong>${escapeHtml(primary.type)} · ${escapeHtml(primary.state)}</strong> · ${row.sampleSize} state episodes · win ${pct(row.winRate)} · expectancy ${signedPct(row.expectancy)} · market excess ${signedPct(row.avgMarketExcessReturn)} · ${candidate?'review candidate':'validating'} · still shadow-only.`;return;}}
    node.textContent=`${horizon}-session shadow validation · ${Number(health.sampleSize)||0}/${required} setup episodes resolved · ${patternDays} pattern-days logged · ${String(health.status||'COLLECTING').toLowerCase()} · cannot affect BUY NOW.`;}

  function renderPatternList(card,patterns){const list=card.querySelector('[data-pattern-list]');list.innerHTML='';for(const p of patterns.slice(0,5)){const item=document.createElement('button');item.type='button';item.className='sf-pattern-item';item.innerHTML=`<span><strong>${escapeHtml(p.type)} · ${escapeHtml(p.state)}</strong><small>${escapeHtml(p.bias)} · ${escapeHtml(p.reason)}</small></span><span class="sf-pattern-confidence">${Math.round(Number(p.confidence)||0)}/100</span>`;item.addEventListener('click',()=>{enableFamily(p.family);const explain=card.querySelector('[data-pattern-explain]');if(explain)explain.innerHTML=`<strong>${escapeHtml(p.type)} · ${escapeHtml(p.state)} · ${Math.round(Number(p.confidence)||0)}/100</strong><br>${escapeHtml(p.reason)}`;renderPanel();applyOverlays();});list.appendChild(item);}if(!patterns.length)list.innerHTML='<div class="sf-pattern-explain">No specialized pattern currently clears the detector threshold. Support/resistance structure can still be useful.</div>';}

  function applyOverlays(){const bridge=window.SignalForgeChartBridge;if(!bridge?.ready||!bridge.candleSeries||!patternContext)return;bridge.clearOverlays?.();const p=patternContext,labels=Boolean(prefs.labels);
    if(prefs.support&&p.support?.price)bridge.addPriceLine(p.support.price,{color:'#2fd18b',title:labels?`Support · ${p.support.touches||0} touches`:''});
    if(prefs.resistance&&p.resistance?.price)bridge.addPriceLine(p.resistance.price,{color:'#ef6262',title:labels?`Resistance · ${p.resistance.touches||0} touches`:''});
    if(prefs.breakout&&p.breakout?.level&&p.breakout?.state!=='INSIDE')bridge.addPriceLine(p.breakout.level,{color:'#f4a340',lineWidth:2,title:labels?p.breakout.state:''});
    if(channelEnabled(p)){drawTrend(bridge,p.channel?.lower,'#2fd18b',labels?'Channel support':'');drawTrend(bridge,p.channel?.upper,'#7ebcff',labels?'Channel resistance':'');}
    for(const pat of p.patterns||[]){if(!familyEnabled(pat.family))continue;drawPattern(bridge,pat,labels);}
  }

  function drawPattern(bridge,pat,labels){const color=pat.bias==='BULLISH'?'#2fd18b':pat.bias==='BEARISH'?'#ef6262':'#f4a340';for(const line of pat.lines||[]){if(line.kind==='horizontal'&&line.price)bridge.addPriceLine(line.price,{color,lineWidth:2,title:labels?(line.label||pat.type):''});else drawTrend(bridge,line,color,labels?pat.type:'');}if((pat.family==='double'||pat.family==='head-shoulders')&&Array.isArray(pat.anchors)&&pat.anchors.length>=2){const points=pat.anchors.filter(a=>a.time&&a.price).map(a=>({time:a.time,value:a.price}));if(points.length>=2)bridge.addTrendLine(points,{color,lineWidth:2,title:labels?pat.type:''});}}
  function drawTrend(bridge,line,color,title){if(!line?.start?.time||!line?.start?.price)return;const endTime=latestMarketTime()||line.end?.time,start={time:Number(line.start.time),value:Number(line.start.price)},end={time:Number(endTime||line.end?.time),value:Number(endTime&&Number(line.current)>0?line.current:line.end?.price)};if(end.time&&end.value)bridge.addTrendLine([start,end],{color,lineWidth:2,title});}
  function latestMarketTime(){const symbol=selectedSymbol();if(String(currentMarket?.symbol||'').toUpperCase()!==symbol)return null;return Number(currentMarket?.candles?.at?.(-1)?.time)||null;}
  function channelEnabled(p){return prefs.channel===true||(prefs.channel==='auto'&&Number(p?.channel?.confidence)>=65&&['UP CHANNEL','DOWN CHANNEL','SIDEWAYS RANGE'].includes(String(p?.channel?.type)));}
  function familyEnabled(family){return family==='double'?prefs.double:family==='triangles'?prefs.triangles:family==='head-shoulders'?prefs.headShoulders:family==='wedges'?prefs.wedges:false;}
  function enableFamily(family){if(family==='double')prefs.double=true;if(family==='triangles')prefs.triangles=true;if(family==='head-shoulders')prefs.headShoulders=true;if(family==='wedges')prefs.wedges=true;savePrefs();}
  function levelText(level,direction){if(!level?.price)return'—';const d=Number(level.distancePct),dist=Number.isFinite(d)?`${Math.abs(d)*100<.1?'<0.1':(Math.abs(d)*100).toFixed(1)}% ${direction}`:'';return `$${Number(level.price).toFixed(2)}${dist?` · ${dist}`:''}`;}
  function tone(bias,breakoutDirection){if(String(bias)==='BULLISH'||String(breakoutDirection)==='UP')return'good';if(String(bias)==='BEARISH'||String(breakoutDirection)==='DOWN')return'bad';return'warn';}
  function renderUnavailable(message){const card=ensurePanel();if(!card)return;set(card,'[data-pattern-support]','—');set(card,'[data-pattern-resistance]','—');set(card,'[data-pattern-channel]','—');set(card,'[data-pattern-breakout]','—');set(card,'[data-pattern-explain]',message);const state=card.querySelector('[data-pattern-state]');state.textContent='COLLECTING';state.className='sf-pattern-state';const list=card.querySelector('[data-pattern-list]');if(list)list.innerHTML='';renderValidation();}
  function selectedSymbol(){return String(document.getElementById('tickerBadge')?.textContent||document.getElementById('symbolInput')?.value||'').trim().toUpperCase();}
  function set(root,selector,value){const el=root?.querySelector(selector);if(el)el.textContent=String(value??'—');}
  function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch{}}
  function loadPrefs(){try{return{...DEFAULTS,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')};}catch{return{...DEFAULTS};}}
  function pct(value){const n=Number(value);return Number.isFinite(n)?`${(n*100).toFixed(0)}%`:'—';}
  function signedPct(value){const n=Number(value);return Number.isFinite(n)?`${n>=0?'+':''}${(n*100).toFixed(2)}%`:'—';}
  function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function boot(){ensurePanel();refresh();window.addEventListener('signalforge:pattern-chart-ready',()=>setTimeout(applyOverlays,80));window.addEventListener('resize',()=>setTimeout(applyOverlays,100));const ticker=document.getElementById('tickerBadge');if(ticker)new MutationObserver(()=>{patternContext=null;currentMarket=null;setTimeout(refresh,140);}).observe(ticker,{childList:true,subtree:true,characterData:true});timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh();},60_000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();