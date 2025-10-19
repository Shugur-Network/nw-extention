// Enterprise-grade logging
import { swLogger as logger } from "./shared/logger.js";

const OFFSCREEN_DOC_URL = chrome.runtime.getURL("offscreen.html");

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOC_URL,
      reasons: ["BLOBS", "IFRAME_SCRIPTING"],
      justification: "Keep long-lived WebSockets to Nostr relays",
    });
  }
}

async function rpc(method, params) {
  await ensureOffscreen();
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    let timeoutId;

    const onMsg = (msg) => {
      if (msg?.target !== "sw" || msg?.id !== id) return;
      chrome.runtime.onMessage.removeListener(onMsg);
      clearTimeout(timeoutId);
      msg.error ? reject(new Error(msg.error)) : resolve(msg.result);
    };

    // Register listener FIRST
    chrome.runtime.onMessage.addListener(onMsg);

    // Use nextTick to ensure listener is registered
    setTimeout(() => {
      chrome.runtime
        .sendMessage({ target: "offscreen", id, method, params })
        .catch((err) => {
          chrome.runtime.onMessage.removeListener(onMsg);
          clearTimeout(timeoutId);
          reject(err);
        });
    }, 0);

    timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMsg);
      reject(new Error(`RPC timeout: ${method}`));
    }, CONFIG.RPC_TIMEOUT);
  });
}

// Configuration constants
const CONFIG = {
  // Cache settings
  DNS_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  DNS_CACHE_MAX_SIZE: 100, // Max entries in DNS cache
  PREFETCH_TTL: 30 * 1000, // 30 seconds (reduced - must revalidate via entrypoint)
  PREFETCH_MAX_SIZE: 50, // Max entries in prefetch cache
  CACHE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours

  // Rate limiting
  DNS_RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  DNS_RATE_LIMIT_MAX: 10, // Max 10 DNS queries per minute per host
  RATE_LIMIT_MAX_SIZE: 100, // Max entries in rate limit map
  GLOBAL_RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  GLOBAL_RATE_LIMIT_MAX: 50, // Max 50 total DNS queries per minute (all domains)
  RELAY_RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RELAY_RATE_LIMIT_MAX: 100, // Max 100 relay queries per minute

  // Timeouts
  RPC_TIMEOUT: 30000, // 30 seconds
  FETCH_TIMEOUT: 15000, // 15 seconds
  NAVIGATION_TIMEOUT: 10000, // 10 seconds

  // Retry settings
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000, // 1 second

  // Cache names
  CACHE_NAME: "nostr-web-v4", // Bumped for NIP updates (new event kinds and architecture)

  // Offscreen document settings
  OFFSCREEN_DOCUMENT_LIFETIME: 5 * 60 * 1000, // 5 minutes

  // Loading page settings
  LOADING_UPDATE_INTERVAL: 500, // 500ms
  LOADING_MAX_TIME: 30000, // 30 seconds

  // Failure cache
  FAILURE_CACHE_TIME: 60000, // 1 minute

  // Default website
  DEFAULT_SITE: "nweb.shugur.com", // Demo site shown to first-time users
};

// Set default website on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    logger.info("Nostr Web extension installed", {
      defaultSite: CONFIG.DEFAULT_SITE,
    });
    chrome.storage.local.set({ nweb_default_site: CONFIG.DEFAULT_SITE }, () => {
      logger.info("Default site configured", { site: CONFIG.DEFAULT_SITE });
    });
  } else if (details.reason === "update") {
    logger.info("Nostr Web extension updated", {
      version: chrome.runtime.getManifest().version,
    });
    // Also set default site on update if not already set
    chrome.storage.local.get(["nweb_default_site"], (result) => {
      if (!result.nweb_default_site) {
        chrome.storage.local.set(
          { nweb_default_site: CONFIG.DEFAULT_SITE },
          () => {
            logger.info("Default site configured", {
              site: CONFIG.DEFAULT_SITE,
            });
          }
        );
      }
    });
  }
});

// Ensure default site is set on service worker startup (fallback)
chrome.storage.local.get(["nweb_default_site"], (result) => {
  if (!result.nweb_default_site) {
    logger.info("Setting default site on service worker startup");
    chrome.storage.local.set({ nweb_default_site: CONFIG.DEFAULT_SITE }, () => {
      logger.info("Default site configured", { site: CONFIG.DEFAULT_SITE });
    });
  }
});

