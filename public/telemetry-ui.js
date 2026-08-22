(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const apiBase = () => String(window.SIGNALFORGE_CONFIG?.API_BASE_URL || window.location.origin).replace(/\/$/, '');
  const state = { health: null, research: null, screener: null, timer: null };

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function fmtTime(value) {
    const n = Number(value);
    if (!n) return 'Not yet';
    return new Date(n).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function fmtPct(value, digits = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—';
  }

  function fmtReturn(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
  }

  async function getJson(path) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const res = await fetch(`${apiBase()}${path}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  function ensureUi() {
    if ($('sfTelemetryPanel')) return;
    injectStyles();
    const hero = document.querySelector('.hero-card');
    if (!hero) return;

    const panel = document.createElement('section');
    panel.id = 'sfTelemetryPanel';
    panel.className = 'sf-telemetry';
    panel.innerHTML = `
      <div class="sf-telemetry-head">
        <div>
          <div class="eyebrow">Engine visibility · Stage 9.1</div>
          <h2>SignalForge system & research status</h2>
        </div>
        <div class="sf-live-chip" id="sfSystemChip"><span class="sf-live-dot"></span><span>Checking backend</span></div>
      </div>

      <div class="sf-system-grid">
        <article class="sf-status-card">
          <div class="sf-card-label">System</div>
          <div class="sf-status-line"><span>Backend</span><strong id="sfBackendState">Checking…</strong></div>
          <div class="sf-status-line"><span>Market data</span><strong id="sfMarketState">—</strong></div>
          <div class="sf-status-line"><span>Database</span><strong id="sfDatabaseState">—</strong></div>
          <div class="sf-status-line"><span>Background scanner</span><strong id="sfScannerState">—</strong></div>
        </article>

        <article class="sf-status-card">
          <div class="sf-card-label">Automation</div>
          <div class="sf-status-line"><span>Screener promotion</span><strong id="sfPromotionState">—</strong></div>
          <div class="sf-status-line"><span>After-hours research</span><strong id="sfResearchState">—</strong></div>
          <div class="sf-status-line"><span>Push alerts</span><strong id="sfPushState">—</strong></div>
          <div class="sf-status-line"><span>Last research run</span><strong id="sfLastResearch">—</strong></div>
        </article>

        <article class="sf-status-card sf-quota-card">
          <div class="sf-card-label">Provider quota</div>
          <div class="sf-quota-top"><strong id="sfQuotaUsed">—</strong><span id="sfQuotaMax">of — requests</span></div>
          <div class="sf-quota-bar" aria-label="Provider request usage"><span id="sfQuotaFill"></span><i id="sfQuotaTarget"></i></div>
          <div class="sf-quota-copy" id="sfQuotaCopy">Loading quota status…</div>
        </article>

        <article class="sf-status-card sf-research-card">
          <div class="sf-card-label">Research coverage</div>
          <div class="sf-research-main"><strong id="sfResearchCount">—</strong><span>symbols researched</span></div>
          <div class="sf-status-line"><span>Confirmed ≥ 60</span><strong id="sfConfirmedCount">—</strong></div>
          <div class="sf-status-line"><span>Last symbol</span><strong id="sfLastSymbol">—</strong></div>
          <div class="sf-status-line"><span>Last update</span><strong id="sfLastResearchTime">—</strong></div>
        </article>
      </div>

      <div class="sf-symbol-research" id="sfSymbolResearch">
        <div>
          <div class="sf-card-label">Selected-symbol historical confirmation</div>
          <div class="sf-symbol-research-title"><strong id="sfResearchSymbol">—</strong><span id="sfResearchBadge" class="sf-research-badge unresolved">UNRESOLVED</span></div>
        </div>
        <div class="sf-research-metrics">
          <div><span>Research score</span><strong id="sfResearchScore">—</strong></div>
          <div><span>Samples</span><strong id="sfResearchSamples">—</strong></div>
          <div><span>Win rate</span><strong id="sfResearchWin">—</strong></div>
          <div><span>Avg return</span><strong id="sfResearchReturn">—</strong></div>
          <div><span>Historical R/R</span><strong id="sfResearchRR">—</strong></div>
          <div><span>Researched</span><strong id="sfResearchWhen">—</strong></div>
        </div>
        <div class="sf-research-note" id="sfResearchNote">Historical research strengthens evidence, but cannot override the live critical gates.</div>
      </div>
    `;
    hero.insertAdjacentElement('afterend', panel);
  }

  function injectStyles() {
    if ($('sfTelemetryStyles')) return;
    const style = document.createElement('style');
    style.id = 'sfTelemetryStyles';
    style.textContent = `
      .sf-telemetry{margin:12px 0 14px;padding:14px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(135deg,rgba(14,27,45,.98),rgba(8,17,31,.98));display:grid;gap:12px}
      .sf-telemetry-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.sf-telemetry-head h2{font-size:17px;margin:1px 0 0}
      .sf-live-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:999px;padding:6px 9px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.03em;background:var(--panel)}
      .sf-live-chip.online{color:var(--green);border-color:rgba(47,209,139,.35)}.sf-live-chip.offline{color:var(--red);border-color:rgba(239,98,98,.35)}
      .sf-live-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px rgba(255,255,255,.04)}
      .sf-system-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .sf-status-card{min-width:0;padding:11px;border:1px solid var(--border);border-radius:10px;background:rgba(11,22,38,.92)}
      .sf-card-label{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:800;margin-bottom:7px}
      .sf-status-line{display:flex;justify-content:space-between;gap:8px;align-items:baseline;padding:4px 0;font-size:11px}.sf-status-line span{color:var(--muted)}.sf-status-line strong{text-align:right;font-size:11px}
      .sf-ok{color:var(--green)!important}.sf-warn{color:var(--orange)!important}.sf-bad{color:var(--red)!important}.sf-info{color:var(--blue)!important}
      .sf-quota-top{display:flex;align-items:baseline;gap:6px}.sf-quota-top strong{font-size:22px}.sf-quota-top span{color:var(--muted);font-size:10px}
      .sf-quota-bar{height:9px;border-radius:999px;background:#17283c;position:relative;overflow:hidden;margin:8px 0 6px}.sf-quota-bar span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--blue),var(--orange));transition:width .25s ease}.sf-quota-bar i{position:absolute;top:-3px;bottom:-3px;width:2px;background:#fff;opacity:.75}
      .sf-quota-copy{font-size:10px;color:var(--muted)}
      .sf-research-main{display:flex;align-items:baseline;gap:6px;margin-bottom:3px}.sf-research-main strong{font-size:22px}.sf-research-main span{color:var(--muted);font-size:10px}
      .sf-symbol-research{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(0,2fr);gap:14px;align-items:center;border-top:1px solid var(--border);padding-top:11px}
      .sf-symbol-research-title{display:flex;align-items:center;gap:8px}.sf-symbol-research-title>strong{font-size:20px}
      .sf-research-badge{display:inline-flex;border:1px solid currentColor;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900}.sf-research-badge.strong{color:var(--green)}.sf-research-badge.confirming{color:var(--blue)}.sf-research-badge.mixed{color:var(--orange)}.sf-research-badge.weak{color:var(--red)}.sf-research-badge.unresolved{color:var(--muted)}
      .sf-research-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.sf-research-metrics>div{padding:7px 8px;border-radius:8px;background:var(--panel-2);min-width:0}.sf-research-metrics span,.sf-research-metrics strong{display:block}.sf-research-metrics span{color:var(--muted);font-size:9px}.sf-research-metrics strong{font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sf-research-note{grid-column:1/-1;color:var(--muted);font-size:10px}
      @media(max-width:1100px){.sf-system-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-research-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:700px){.sf-telemetry-head{align-items:flex-start;flex-direction:column}.sf-system-grid{grid-template-columns:1fr}.sf-symbol-research{grid-template-columns:1fr}.sf-research-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function setState(id, text, cls = '') {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = cls;
  }

  function renderHealth() {
    const h = state.health || {};
    const chip = $('sfSystemChip');
    if (chip) {
      chip.className = `sf-live-chip ${h.ok ? 'online' : 'offline'}`;
      chip.lastElementChild.textContent = h.ok ? 'Backend online' : 'Backend unavailable';
    }
    setState('sfBackendState', h.ok ? 'Healthy' : 'Unavailable', h.ok ? 'sf-ok' : 'sf-bad');
    setState('sfMarketState', h.marketDataConfigured ? 'Connected' : 'Not configured', h.marketDataConfigured ? 'sf-ok' : 'sf-bad');
    setState('sfDatabaseState', h.databaseConfigured ? 'Connected' : 'Not configured', h.databaseConfigured ? 'sf-ok' : 'sf-bad');
    setState('sfScannerState', h.opportunityRadar && h.smartMarketScreener ? 'Scheduled · 15m cron' : 'Not ready', h.opportunityRadar && h.smartMarketScreener ? 'sf-ok' : 'sf-warn');
    setState('sfPromotionState', h.screenerPromotion ? 'Enabled' : 'Disabled', h.screenerPromotion ? 'sf-ok' : 'sf-warn');
    setState('sfResearchState', h.afterHoursResearch ? 'Enabled' : 'Disabled', h.afterHoursResearch ? 'sf-ok' : 'sf-warn');
    setState('sfPushState', h.pushConfigured ? `${Number(h.pushSubscribers) || 0} subscriber${Number(h.pushSubscribers) === 1 ? '' : 's'}` : 'Not configured', h.pushConfigured ? 'sf-ok' : 'sf-warn');
  }

  function renderResearch() {
    const r = state.research || {};
    const b = r.budget || {};
    const used = Number(b.used) || 0;
    const max = Math.max(1, Number(b.max) || 1);
    const target = Math.max(0, Number(b.targetRequests) || 0);
    const usagePct = Math.min(100, (used / max) * 100);
    const targetPct = Math.min(100, (target / max) * 100);

    $('sfQuotaUsed').textContent = used.toLocaleString();
    $('sfQuotaMax').textContent = `of ${max.toLocaleString()} requests`;
    $('sfQuotaFill').style.width = `${usagePct}%`;
    $('sfQuotaTarget').style.left = `${targetPct}%`;
    $('sfQuotaCopy').textContent = `${Math.max(0, Number(b.remainingToTarget) || 0)} requests remain to the research target · ${Math.max(0, Number(b.reserve) || 0)} reserved beyond target.`;
    $('sfResearchCount').textContent = (Number(r.researchCount) || 0).toLocaleString();
    $('sfLastResearchTime').textContent = fmtTime(r.lastResearchedAt);
    $('sfLastResearch').textContent = r.lastRun ? fmtTime(r.lastRun.completedAt) : 'Not yet';

    const researched = Array.isArray(r.lastRun?.researched) ? r.lastRun.researched : [];
    $('sfLastSymbol').textContent = researched.at(-1)?.symbol || '—';
  }

  function selectedSymbol() {
    return String($('tickerBadge')?.textContent || $('symbolInput')?.value || '').trim().toUpperCase();
  }

  function renderScreenerResearch() {
    const s = state.screener || {};
    const rows = Array.isArray(s.rows) ? s.rows : [];
    const confirmed = Number(s.coverage?.researchConfirmed) || rows.filter(row => Number(row.research?.confirmationScore) >= 60).length;
    $('sfConfirmedCount').textContent = confirmed.toLocaleString();

    const symbol = selectedSymbol();
    const row = rows.find(item => String(item.symbol || '').toUpperCase() === symbol);
    const research = row?.research || null;
    $('sfResearchSymbol').textContent = symbol || '—';

    const badge = $('sfResearchBadge');
    const label = research?.confidenceLabel || 'UNRESOLVED';
    badge.textContent = label;
    badge.className = `sf-research-badge ${String(label).toLowerCase().replace(/[^a-z]+/g, '-') || 'unresolved'}`;
    $('sfResearchScore').textContent = research ? `${Math.round(Number(research.confirmationScore) || 0)}/100` : '—';
    $('sfResearchSamples').textContent = research ? String(Math.round(Number(research.sampleSize) || 0)) : '—';
    $('sfResearchWin').textContent = research ? fmtPct(research.winRate, 0) : '—';
    $('sfResearchReturn').textContent = research ? fmtReturn(research.avgReturn) : '—';
    $('sfResearchRR').textContent = research ? `${Number(research.rr || 0).toFixed(2)} : 1` : '—';
    $('sfResearchWhen').textContent = research ? fmtTime(research.researchedAt) : 'Not researched yet';
    $('sfResearchNote').textContent = research
      ? `${label} historical confirmation. This adjusts screener ranking by ${Number(row.researchAdjustment || 0) >= 0 ? '+' : ''}${Number(row.researchAdjustment || 0).toFixed(1)}, but the live decision gates remain authoritative.`
      : 'No recent Stage 9 historical research is stored for this symbol yet. Live decision gates remain authoritative.';
  }

  async function refresh() {
    ensureUi();
    const results = await Promise.allSettled([
      getJson('/api/health'),
      getJson('/api/research-status'),
      getJson('/api/screener?limit=50')
    ]);

    state.health = results[0].status === 'fulfilled' ? results[0].value : { ok: false };
    state.research = results[1].status === 'fulfilled' ? results[1].value.research : null;
    state.screener = results[2].status === 'fulfilled' ? results[2].value.screener : null;

    renderHealth();
    renderResearch();
    renderScreenerResearch();
  }

  function watchSelectedSymbol() {
    const badge = $('tickerBadge');
    if (!badge) return;
    new MutationObserver(() => renderScreenerResearch()).observe(badge, { childList: true, characterData: true, subtree: true });
  }

  ensureUi();
  watchSelectedSymbol();
  refresh().catch(() => {
    state.health = { ok: false };
    renderHealth();
  });
  state.timer = setInterval(() => refresh().catch(() => {}), 5 * 60 * 1000);
})();