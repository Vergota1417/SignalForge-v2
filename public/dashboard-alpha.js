const $=selector=>document.querySelector(selector);
const fmtMoney=value=>Number.isFinite(Number(value))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)):'Not available';
const fmtPct=value=>Number.isFinite(Number(value))?`${Number(value)>=0?'+':''}${(Number(value)*100).toFixed(2)}%`:'Not available';
const fmtNum=(value,digits=2)=>Number.isFinite(Number(value))?Number(value).toFixed(digits):'Not available';
const fmtTime=value=>value?new Date(Number(value)).toLocaleString():'Not available';
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const form=$('#symbol-form');
const input=$('#symbol-input');
const loadButton=$('#symbol-load');
const statusLine=$('#page-status');

form?.addEventListener('submit',event=>{
  event.preventDefault();
  const symbol=String(input.value||'').trim().toUpperCase();
  if(!/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(symbol))return setPageStatus('Enter a valid U.S. stock ticker.','error');
  loadSymbol(symbol);
});

async function loadSymbol(symbol){
  setPageStatus(`Loading ${symbol} from the centralized SignalForge state…`,'loading');
  loadButton.disabled=true;
  input.disabled=true;
  try{
    const response=await fetch(`/api/symbol-master?symbol=${encodeURIComponent(symbol)}`,{headers:{accept:'application/json'}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);
    render(body);
    saveRecent(symbol);
    setPageStatus(`${symbol} loaded · ${body.method?.version||'five-stage alpha'} · tactical alpha only`,'ok');
  }catch(error){
    setPageStatus(error?.message||'Unable to load this symbol.','error');
  }finally{
    loadButton.disabled=false;
    input.disabled=false;
  }
}

function render(data){
  const a=data.analysis||{},method=data.method||{},latest=a.latest||{};
  $('#profile-symbol').textContent=data.symbol||'Selected stock';
  $('#profile-sub').textContent='Live selected-symbol view · tactical alpha · full release still blocked';
  $('#profile-price').innerHTML=`<strong>${fmtMoney(latest.close)}</strong><span class="${Number(a.changePct)>=0?'positive':'negative'}">${fmtPct(a.changePct)}</span>`;
  $('#profile-context').textContent=a.benchmark?.riskOff?'Broad market: risk-off':a.benchmark?.bull?'Broad market: supportive':'Broad market: mixed / neutral';
  $('#profile-refresh').textContent=`Updated ${fmtTime(data.datasets?.analysis?.fetchedAt)}`;

  renderDecision(method,a,data);
  renderChart(data.candles||[],data.symbol);
  renderLevels(a);
  renderStructure(a);
  renderConfirmation(a.intradayConfirmation);
  renderUnavailable(data);
  renderValidation(data);
  renderRecent();
}

function renderDecision(method,analysis,data){
  const action=esc(method.action||analysis.status||'WAIT — SETUP NOT READY');
  const reason=esc(method.reason||analysis.reason||'No reason available.');
  const bottleneck=method.bottleneck;
  const stages=(method.stages||[]).map(item=>`
    <article class="stage-card state-${stateClass(item.state)}">
      <div class="stage-top"><span>${esc(item.label)}</span><strong>${esc(item.state)}</strong></div>
      <p>${esc(item.reason)}</p>
    </article>`).join('');
  $('#decision-body').innerHTML=`
    <div class="decision-action state-${stateClass(action)}">${action}</div>
    <p class="decision-reason">${reason}</p>
    <div class="decision-meta"><span>Readiness <strong>${Number.isFinite(Number(method.readiness))?`${Math.round(Number(method.readiness))}%`:'Not available'}</strong></span><span>Portfolio fit <strong>Not evaluated</strong></span></div>
    ${bottleneck?`<div class="bottleneck"><strong>Current blocker:</strong> ${esc(bottleneck.label)} · ${esc(bottleneck.reason)}</div>`:'<div class="bottleneck pass"><strong>No tactical blocker:</strong> all five tactical stages currently pass.</div>'}
    <div class="stage-grid">${stages}</div>
    <div class="alpha-boundary">Investment Quality, Portfolio Allocation, and Portfolio Risk are still separate release blockers. This alpha does not provide personal position sizing.</div>`;
}

function renderLevels(a){
  const rows=[
    ['Current price',fmtMoney(a.latest?.close)],
    ['Preferred entry low',fmtMoney(a.preferredEntryLow)],
    ['Preferred entry high',fmtMoney(a.preferredEntryHigh)],
    ['Thesis break / stop',fmtMoney(a.thesisBreak)],
    ['Target',fmtMoney(a.target)],
    ['Reward / risk',Number.isFinite(Number(a.rr))?`${Number(a.rr).toFixed(2)} : 1`:'Not available'],
    ['Do-not-chase level',fmtMoney(a.overextension)]
  ];
  $('#levels-body').innerHTML=metricRows(rows);
}

function renderStructure(a){
  const structure=a.structure||{};
  const rows=[
    ['Support',fmtMoney(structure.support)],
    ['Resistance',fmtMoney(structure.resistance)],
    ['Target source',structure.targetSource||'Not available'],
    ['Stop source',structure.stopSource||'Not available'],
    ['ATR (14)',fmtMoney(a.atr)],
    ['RSI (14)',fmtNum(a.rsi,1)],
    ['20-period momentum',fmtPct(a.momentum20)]
  ];
  $('#structure-body').innerHTML=metricRows(rows);
}

function renderConfirmation(c){
  if(!c){
    $('#volume-body').innerHTML='<div class="not-available"><strong>Confirmation not available</strong><span>No completed intraday confirmation state was returned.</span></div>';
    return;
  }
  const rows=[
    ['Confirmation state',c.state||'Not available'],
    ['Time-of-day RVOL',Number.isFinite(Number(c.relativeVolume))?`${Number(c.relativeVolume).toFixed(2)}x`:'Not available'],
    ['1-hour momentum',fmtPct(c.momentum4)],
    ['15m RSI',fmtNum(c.rsi,1)],
    ['Weekly AVWAP',fmtMoney(c.avwap)],
    ['Completed-bar time',c.latestTime?new Date(c.latestTime).toLocaleString():'Not available']
  ];
  $('#volume-body').innerHTML=`${metricRows(rows)}<p class="evidence-note">${esc(c.reason||'')}</p>`;
}

function renderUnavailable(data){
  $('#peers-body').innerHTML='<div class="not-available"><strong>Investment Quality is under development</strong><span>Fundamentals, valuation, and business-quality evidence will be a separate authority. No candle-derived substitute is shown.</span></div>';
  $('#news-body').innerHTML='<div class="not-available"><strong>News + catalysts are not connected in this alpha</strong><span>Missing event data is shown as unavailable rather than inferred from price.</span></div>';
}

function renderValidation(data){
  const datasets=Object.values(data.datasets||{}).map(item=>`
    <div class="validation-row"><strong>${esc(item.role)}</strong><span>${esc(item.symbol||data.symbol||'')}</span><span>${esc(item.timeframe||'')}</span><span>${esc(item.source||'Not available')}</span><span>${esc(fmtTime(item.fetchedAt))}</span></div>`).join('');
  const unsupported=Object.entries(data.unsupported||{}).filter(([,value])=>value).map(([key])=>key).join(', ');
  $('#validation-body').innerHTML=`
    <div class="validation-grid-head"><strong>Role</strong><strong>Symbol</strong><strong>Window</strong><strong>Source</strong><strong>Fetched</strong></div>
    ${datasets}
    <div class="validation-summary"><strong>Snapshot ID</strong><code>${esc(data.snapshotId||'Not available')}</code></div>
    <div class="validation-summary"><strong>Explicitly unsupported in this alpha</strong><span>${esc(unsupported||'None')}</span></div>
    <div class="validation-summary"><strong>Release state</strong><span>${esc(data.release?.reason||'Alpha only')}</span></div>`;
}

function renderChart(candles,symbol){
  const host=$('#chart-body');
  const rows=(candles||[]).filter(row=>Number.isFinite(Number(row.close)));
  if(rows.length<2){host.innerHTML='<div class="not-available"><strong>Chart unavailable</strong><span>Not enough candle data was returned.</span></div>';return;}
  const width=1000,height=440,pad=36,values=rows.map(row=>Number(row.close)),min=Math.min(...values),max=Math.max(...values),span=Math.max(.0001,max-min);
  const points=values.map((value,index)=>{
    const x=pad+(index/(values.length-1))*(width-pad*2),y=height-pad-((value-min)/span)*(height-pad*2);return`${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first=rows[0],last=rows.at(-1);
  host.innerHTML=`
    <div class="chart-summary"><span>${esc(symbol||'')}</span><strong>${fmtMoney(last.close)}</strong><span>Range ${fmtMoney(min)} – ${fmtMoney(max)}</span></div>
    <svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(symbol||'Stock')} six month price chart">
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}" class="chart-axis"/>
      <line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="chart-axis"/>
      <polyline points="${points}" fill="none" class="chart-line" vector-effect="non-scaling-stroke"/>
      <text x="${pad}" y="${height-8}" class="chart-label">${esc(shortDate(first.time))}</text>
      <text x="${width-pad}" y="${height-8}" text-anchor="end" class="chart-label">${esc(shortDate(last.time))}</text>
      <text x="${pad+6}" y="${pad+12}" class="chart-label">${esc(fmtMoney(max))}</text>
      <text x="${pad+6}" y="${height-pad-8}" class="chart-label">${esc(fmtMoney(min))}</text>
    </svg>`;
}

function metricRows(rows){return`<div class="metric-list">${rows.map(([label,value])=>`<div class="metric-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;}

function saveRecent(symbol){
  const current=readRecent().filter(item=>item!==symbol);current.unshift(symbol);localStorage.setItem('sf-alpha-recent',JSON.stringify(current.slice(0,8)));
  renderRecent();
}
function readRecent(){try{const value=JSON.parse(localStorage.getItem('sf-alpha-recent')||'[]');return Array.isArray(value)?value:[];}catch{return[];}}
function renderRecent(){
  const recent=readRecent(),host=$('#recent-body');if(!host)return;
  host.innerHTML=recent.length?`<div class="recent-list">${recent.map(symbol=>`<button type="button" data-symbol="${esc(symbol)}">${esc(symbol)}</button>`).join('')}</div>`:'<div class="not-available"><strong>No recent stocks yet</strong><span>Search a ticker above to start.</span></div>';
  host.querySelectorAll('[data-symbol]').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.symbol;loadSymbol(button.dataset.symbol);}));
}
function setPageStatus(message,state){statusLine.textContent=message;statusLine.dataset.state=state||'';}
function stateClass(value){
  const v=String(value||'').toUpperCase();if(v.includes('BUY')||v==='PASS')return'pass';if(v.includes('READY')||v==='WARN'||v.includes('PULLBACK'))return'warn';if(v.includes('SELL')||v==='FAIL'||v.includes('AVOID'))return'fail';if(v==='LOCKED'||v.includes('WAIT'))return'locked';return'na';
}
function shortDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';}

renderRecent();