// Cache for DNS lookups to avoid repeated checks
const dnsCache = new Map();

// Rate limiting for DNS queries
const dnsRateLimit = new Map();

// Cache for prefetched content
const prefetchCache = new Map();

// Global rate limiting (security: prevent DoS)
const globalRateLimit = { count: 0, windowStart: Date.now() };

// Check global rate limit
function checkGlobalRateLimit() {
  const now = Date.now();

  // Reset window if expired
  if (now - globalRateLimit.windowStart > CONFIG.GLOBAL_RATE_LIMIT_WINDOW) {
    globalRateLimit.count = 0;
    globalRateLimit.windowStart = now;
  }

  globalRateLimit.count++;

  if (globalRateLimit.count > CONFIG.GLOBAL_RATE_LIMIT_MAX) {
    logger.warn("Global rate limit exceeded", {
      count: globalRateLimit.count,
      max: CONFIG.GLOBAL_RATE_LIMIT_MAX,
    });
    return false;
  }

  return true;
}

// LRU eviction for DNS cache
function evictDNSCache() {
  if (dnsCache.size >= CONFIG.DNS_CACHE_MAX_SIZE) {
    let oldest = null;
    let oldestTime = Infinity;
    for (const [key, entry] of dnsCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = key;
      }
    }
    if (oldest) dnsCache.delete(oldest);
  }
}

// LRU eviction for prefetch cache
function evictPrefetchCache() {
  if (prefetchCache.size >= CONFIG.PREFETCH_MAX_SIZE) {
    let oldest = null;
    let oldestTime = Infinity;
    for (const [key, entry] of prefetchCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = key;
      }
    }
    if (oldest) prefetchCache.delete(oldest);
  }
}

// LRU eviction for rate limit map
function evictRateLimitMap() {
  if (dnsRateLimit.size >= CONFIG.RATE_LIMIT_MAX_SIZE) {
    let oldest = null;
    let oldestTime = Infinity;
    for (const [key, entry] of dnsRateLimit.entries()) {
      if (entry.windowStart < oldestTime) {
        oldestTime = entry.windowStart;
        oldest = key;
      }
    }
    if (oldest) dnsRateLimit.delete(oldest);
  }
}

// Store page in persistent cache for offline access
async function cacheOffline(cacheKey, doc) {
  try {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    // Use a fake https URL as cache key since Cache API doesn't support chrome-extension://
    const cacheUrl = `https://nostr-web.local/${cacheKey}`;
    const response = new Response(JSON.stringify(doc), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=86400", // 24 hours
        "X-Cached-At": Date.now().toString(),
      },
    });
    await cache.put(cacheUrl, response);
    logger.debug("Cached offline", { cacheKey });
  } catch (e) {
    logger.warn("Failed to cache offline", { error: e.message });
  }
}

// Retrieve from offline cache
async function getOfflineCache(cacheKey) {
  try {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    const cacheUrl = `https://nostr-web.local/${cacheKey}`;
    const response = await cache.match(cacheUrl);
    if (!response) return null;

    // Check age
    const cachedAt = parseInt(response.headers.get("X-Cached-At") || "0");
    if (Date.now() - cachedAt > CONFIG.CACHE_MAX_AGE) {
      await cache.delete(cacheUrl); // Expired
      return null;
    }

    const docJson = await response.text();
    const doc = JSON.parse(docJson);
    logger.debug("Retrieved from offline cache", { cacheKey });
    return doc;
  } catch (e) {
    logger.warn("Failed to retrieve offline cache", { error: e.message });
    return null;
  }
}

