(() => {
  'use strict';

  const marketCache = new Map();
  const originalFetch = window.fetch.bind(window);
  const fmtMoney = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value)||0);
  const fmtVolume = value => new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:2 }).format(Number(value)||0);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (requestUrl) {
        const url = new URL(requestUrl, window.location.origin);
        if (url.origin === window.location.origin && url.pathname === '/api/market-data' && response.ok) {
          const clone = response.clone();
          clone.json().then(payload => {
            if (!Array.isArray(payload?.candles)) return;
            const symbol = String(payload.symbol || url.searchParams.get('symbol') || '').toUpperCase();
            const timeframe = String(payload.timeframe || url.searchParams.get('timeframe') || '6M').toUpperCase();
            marketCache.set(`${symbol}:${timeframe}`, payload);
            window.dispatchEvent(new CustomEvent('signalforge:market-data', { detail:{ symbol, timeframe } }));
          }).catch(() => {});
        }
      }
    } catch {}
    return response;
  };

  const style = document.createElement('style');
  style.textContent = `
    .sf-volume-wrap{margin-top:.65rem;border-top:1px solid rgba(255,255,255,.08);padding-top:.6rem}
    .sf-volume-head{display:flex;justify-content:space-between;gap:.75rem;align-items:center;margin-bottom:.35rem;color:#8fa4bd;font-size:.78rem}
    .sf-volume-canvas{display:block;width:100%;height:92px;background:#08111f;border-radius:8px;touch-action:none;cursor:crosshair}
    .sf-candle-detail{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.5rem;margin-top:.6rem;padding:.65rem .75rem;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(12,22,37,.78)}
    .sf-candle-cell{min-width:0}.sf-candle-label{display:block;color:#6f86a1;font-size:.66rem;text-transform:uppercase;letter-spacing:.07em}.sf-candle-value{display:block;margin-top:.15rem;color:#e8eef6;font-size:.82rem;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sf-candle-time{grid-column:span 2}
    @media(max-width:760px){.sf-candle-detail{grid-template-columns:repeat(3,minmax(0,1fr))}.sf-candle-time{grid-column:span 3}.sf-volume-canvas{height:84px}}
  `;
  document.head.appendChild(style);

  let volumeCanvas = null;
  let volumeCtx = null;
  let detailRoot = null;
  let selectedIndex = null;
  let resizeTimer = null;

  function ensureUi() {
    if (volumeCanvas) return true;
    const priceCanvas = document.getElementById('priceChart');
    const canvasWrap = priceCanvas?.closest('.canvas-wrap');
    if (!priceCanvas || !canvasWrap) return false;

    const wrap = document.createElement('div');
    wrap.className = 'sf-volume-wrap';
    wrap.innerHTML = `
      <div class="sf-volume-head"><strong>Volume</strong><span>Tap/click any candle to inspect OHLCV</span></div>
      <canvas id="sfVolumeChart" class="sf-volume-canvas" aria-label="Volume bars for loaded candles"></canvas>
      <div id="sfCandleDetail" class="sf-candle-detail" aria-live="polite"></div>`;
    canvasWrap.insertAdjacentElement('afterend', wrap);
    volumeCanvas = wrap.querySelector('#sfVolumeChart');
    volumeCtx = volumeCanvas.getContext('2d');
    detailRoot = wrap.querySelector('#sfCandleDetail');

    priceCanvas.addEventListener('pointerdown', event => selectFromPointer(event, priceCanvas));
    volumeCanvas.addEventListener('pointerdown', event => selectFromPointer(event, volumeCanvas));
    return true;
  }

  function currentKey() {
    const symbol = String(document.getElementById('tickerBadge')?.textContent || 'XOM').trim().toUpperCase();
    const timeframe = String(document.querySelector('.timeframe-btn.active')?.textContent || '6M').trim().toUpperCase();
    return `${symbol}:${timeframe}`;
  }

  function currentPayload() { return marketCache.get(currentKey()) || null; }

  function resizeVolumeCanvas() {
    if (!ensureUi()) return;
    const rect = volumeCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    volumeCanvas.width = Math.max(300, Math.floor(rect.width * dpr));
    volumeCanvas.height = Math.floor(rect.height * dpr);
    volumeCtx.setTransform(dpr,0,0,dpr,0,0);
    drawVolume();
  }

  function selectFromPointer(event, sourceCanvas) {
    const payload = currentPayload();
    if (!payload?.candles?.length) return;
    const rect = sourceCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const left = sourceCanvas.id === 'priceChart' ? 52 : 8;
    const right = sourceCanvas.id === 'priceChart' ? 70 : 8;
    const usable = Math.max(1, rect.width - left - right);
    const ratio = Math.max(0, Math.min(1, (x-left)/usable));
    selectedIndex = Math.round(ratio * (payload.candles.length-1));
    renderDetail();
    drawVolume();
  }

  function drawVolume() {
    if (!ensureUi()) return;
    const payload = currentPayload();
    const rect = volumeCanvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    volumeCtx.clearRect(0,0,w,h);
    volumeCtx.fillStyle = '#08111f';
    volumeCtx.fillRect(0,0,w,h);
    if (!payload?.candles?.length) return;

    const candles = payload.candles;
    const maxVol = Math.max(...candles.map(c => Number(c.volume)||0), 1);
    const pad = {l:8,r:8,t:6,b:8};
    const step = (w-pad.l-pad.r)/candles.length;
    const barW = Math.max(1, Math.min(7, step*.72));

    candles.forEach((c,i) => {
      const volume = Number(c.volume)||0;
      const barH = (volume/maxVol)*(h-pad.t-pad.b);
      const x = pad.l + (i+.5)*step;
      const y = h-pad.b-barH;
      const up = Number(c.close) >= Number(c.open);
      volumeCtx.globalAlpha = selectedIndex === i ? 1 : .68;
      volumeCtx.fillStyle = up ? '#2fd18b' : '#ef6262';
      volumeCtx.fillRect(x-barW/2,y,barW,Math.max(1,barH));
      if (selectedIndex === i) {
        volumeCtx.globalAlpha = 1;
        volumeCtx.strokeStyle = '#dce8f7';
        volumeCtx.lineWidth = 1;
        volumeCtx.strokeRect(x-barW/2-2,2,barW+4,h-4);
      }
    });
    volumeCtx.globalAlpha = 1;
  }

  function renderDetail() {
    if (!ensureUi()) return;
    const payload = currentPayload();
    if (!payload?.candles?.length) {
      detailRoot.innerHTML = '<div class="sf-candle-cell sf-candle-time"><span class="sf-candle-label">Candle</span><span class="sf-candle-value">Waiting for chart data…</span></div>';
      return;
    }
    if (selectedIndex == null || selectedIndex >= payload.candles.length) selectedIndex = payload.candles.length-1;
    const c = payload.candles[selectedIndex];
    const when = Number.isFinite(Number(c.time)) ? new Date(Number(c.time)).toLocaleString() : String(c.time||'—');
    const change = Number(c.open) ? ((Number(c.close)/Number(c.open))-1)*100 : 0;
    detailRoot.innerHTML = `
      <div class="sf-candle-cell sf-candle-time"><span class="sf-candle-label">Time</span><span class="sf-candle-value">${when}</span></div>
      <div class="sf-candle-cell"><span class="sf-candle-label">Open</span><span class="sf-candle-value">${fmtMoney(c.open)}</span></div>
      <div class="sf-candle-cell"><span class="sf-candle-label">High</span><span class="sf-candle-value">${fmtMoney(c.high)}</span></div>
      <div class="sf-candle-cell"><span class="sf-candle-label">Low</span><span class="sf-candle-value">${fmtMoney(c.low)}</span></div>
      <div class="sf-candle-cell"><span class="sf-candle-label">Close</span><span class="sf-candle-value">${fmtMoney(c.close)}</span></div>
      <div class="sf-candle-cell"><span class="sf-candle-label">Volume</span><span class="sf-candle-value">${fmtVolume(c.volume)}</span></div>
      <div class="sf-candle-cell"><span class="sf-candle-label">Candle move</span><span class="sf-candle-value">${change>=0?'+':''}${change.toFixed(2)}%</span></div>`;
  }

  function refresh() {
    if (!ensureUi()) return;
    const payload = currentPayload();
    if (payload?.candles?.length) selectedIndex = payload.candles.length-1;
    resizeVolumeCanvas();
    renderDetail();
  }

  window.addEventListener('signalforge:market-data', () => setTimeout(refresh, 0));
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer=setTimeout(resizeVolumeCanvas,120); });
  document.addEventListener('click', event => {
    if (event.target.closest('.timeframe-btn,.watch-item,.recent-item,.symbol-suggestion,#loadSymbolBtn')) setTimeout(refresh,250);
  });
  window.addEventListener('load', refresh);
})();
