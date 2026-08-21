window.SIGNALFORGE_CONFIG = {
  // Production uses the same Cloudflare Worker origin for UI + API.
  // The Worker keeps market-data credentials server-side.
  API_BASE_URL: window.location.origin,
  REQUEST_TIMEOUT_MS: 10000
};