// Rate limiting check for DNS queries
function checkDNSRateLimit(host) {
  const now = Date.now();

  // Check global rate limit first
  const globalKey = "dns:global";
  const globalLimit = dnsRateLimit.get(globalKey) || {
    count: 0,
    windowStart: now,
  };

  if (now - globalLimit.windowStart > CONFIG.GLOBAL_RATE_LIMIT_WINDOW) {
    globalLimit.count = 0;
    globalLimit.windowStart = now;
  }

  globalLimit.count++;
  dnsRateLimit.set(globalKey, globalLimit);

  if (globalLimit.count > CONFIG.GLOBAL_RATE_LIMIT_MAX) {
    logger.warn("Global DNS rate limit exceeded", {
      count: globalLimit.count,
      max: CONFIG.GLOBAL_RATE_LIMIT_MAX,
    });
    return false;
  }

  // Check per-host rate limit
  const key = `dns:${host}`;
  const limitInfo = dnsRateLimit.get(key) || { count: 0, windowStart: now };

  // Reset window if expired
  if (now - limitInfo.windowStart > CONFIG.DNS_RATE_LIMIT_WINDOW) {
    limitInfo.count = 0;
    limitInfo.windowStart = now;
  }

  limitInfo.count++;

  // Evict old entries before adding new one
  evictRateLimitMap();

  dnsRateLimit.set(key, limitInfo);

  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    // 1% chance to clean up
    cleanupRateLimitCache();
  }

  return limitInfo.count <= CONFIG.DNS_RATE_LIMIT_MAX;
}

// Clean up old rate limit entries
function cleanupRateLimitCache() {
  const now = Date.now();
  for (const [key, info] of dnsRateLimit.entries()) {
    if (now - info.windowStart > CONFIG.DNS_RATE_LIMIT_WINDOW * 2) {
      dnsRateLimit.delete(key);
    }
  }
}

// Check if a domain has Nostr Web DNS record
async function hasNostrWebDNS(host) {
  // Check cache first
  const cached = dnsCache.get(host);
  if (cached !== undefined) {
    return cached;
  }

  // Global rate limiting check (security: prevent extension-wide DoS)
  if (!checkGlobalRateLimit()) {
    logger.warn("Global DNS rate limit exceeded");
    evictDNSCache();
    dnsCache.set(host, false);
    setTimeout(() => dnsCache.delete(host), CONFIG.DNS_CACHE_TTL);
    return false;
  }

  // Per-host rate limiting check
  if (!checkDNSRateLimit(host)) {
    logger.warn("DNS rate limit exceeded", { host });
    evictDNSCache(); // Evict before adding
    dnsCache.set(host, false);
    setTimeout(() => dnsCache.delete(host), CONFIG.DNS_CACHE_TTL); // Cache negative for cache TTL
    return false;
  }

  try {
    const boot = await rpc("dnsBootstrap", { host });
    const hasNW = !!(boot && boot.pk && boot.relays && boot.relays.length > 0);
    evictDNSCache(); // Evict before adding
    dnsCache.set(host, hasNW);
    // Cache for configured TTL
    setTimeout(() => dnsCache.delete(host), CONFIG.DNS_CACHE_TTL);
    return hasNW;
  } catch (e) {
    // No Nostr Web DNS record
    evictDNSCache(); // Evict before adding
    dnsCache.set(host, false);
    setTimeout(() => dnsCache.delete(host), CONFIG.DNS_CACHE_TTL);
    return false;
  }
}

// Intercept navigation and check for Nostr Web
chrome.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    try {
      // Skip sub-frame navigations, and non-http protocols
      if (details.frameId !== 0 || !details.url.startsWith("http")) return;

      const url = new URL(details.url);
      const host = url.hostname;

      // Check if we've already tried and failed recently to avoid loops
      const lastFailure = await chrome.storage.local.get([`err:${host}`]);
      if (
        lastFailure[`err:${host}`] &&
        Date.now() - lastFailure[`err:${host}`] < CONFIG.FAILURE_CACHE_TIME
      ) {
        return;
      }

      try {
        // Perform DNS lookup via offscreen document
        const boot = await rpc("dnsBootstrap", { host });
        if (boot?.pk && boot?.relays?.length > 0) {
          logger.info("Nostr Web detected", {
            host,
            relays: boot.relays.length,
          });

          // Redirect to viewer page with URL parameter
          const viewerUrl =
            chrome.runtime.getURL("viewer.html") +
            `?url=${encodeURIComponent(host + url.pathname)}`;
          await chrome.tabs.update(details.tabId, { url: viewerUrl });
        }
      } catch (e) {
        logger.debug("Not a Nostr Web host", { host, error: e.message });
        // Cache the failure to prevent re-checking on every navigation
        await chrome.storage.local.set({ [`err:${host}`]: Date.now() });
      }
    } catch (outerError) {
      // Catch any unexpected errors in navigation handler
      logger.error("Navigation handler error", { error: outerError.message });
      // Don't block navigation on error
    }
  },
  { url: [{ schemes: ["http", "https"] }] }
);

