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
})();
