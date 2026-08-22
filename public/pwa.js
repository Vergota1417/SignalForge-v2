(() => {
  let deferredInstallPrompt = null;
  const installBtn = document.getElementById('installAppBtn');
  const updateBanner = document.getElementById('updateBanner');
  const updateBtn = document.getElementById('updateAppBtn');
  const symbolInput = document.getElementById('symbolInput');

  if (symbolInput) {
    symbolInput.removeAttribute('maxlength');
    symbolInput.setAttribute('maxlength','80');
    symbolInput.setAttribute('placeholder','Ticker or company');
    symbolInput.setAttribute('aria-label','Ticker or company name');
  }

  loadModuleCss('/radar.css','sf-radar');
  loadModuleScript('/radar-ui.js','sf-radar');
  loadModuleCss('/push.css','sf-push');
  loadModuleScript('/push-ui.js','sf-push');
  loadModuleScript('/alert-history.js','sf-alert-history');
  loadModuleScript('/stock-meta.js','sf-stock-meta');
  loadModuleCss('/portfolio.css','sf-portfolio');
  loadModuleScript('/portfolio-ui.js','sf-portfolio');
  loadFinancialCharting();

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (installBtn && isStandalone) installBtn.hidden = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installBtn && !isStandalone) installBtn.hidden = false;
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      alert('On iPhone/iPad: open Share and choose Add to Home Screen. On Android: use your browser menu and choose Install app/Add to Home screen.');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installBtn) installBtn.hidden = true;
  });

  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });

      const showUpdate = worker => {
        if (!worker || !navigator.serviceWorker.controller) return;
        if (updateBanner) updateBanner.hidden = false;
        updateBtn?.addEventListener('click', () => worker.postMessage({ type: 'SKIP_WAITING' }), { once: true });
      };

      if (registration.waiting) showUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') showUpdate(worker);
        });
      });
    } catch (error) {
      console.error('[SignalForge PWA] Service worker registration failed', error);
    }
  });

  function loadFinancialCharting(){
    if(window.LightweightCharts?.createChart){loadModuleScript('/chart-adapter.js','sf-financial-chart');return;}
    if(document.querySelector('script[data-sf-lightweight]'))return;
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js';
    script.async=true;script.crossOrigin='anonymous';script.setAttribute('data-sf-lightweight','1');
    script.addEventListener('load',()=>loadModuleScript('/chart-adapter.js','sf-financial-chart'),{once:true});
    script.addEventListener('error',()=>console.warn('[SignalForge chart] Financial chart library unavailable; Canvas fallback remains active.'),{once:true});
    document.head.appendChild(script);
  }
  function loadModuleCss(href,key){
    if(document.querySelector(`link[data-${key}]`))return;
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.setAttribute(`data-${key}`,'1');document.head.appendChild(link);
  }
  function loadModuleScript(src,key){
    if(document.querySelector(`script[data-${key}]`))return;
    const script=document.createElement('script');script.src=src;script.defer=true;script.setAttribute(`data-${key}`,'1');document.head.appendChild(script);
  }
})();