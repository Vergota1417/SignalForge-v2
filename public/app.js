(() => {
  'use strict';

  const CONFIG = window.SIGNALFORGE_CONFIG || { API_BASE_URL: '' };
  const TIMEFRAMES = {
    '1D': { points: 78, stepMinutes: 5, resolution: '5-minute candles' },
    '5D': { points: 130, stepMinutes: 15, resolution: '15-minute candles' },
    '1M': { points: 160, stepMinutes: 60, resolution: '1-hour candles' },
    '3M': { points: 90, stepMinutes: 1440, resolution: 'Daily candles' },
    '6M': { points: 130, stepMinutes: 1440, resolution: 'Daily candles' },
    '1Y': { points: 190, stepMinutes: 1440, resolution: 'Daily candles' },
    '2Y': { points: 210, stepMinutes: 10080, resolution: 'Weekly candles' }
  };

  const WATCHLIST = ['XOM', 'NVDA', 'MSFT', 'AAPL', 'AMZN', 'TSLA'];
  const state = { symbol: 'XOM', timeframe: '6M', candles: [], analysis: null, watchAnalyses: {} };

  const $ = (id) => document.getElementById(id);
  const canvas = $('priceChart');
  const ctx = canvas.getContext('2d');

  function seededRandom(seedText) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function rand() {
      h += 0x6D2B79F5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round(v, d = 2) { const p = 10 ** d; return Math.round(v * p) / p; }
  function average(arr) { return arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0; }

  function syntheticSeries(symbol, timeframe) {
    const cfg = TIMEFRAMES[timeframe];
    const rand = seededRandom(`${symbol}:${timeframe}:v4`);
    const baseMap = { XOM: 112, NVDA: 121, MSFT: 418, AAPL: 228, AMZN: 186, TSLA: 319 };
    let price = baseMap[symbol] || (60 + rand() * 140);
    const symbolBias = ((symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1)) % 7 - 3) / 1000;
    const overheatBias = symbol === 'XOM' ? 0.0010 : symbol === 'NVDA' ? 0.0015 : symbol === 'TSLA' ? -0.0002 : 0.00055;
    const drift = symbolBias + overheatBias;
    const vol = symbol === 'TSLA' || symbol === 'NVDA' ? 0.022 : 0.012;
    const now = Date.now();
    const out = [];
    for (let i = 0; i < cfg.points; i++) {
      const phase = i / Math.max(1, cfg.points - 1);
      const cyclical = Math.sin(i / 8.2) * vol * 0.14;
      let change = drift + cyclical + (rand() - .48) * vol;
      if (symbol === 'XOM' && phase > .78) change += 0.0042; // intentionally creates an overextended demo state
      if (symbol === 'TSLA' && phase > .62) change -= 0.0032;
      const open = price;
      const close = Math.max(1, open * (1 + change));
      const wick = Math.abs((rand() - .5) * vol * 1.4);
      const high = Math.max(open, close) * (1 + wick);
      const low = Math.min(open, close) * (1 - wick * .9);
      const volume = Math.round((1 + rand() * 8) * 1_000_000);
      out.push({
        time: now - (cfg.points - 1 - i) * cfg.stepMinutes * 60_000,
        open, high, low, close, volume
      });
      price = close;
    }
    return out;
  }

  async function fetchMarketData(symbol, timeframe) {
    if (!CONFIG.API_BASE_URL) return { candles: syntheticSeries(symbol, timeframe), source: 'demo' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CONFIG.REQUEST_TIMEOUT_MS || 7000);
    try {
      const url = `${CONFIG.API_BASE_URL.replace(/\/$/, '')}/api/market-data?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.candles) || json.candles.length < 70) throw new Error('Invalid candle payload');
      return { candles: json.candles.map(c => ({ ...c, time: typeof c.time === 'number' ? c.time : new Date(c.time).getTime() })), source: 'api' };
    } catch (err) {
      console.warn('Market-data API unavailable; falling back to demo data.', err);
      return { candles: syntheticSeries(symbol, timeframe), source: 'demo fallback' };
    } finally {
      clearTimeout(timer);
    }
  }

  function sma(values, period) {
    if (values.length < period) return null;
    return average(values.slice(-period));
  }

  function rsi(values, period = 14) {
    if (values.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = values.length - period; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  function atr(candles, period = 14) {
    if (candles.length <= period) return 0;
    const trs = [];
    for (let i = candles.length - period; i < candles.length; i++) {
      const c = candles[i], p = candles[i - 1];
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    return average(trs);
  }

  function rollingSma(values, index, period) {
    if (index + 1 < period) return null;
    let sum = 0;
    for (let i = index - period + 1; i <= index; i++) sum += values[i];
    return sum / period;
  }

  function rollingRsi(values, index, period = 14) {
    if (index < period) return 50;
    let gains=0, losses=0;
    for (let i = index - period + 1; i <= index; i++) {
      const d = values[i] - values[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    if (!losses) return 100;
    return 100 - 100 / (1 + gains / losses);
  }

  function walkForward(candles) {
    const closes = candles.map(c => c.close);
    const horizon = Math.max(3, Math.round(candles.length / 45));
    let total = 0, wins = 0, returns = [];
    for (let i = 55; i < closes.length - horizon; i++) {
      const s20 = rollingSma(closes, i, 20), s50 = rollingSma(closes, i, 50);
      if (!s20 || !s50) continue;
      const mom = closes[i] / closes[i - 10] - 1;
      const rsiv = rollingRsi(closes, i, 14);
      const extension = closes[i] / s20 - 1;
      const setup = closes[i] > s50 && s20 > s50 && mom > 0 && rsiv < 72 && extension < .045;
      if (!setup) continue;
      const ret = closes[i + horizon] / closes[i] - 1;
      total++;
      returns.push(ret);
      if (ret > 0) wins++;
    }
    return {
      sample: total,
      winRate: total ? wins / total : .5,
      avgReturn: returns.length ? average(returns) : 0
    };
  }

  function analyze(candles, symbol) {
    const closes = candles.map(c => c.close);
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2] || latest;
    const s20 = sma(closes, 20) || latest.close;
    const s50 = sma(closes, 50) || s20;
    const a14 = atr(candles, 14) || latest.close * .02;
    const r14 = rsi(closes, 14);
    const momentum20 = closes.length > 20 ? latest.close / closes[closes.length - 21] - 1 : 0;
    const structure = closes.slice(-20);
    const recentMin = Math.min(...structure), recentMax = Math.max(...structure);
    const pullbackDepth = recentMax ? (recentMax - latest.close) / recentMax : 0;
    const extensionPct = (latest.close - s20) / s20;
    const trendStrength = (s20 - s50) / s50;
    const relativeStrengthProxy = momentum20 - average(closes.slice(-10).map((v,i,a) => i ? v / a[i-1] - 1 : 0));

    const preferredEntryLow = Math.max(0.01, s20 - 0.40 * a14);
    const preferredEntryHigh = s20 + 0.18 * a14;
    const overextension = s20 + 1.45 * a14;
    const thesisBreak = Math.max(0.01, s50 - 1.05 * a14);
    const target = Math.max(recentMax + 0.75 * a14, latest.close + 1.85 * a14);
    const risk = Math.max(0.01, latest.close - thesisBreak);
    const reward = Math.max(0, target - latest.close);
    const rr = reward / risk;
    const wf = walkForward(candles);

    const trendMetrics = [
      { name:'50-day trend', value:`Price ${latest.close >= s50 ? 'above' : 'below'} 50-period trend`, pass: latest.close > s50 },
      { name:'Trend alignment', value:`20-period ${s20 >= s50 ? 'above' : 'below'} 50-period`, pass: s20 > s50 },
      { name:'Momentum', value:`${(momentum20*100).toFixed(1)}% over lookback`, pass: momentum20 > 0 },
      { name:'Relative strength proxy', value: relativeStrengthProxy >= 0 ? 'Positive' : 'Lagging', pass: relativeStrengthProxy >= -0.0015 }
    ];
    const entryMetrics = [
      { name:'Extension vs 20', value:`${(extensionPct*100).toFixed(1)}%`, pass: latest.close <= overextension, warn: latest.close > preferredEntryHigh },
      { name:'Pullback depth', value:`${(pullbackDepth*100).toFixed(1)}%`, pass: pullbackDepth >= .008 && pullbackDepth <= .08, warn: pullbackDepth < .008 },
      { name:'RSI (14)', value:r14.toFixed(1), pass:r14 >= 42 && r14 <= 69, warn:r14 > 69 && r14 < 76 },
      { name:'Entry zone', value: latest.close >= preferredEntryLow && latest.close <= preferredEntryHigh ? 'Inside preferred zone' : latest.close > preferredEntryHigh ? 'Above preferred zone' : 'Below preferred zone', pass: latest.close >= preferredEntryLow && latest.close <= preferredEntryHigh, warn: latest.close > preferredEntryHigh }
    ];
    const probabilityMetrics = [
      { name:'Walk-forward win rate', value:`${(wf.winRate*100).toFixed(0)}% (${wf.sample} samples)`, pass:wf.sample >= 5 && wf.winRate >= .57, warn:wf.sample < 5 || (wf.winRate >= .52 && wf.winRate < .57) },
      { name:'Forward expectancy', value:`${(wf.avgReturn*100).toFixed(2)}% avg`, pass:wf.sample >= 5 && wf.avgReturn > 0, warn:wf.sample < 5 },
      { name:'Pattern sample quality', value: wf.sample >= 12 ? 'Good' : wf.sample >= 5 ? 'Limited' : 'Insufficient', pass:wf.sample >= 12, warn:wf.sample >= 5 },
      { name:'Regime alignment', value: trendStrength > .005 ? 'Bull trend' : trendStrength > -.005 ? 'Neutral' : 'Bearish', pass: trendStrength > 0, warn: trendStrength > -.005 }
    ];
    const rrMetrics = [
      { name:'Stop distance', value:`${(risk/latest.close*100).toFixed(1)}%`, pass:risk/latest.close <= .08, warn:risk/latest.close <= .12 },
      { name:'Expected target', value:`${(reward/latest.close*100).toFixed(1)}%`, pass:reward/latest.close >= .06, warn:reward/latest.close >= .035 },
      { name:'Reward / risk', value:`${rr.toFixed(2)} : 1`, pass:rr >= 1.8, warn:rr >= 1.25 },
      { name:'Price vs thesis break', value:latest.close > thesisBreak ? 'Thesis intact' : 'Broken', pass:latest.close > thesisBreak }
    ];

    const engines = {
      trend: engineState('TREND', trendMetrics, 3),
      entry: engineState('ENTRY', entryMetrics, 3),
      probability: engineState('PROBABILITY', probabilityMetrics, 3),
      riskReward: engineState('RISK / REWARD', rrMetrics, 3)
    };

    const allMetrics = [...trendMetrics, ...entryMetrics, ...probabilityMetrics, ...rrMetrics];
    const passed = allMetrics.filter(m => m.pass).length;
    const total = allMetrics.length;
    const criticalFailed = Object.values(engines).filter(e => !e.ready).map(e => e.name);
    const nearEntry = latest.close >= preferredEntryLow * .99 && latest.close <= preferredEntryHigh * 1.02;

    let status, reason;
    if (latest.close <= thesisBreak) {
      status='SELL / EXIT'; reason='Price broke the thesis level. The original setup is invalid until a new base forms.';
    } else if (!engines.trend.ready) {
      status='AVOID'; reason='Trend quality is not strong enough to justify an entry setup.';
    } else if (latest.close > overextension || r14 >= 76) {
      status='WAIT FOR PULLBACK'; reason='Trend is strong, but price is too extended to chase at the current level.';
    } else if (engines.trend.ready && engines.entry.ready && engines.probability.ready && engines.riskReward.ready) {
      status='BUY NOW'; reason='All four critical gates cleared: trend, entry, probability, and risk/reward.';
    } else if (engines.trend.ready && nearEntry && (engines.probability.ready || engines.riskReward.ready)) {
      status='SETUP — READY SOON'; reason='Price is near the preferred entry zone, but one critical confirmation is still missing.';
    } else {
      status='WAIT — SETUP NOT READY'; reason='Several checks pass, but at least one critical gate is still blocking a BUY signal.';
    }

    let readiness = Math.round((passed/total)*55 + (4-criticalFailed.length)/4*45);
    if (status==='BUY NOW') readiness = Math.max(readiness, 88);
    if (status==='AVOID' || status==='SELL / EXIT') readiness = Math.min(readiness, 35);
    if (status==='WAIT FOR PULLBACK') readiness = Math.min(readiness, 68);

    const changePct = prev.close ? latest.close / prev.close - 1 : 0;
    return {
      symbol, latest, changePct, sma20:s20, sma50:s50, atr:a14, rsi:r14, momentum20,
      preferredEntryLow, preferredEntryHigh, overextension, thesisBreak, target, rr, wf,
      engines, passed, total, criticalFailed, status, reason, readiness
    };
  }

  function engineState(name, metrics, needed) {
    const passes = metrics.filter(m => m.pass).length;
    const ready = passes >= needed;
    let state = ready ? 'PASS' : passes >= needed - 1 ? 'WARN' : 'FAIL';
    return { name, metrics, passes, total:metrics.length, ready, state };
  }

  function fmtMoney(v) {
    return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
  }

  function statusClass(status) {
    if (status==='BUY NOW') return 'status-buy';
    if (status==='SETUP — READY SOON') return 'status-setup';
    if (status==='WAIT FOR PULLBACK') return 'status-pullback';
    if (status==='WAIT — SETUP NOT READY') return 'status-wait';
    if (status==='AVOID') return 'status-avoid';
    return 'status-sell';
  }

  function renderTimeframes() {
    const root = $('timeframeTabs'); root.innerHTML='';
    Object.keys(TIMEFRAMES).forEach(tf => {
      const b = document.createElement('button');
      b.type='button'; b.className=`timeframe-btn ${tf===state.timeframe?'active':''}`; b.textContent=tf; b.setAttribute('role','tab'); b.setAttribute('aria-selected', tf===state.timeframe ? 'true':'false');
      b.addEventListener('click', () => { state.timeframe=tf; loadSymbol(state.symbol); });
      root.appendChild(b);
    });
  }

  function renderWatchlist() {
    const root = $('watchlist'); root.innerHTML='';
    WATCHLIST.forEach(sym => {
      const a = state.watchAnalyses[sym];
      const btn = document.createElement('button'); btn.type='button'; btn.className=`watch-item ${sym===state.symbol?'active':''}`;
      btn.innerHTML = `<div><div class="watch-symbol">${sym}</div><div class="watch-meta"><span class="watch-status ${a?statusClass(a.status):''}">${a?a.status.split(' — ')[0]:'…'}</span></div></div><div class="watch-price">${a?fmtMoney(a.latest.close):'—'}<div class="${a && a.changePct>=0?'price-change positive':'price-change negative'}">${a?(a.changePct*100).toFixed(2)+'%':'—'}</div></div>`;
      btn.addEventListener('click',()=>{state.symbol=sym; $('symbolInput').value=sym; loadSymbol(sym);});
      root.appendChild(btn);
    });
  }

  function renderHero(a) {
    $('tickerBadge').textContent=a.symbol;
    $('stockTitle').textContent=a.symbol;
    $('chartTitle').textContent=`${a.symbol} chart`;
    $('priceValue').textContent=fmtMoney(a.latest.close);
    $('priceChange').textContent=`${a.changePct>=0?'+':''}${(a.changePct*100).toFixed(2)}%`;
    $('priceChange').className=`price-change ${a.changePct>0?'positive':a.changePct<0?'negative':'neutral'}`;
    $('statusBadge').textContent=a.status;
    $('statusBadge').className=`status-badge ${statusClass(a.status)}`;
    $('statusReason').textContent=a.reason;
  }

  function renderReadiness(a) {
    $('readinessValue').textContent=`${a.readiness}%`;
    $('readinessLabel').textContent=a.status==='BUY NOW'?'Ready':a.status==='WAIT FOR PULLBACK'?'Overextended':a.status==='AVOID'?'Avoid':'Not ready';
    $('readinessGauge').style.setProperty('--pct', `${a.readiness}%`);
    $('checkSummary').textContent=`${a.passed} / ${a.total} checks passed`;
    $('gateSummary').textContent=a.criticalFailed.length ? `${a.criticalFailed.length} critical gate${a.criticalFailed.length>1?'s':''} blocking BUY: ${a.criticalFailed.join(', ')}` : 'All four critical gates are ready.';
  }

  function renderWhy(a) {
    const why=[];
    if (a.latest.close > a.overextension) why.push(['Strong trend, but price is overextended', 'Current price is above the overextension line. This is a chase-risk condition, not an automatic sell.']);
    if (!a.engines.entry.ready) why.push(['Entry gate is not ready', 'Wait for a better location, healthier RSI, or a pullback into the preferred entry zone.']);
    if (!a.engines.probability.ready) why.push(['Probability confirmation is incomplete', `Walk-forward result is ${(a.wf.winRate*100).toFixed(0)}% across ${a.wf.sample} qualifying historical samples in this loaded series.`]);
    if (!a.engines.riskReward.ready) why.push(['Risk / reward is not good enough', `Current estimated reward/risk is ${a.rr.toFixed(2)}:1. The gate requires at least 1.80:1.`]);
    if (!why.length) why.push(['All BUY gates are cleared', 'The system is currently satisfied with trend, entry, probability, and risk/reward.']);
    $('whyList').innerHTML=why.slice(0,4).map(([t,c])=>`<div class="why-item"><div class="why-title">${t}</div><div class="why-copy">${c}</div></div>`).join('');
  }

  function renderEngines(a) {
    const root=$('engineGrid');
    root.innerHTML=Object.values(a.engines).map((e,idx)=>{
      const stateClass=e.state.toLowerCase();
      const metrics=e.metrics.map(m=>{
        const cls=m.pass?'pass':m.warn?'warn':'fail'; const icon=m.pass?'✓':m.warn?'!':'×';
        return `<div class="metric"><div class="metric-icon ${cls}">${icon}</div><div><div class="metric-name">${m.name}</div><div class="metric-value">${m.value}</div></div></div>`;
      }).join('');
      return `<article class="engine-card"><div class="engine-top"><div class="engine-name">${idx+1}. ${e.name}</div><div class="engine-state ${stateClass}">${e.state}</div></div><div class="metric-list">${metrics}</div><div class="engine-foot">${e.passes} / ${e.total} passed · critical gate ${e.ready?'cleared':'not cleared'}</div></article>`;
    }).join('');
  }

  function renderLevels(a) {
    $('entryLevel').textContent=`${fmtMoney(a.preferredEntryLow)} – ${fmtMoney(a.preferredEntryHigh)}`;
    $('overLevel').textContent=fmtMoney(a.overextension);
    $('stopLevel').textContent=fmtMoney(a.thesisBreak);
  }

  function renderTriggers(a) {
    const rows=[
      ['BUY NOW', 'All four critical gates clear at the same time.', a.status==='BUY NOW'],
      ['READY SOON', 'Price is near the preferred entry zone and only limited confirmation remains.', a.status==='SETUP — READY SOON'],
      ['PULLBACK', `Price moves back under ${fmtMoney(a.overextension)} without breaking the trend thesis.`, a.latest.close <= a.overextension],
      ['SELL / EXIT', `Price closes through the thesis-break area near ${fmtMoney(a.thesisBreak)}.`, a.latest.close <= a.thesisBreak]
    ];
    $('triggerMap').innerHTML=rows.map(([l,d,on])=>`<div class="trigger-row"><div class="trigger-label">${l}</div><div class="trigger-desc">${d}</div><div class="trigger-state ${on?'status-buy':'status-wait'}">${on?'ACTIVE':'INACTIVE'}</div></div>`).join('');
  }

  function resizeCanvas() {
    const rect=canvas.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(300,Math.floor(rect.width*dpr)); canvas.height=Math.floor(360*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    drawChart();
  }

  function drawChart() {
    if (!state.analysis || !state.candles.length) return;
    const a=state.analysis, candles=state.candles;
    const w=canvas.getBoundingClientRect().width, h=360;
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#08111f'; ctx.fillRect(0,0,w,h);
    const pad={l:52,r:70,t:18,b:28};
    const highs=candles.map(c=>c.high), lows=candles.map(c=>c.low);
    const min=Math.min(...lows,a.thesisBreak)*.995, max=Math.max(...highs,a.overextension)*1.005;
    const y=v=>pad.t+(max-v)/(max-min)*(h-pad.t-pad.b);
    const x=i=>pad.l+i/(candles.length-1)*(w-pad.l-pad.r);

    ctx.strokeStyle='#17283c'; ctx.lineWidth=1; ctx.font='10px system-ui'; ctx.fillStyle='#7790ad';
    for(let i=0;i<=5;i++){const yy=pad.t+i*(h-pad.t-pad.b)/5;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();const val=max-i*(max-min)/5;ctx.fillText(val.toFixed(2),w-pad.r+8,yy+3);}

    const entryY1=y(a.preferredEntryHigh), entryY2=y(a.preferredEntryLow);
    ctx.fillStyle='rgba(47,209,139,.12)'; ctx.fillRect(pad.l,Math.min(entryY1,entryY2),w-pad.l-pad.r,Math.abs(entryY2-entryY1));
    drawLevel(a.overextension,'#f4a340','Overextension / Don’t Chase');
    drawLevel(a.thesisBreak,'#ef6262','Thesis Break / Stop');
    drawLevel((a.preferredEntryLow+a.preferredEntryHigh)/2,'#2fd18b','Preferred Entry');

    const step=(w-pad.l-pad.r)/candles.length; const body=Math.max(1.5,Math.min(5,step*.55));
    candles.forEach((c,i)=>{const xx=x(i), yo=y(c.open), yc=y(c.close), yh=y(c.high), yl=y(c.low); const up=c.close>=c.open; ctx.strokeStyle=up?'#2fd18b':'#ef6262'; ctx.fillStyle=up?'#2fd18b':'#ef6262'; ctx.beginPath();ctx.moveTo(xx,yh);ctx.lineTo(xx,yl);ctx.stroke(); ctx.fillRect(xx-body/2,Math.min(yo,yc),body,Math.max(1,Math.abs(yc-yo)));});

    const last=candles[candles.length-1]; const py=y(last.close); ctx.setLineDash([4,4]);ctx.strokeStyle='#7ebcff';ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(w-pad.r,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#7ebcff';ctx.fillText(last.close.toFixed(2),w-pad.r+8,py+3);

    function drawLevel(v,color,label){const yy=y(v);ctx.setLineDash([6,5]);ctx.strokeStyle=color;ctx.globalAlpha=.85;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=color;ctx.fillText(label,pad.l+8,yy-5);}
  }

  async function loadSymbol(symbol) {
    symbol=(symbol||'XOM').trim().toUpperCase().replace(/[^A-Z.]/g,'').slice(0,6) || 'XOM';
    state.symbol=symbol; $('symbolInput').value=symbol; $('stockSubtitle').textContent='Loading market series…';
    renderTimeframes();
    const data=await fetchMarketData(symbol,state.timeframe);
    state.candles=data.candles; state.analysis=analyze(state.candles,symbol);
    $('stockSubtitle').textContent=data.source==='api'?'Connected market-data feed':'Deterministic demo market feed';
    $('chartDataSource').textContent=`Data: ${data.source}`; $('candleResolution').textContent=`Resolution: ${TIMEFRAMES[state.timeframe].resolution}`;
    renderHero(state.analysis); renderReadiness(state.analysis); renderWhy(state.analysis); renderEngines(state.analysis); renderLevels(state.analysis); renderTriggers(state.analysis); renderWatchlist(); resizeCanvas();
  }

  async function scanWatchlist() {
    $('scanBtn').disabled=true; $('scanBtn').textContent='…';
    for (const sym of WATCHLIST) {
      const data=await fetchMarketData(sym,'6M'); state.watchAnalyses[sym]=analyze(data.candles,sym); renderWatchlist();
    }
    $('scanBtn').disabled=false; $('scanBtn').textContent='↻';
  }

  $('loadSymbolBtn').addEventListener('click',()=>loadSymbol($('symbolInput').value));
  $('symbolInput').addEventListener('keydown',e=>{if(e.key==='Enter') loadSymbol(e.currentTarget.value);});
  $('scanBtn').addEventListener('click',scanWatchlist);
  window.addEventListener('resize',()=>{clearTimeout(window.__sfResize);window.__sfResize=setTimeout(resizeCanvas,120);});

  renderTimeframes();
  scanWatchlist().then(()=>loadSymbol('XOM'));
})();