// Create a beautiful loading page
function createLoadingPage(host, route) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Loading ${host}${route}... | Nostr Web</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0a0a0a;
    }
    .container {
      text-align: center;
      max-width: 500px;
      padding: 40px;
    }
    .logo {
      font-size: 48px;
      margin-bottom: 20px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.05); opacity: 1; }
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .host {
      font-size: 15px;
      font-weight: 400;
      margin-bottom: 30px;
      color: #666;
    }
    .loader {
      width: 48px;
      height: 48px;
      border: 3px solid #f0f0f0;
      border-top-color: #0a0a0a;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      font-size: 14px;
      opacity: 0.8;
      margin-top: 20px;
    }
    .steps {
      margin-top: 30px;
      text-align: left;
      display: inline-block;
    }
    .step {
      padding: 10px 0;
      opacity: 0.6;
      font-size: 14px;
    }
    .step.active {
      opacity: 1;
      font-weight: 500;
    }
    .step::before {
      content: "⏳ ";
    }
    .step.active::before {
      content: "⚡ ";
      animation: flash 0.5s ease-in-out infinite;
    }
    @keyframes flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🌐</div>
    <h1>Loading Nostr Web</h1>
    <div class="host">${host}${route}</div>
    <div class="loader"></div>
    <div class="status">Fetching from decentralized relays...</div>
    <div class="steps">
      <div class="step active">✓ DNS resolved</div>
      <div class="step active">⚡ Connecting to relays</div>
      <div class="step">Fetching events</div>
      <div class="step">Assembling page</div>
    </div>
  </div>
</body>
</html>`;
}

// Create a beautiful error page
function createErrorPage(host, route, errorMsg) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error Loading ${host} | Nostr Web</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0a0a0a;
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 500px;
      background: #fafafa;
      padding: 48px 40px;
      border-radius: 12px;
      border: 1px solid #e8e8e8;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
    }
    .icon svg {
      width: 100%;
      height: 100%;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .host {
      font-size: 14px;
      font-weight: 400;
      margin-bottom: 20px;
      color: #666;
    }
    .error {
      background: #ffffff;
      padding: 16px 20px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 14px;
      word-break: break-word;
      border: 1px solid #e8e8e8;
      color: #d32f2f;
      font-weight: 500;
    }
    .help {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
    }
    .buttons {
      margin-top: 24px;
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    button {
      padding: 10px 20px;
      background: #0a0a0a;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
      letter-spacing: -0.01em;
    }
    button:hover {
      opacity: 0.9;
    }
    button.secondary {
      background: #ffffff;
      color: #0a0a0a;
      border: 1px solid #e8e8e8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    </div>
    <h1>Failed to Load</h1>
    <div class="host">${host}${route}</div>
    <div class="error">${errorMsg}</div>
    <div class="help">
      This could mean:<br>
      • The site events are not published to the relays<br>
      • The relays are unreachable<br>
      • The DNS record is misconfigured
    </div>
    <div class="buttons">
      <button onclick="location.reload()">Retry</button>
      <button class="secondary" onclick="history.back()">Go Back</button>
    </div>
  </div>
</body>
</html>`;
}

// Consolidated message handler for all UI and content script requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle prefetch requests from content script
  if (msg?.type === "prefetch") {
    (async () => {
      try {
        const url = new URL(msg.url);
        const host = url.hostname;
        const route = url.pathname || "/";
        const cacheKey = `${host}${route}`;

        // Check if already prefetched
        if (prefetchCache.has(cacheKey)) {
          sendResponse({ ok: true, cached: true });
          return;
        }

        // Check DNS first - don't prefetch non-Nostr Web sites
        const hasNW = await hasNostrWebDNS(host);
        if (!hasNW) {
          sendResponse({ ok: false, error: "Not a Nostr Web site" });
          return;
        }

        // Fetch and assemble in background
        const boot = await rpc("dnsBootstrap", { host });
        const siteIndex = await rpc("fetchSiteIndex", { boot });
        const manifest = await rpc("fetchManifestForRoute", {
          boot,
          siteIndex,
          route,
        });
        const assets = await rpc("fetchAssets", {
          boot,
          manifest,
          siteIndexId: siteIndex.id,
        });
        await rpc("verifySRI", { assets });
        const doc = await rpc("assembleDocument", { manifest, assets });

        // Store site index ID with doc for cache validation
        doc._siteIndexId = siteIndex.id;

        // Store in prefetch cache (short-term) and offline cache (long-term)
        evictPrefetchCache(); // Evict before adding
        prefetchCache.set(cacheKey, {
          doc,
          timestamp: Date.now(),
          _siteIndexId: siteIndex.id,
        });
        await cacheOffline(cacheKey, doc);

        // Auto-expire prefetch cache after TTL
        setTimeout(() => {
          prefetchCache.delete(cacheKey);
        }, CONFIG.PREFETCH_TTL);

        sendResponse({ ok: true, cached: false });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle nw.load command from UI
  if (msg?.cmd === "nw.load") {
    (async () => {
      try {
        const { host, route } = msg;
        const cacheKey = `${host}${route || "/"}`;

        // IMPORTANT: Always fetch boot + site index to check for updates
        // Entrypoint (kind 11126) is ALWAYS fetched fresh (TTL=0) per NIP spec
        // This ensures we detect site updates immediately
        let boot, siteIndex, manifest, assets, doc;
        let fetchError = null;

        try {
          logger.debug("Checking for updates", { cacheKey });
          boot = await rpc("dnsBootstrap", { host });
          siteIndex = await rpc("fetchSiteIndex", { boot });

          // Check both prefetch and offline cache against current site index
          const prefetched = prefetchCache.get(cacheKey);
          if (
            prefetched &&
            prefetched._siteIndexId === siteIndex.id &&
            Date.now() - prefetched.timestamp < CONFIG.PREFETCH_TTL
          ) {
            logger.info("Prefetch cache hit - validated via entrypoint", {
              cacheKey,
              siteIndexId: siteIndex.id.slice(0, 8),
            });
            sendResponse({ ok: true, result: { doc: prefetched.doc } });
            return;
          }

          const cached = await getOfflineCache(cacheKey);
          if (cached && cached._siteIndexId === siteIndex.id) {
            logger.info("Offline cache hit - validated via entrypoint", {
              cacheKey,
              siteIndexId: siteIndex.id.slice(0, 8),
            });
            // Update prefetch cache with validated content
            prefetchCache.set(cacheKey, {
              doc: cached,
              timestamp: Date.now(),
              _siteIndexId: siteIndex.id,
            });
            sendResponse({ ok: true, result: { doc: cached } });
            return;
          }

          // Cache miss or stale - fetch fresh content
          logger.debug("Cache miss or stale - fetching fresh content", {
            cacheKey,
            siteIndexId: siteIndex.id.slice(0, 8),
          });

          manifest = await rpc("fetchManifestForRoute", {
            boot,
            siteIndex,
            route: route || "/",
          });
          logger.debug("Manifest fetched", {
            route: route || "/",
            id: manifest.id.slice(0, 8),
          });
          assets = await rpc("fetchAssets", {
            boot,
            manifest,
            siteIndexId: siteIndex.id,
          });
          await rpc("verifySRI", { assets });
          doc = await rpc("assembleDocument", { manifest, assets });

          logger.debug("Document assembled", {
            htmlSize: doc.html?.length || 0,
            cssCount: doc.css?.length || 0,
            jsCount: doc.js?.length || 0,
          });

          // Store site_index ID with cached doc for validation
          doc._siteIndexId = siteIndex.id;

          // Update both prefetch and offline caches
          evictPrefetchCache();
          prefetchCache.set(cacheKey, {
            doc,
            timestamp: Date.now(),
            _siteIndexId: siteIndex.id,
          });
          await cacheOffline(cacheKey, doc);

          sendResponse({ ok: true, result: { doc } });
        } catch (e) {
          fetchError = e;
          logger.warn("Relay fetch failed", { error: e.message });

          // Fall back to offline cache only if fetch failed (offline mode)
          const cached = await getOfflineCache(cacheKey);
          if (cached) {
            logger.info("Using offline cache", { cacheKey, mode: "offline" });
            sendResponse({ ok: true, result: { doc: cached }, offline: true });
            return;
          }

          // No cache available, throw the original error
          throw fetchError;
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle nw.open command (open in new tab)
  if (msg?.cmd === "nw.open") {
    (async () => {
      try {
        const { host, route } = msg;
        const boot = await rpc("dnsBootstrap", { host });
        const siteIndex = await rpc("fetchSiteIndex", { boot });
        const manifest = await rpc("fetchManifestForRoute", {
          boot,
          siteIndex,
          route: route || "/",
        });
        const assets = await rpc("fetchAssets", {
          boot,
          manifest,
          siteIndexId: siteIndex.id,
        });
        await rpc("verifySRI", { assets });
        const finalHtml = await rpc("assembleDocument", { manifest, assets });

        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(
          finalHtml
        )}`;
        chrome.tabs.create({ url: dataUrl });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle cache clearing from settings
  if (msg?.type === "CLEAR_CACHE") {
    (async () => {
      try {
        logger.info("🗑️ Clearing all caches...");

        // Clear in-memory caches
        dnsCache.clear();
        prefetchCache.clear();
        dnsRateLimit.clear();

        // Reset global rate limit counter
        globalRateLimit.count = 0;
        globalRateLimit.windowStart = Date.now();

        logger.info("✅ Cleared in-memory caches (DNS, prefetch, rate limits)");

        // Clear Cache API (offline cache)
        try {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            if (name.startsWith("nostr-web")) {
              await caches.delete(name);
              logger.info(`✅ Deleted cache: ${name}`);
            }
          }
        } catch (e) {
          logger.warn("Failed to clear Cache API", { error: e.message });
        }

        // Clear offscreen cache by sending RPC
        try {
          await rpc("clearCache", {});
          logger.info("✅ Cleared offscreen document cache (DNS, events)");
        } catch (e) {
          logger.warn("Failed to clear offscreen cache", { error: e.message });
        }

        // Preserve user settings before clearing storage
        const preserveKeys = ["nweb_default_site", "nweb_log_level"];
        const preserved = await chrome.storage.local.get(preserveKeys);

        // Clear persistent storage (caches only)
        await chrome.storage.local.clear();

        // Restore preserved settings
        if (Object.keys(preserved).length > 0) {
          await chrome.storage.local.set(preserved);
          logger.info("✅ User settings preserved", {
            keys: Object.keys(preserved),
          });
        }

        logger.info("🎉 All caches cleared successfully!");
        sendResponse({ ok: true });
      } catch (e) {
        logger.error("Failed to clear cache", { error: e.message });
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  return false; // Not our message, let others handle it
});

chrome.alarms.create("keepalive", { periodInMinutes: 4 });
chrome.alarms.onAlarm.addListener(
  (a) => a.name === "keepalive" && ensureOffscreen()
);

// ---- Debug/Admin Functions (exposed globally for console access) ----
globalThis.clearAllCaches = async function () {
  logger.info("🗑️ Clearing all caches...");

  // Clear in-memory caches
  dnsCache.clear();
  prefetchCache.clear();
  dnsRateLimit.clear();

  logger.info("✅ Cleared in-memory caches (DNS, prefetch, rate limits)");

  // Clear Cache API (offline cache)
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name.startsWith("nostr-web")) {
        await caches.delete(name);
        logger.info(`✅ Deleted cache: ${name}`);
      }
    }
  } catch (e) {
    logger.warn("Failed to clear Cache API", { error: e.message });
  }

  // Clear offscreen cache by sending RPC
  try {
    await rpc("clearCache", {});
    logger.info("✅ Cleared offscreen document cache");
  } catch (e) {
    logger.warn("Failed to clear offscreen cache", { error: e.message });
  }

  logger.info("🎉 All caches cleared! Try loading your site again.");
  return "All caches cleared successfully!";
};

globalThis.showCacheStats = function () {
  console.log("📊 Cache Statistics:");
  console.log(`  DNS Cache: ${dnsCache.size} entries`);
  console.log(`  Prefetch Cache: ${prefetchCache.size} entries`);
  console.log(`  Rate Limits: ${dnsRateLimit.size} entries`);
  console.log("\nDNS Cache entries:");
  for (const [host, entry] of dnsCache.entries()) {
    console.log(`  - ${host}:`, entry);
  }
  return "Check console for details";
};

// Log helper message on service worker start
logger.info("🔧 Debug commands available:");
logger.info("  clearAllCaches() - Clear all extension caches");
logger.info("  showCacheStats() - Show cache statistics");
