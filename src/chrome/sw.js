// Enterprise-grade logging
import { swLogger as logger } from "./shared/logger.js";
import { CONFIG } from "./shared/constants.js";
import {
  createStandardCaches,
  cacheOffline,
  getOfflineCache,
  clearOfflineCache,
} from "./shared/cache-manager.js";
import { createLoadingPage, createErrorPage } from "./shared/page-templates.js";

const OFFSCREEN_DOC_URL = chrome.runtime.getURL("offscreen.html");

// Initialize caches and rate limiters
const caches = createStandardCaches();
const dnsCache = caches.dns;
const prefetchCache = caches.prefetch;
const dnsRateLimit = caches.dnsRateLimit;
const globalRateLimit = caches.globalRateLimit;

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
    let listenerCleanedUp = false;

    const cleanup = () => {
      if (listenerCleanedUp) return;
      listenerCleanedUp = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const onMsg = (msg) => {
      if (msg?.target !== "sw" || msg?.id !== id) return;
      cleanup();
      msg.error ? reject(new Error(msg.error)) : resolve(msg.result);
    };

    // Register listener FIRST (synchronously before any async operations)
    chrome.runtime.onMessage.addListener(onMsg);

    // Send message immediately (listener is already registered)
    chrome.runtime
      .sendMessage({ target: "offscreen", id, method, params })
      .catch((err) => {
        cleanup();
        reject(err);
      });

    // Set timeout after sending message
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`RPC timeout: ${method}`));
    }, CONFIG.RPC_TIMEOUT);
  });
}

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

// All cache and rate limiting logic now handled by shared/cache-manager.js

/**
 * Check if a domain has Nostr Web DNS record
 * @param {string} host - Hostname to check
 * @returns {Promise<boolean>} True if domain has Nostr Web DNS
 */
async function hasNostrWebDNS(host) {
  // Check cache first
  const cached = dnsCache.get(host);
  if (cached !== null) {
    return cached;
  }

  // Global rate limiting check (security: prevent extension-wide DoS)
  if (!globalRateLimit.check("global")) {
    logger.warn("Global DNS rate limit exceeded");
    dnsCache.set(host, false, CONFIG.DNS_CACHE_TTL);
    return false;
  }

  // Per-host rate limiting check
  if (!dnsRateLimit.check(`dns:${host}`)) {
    logger.warn("DNS rate limit exceeded", { host });
    dnsCache.set(host, false, CONFIG.DNS_CACHE_TTL);
    return false;
  }

  try {
    const boot = await rpc("dnsBootstrap", { host });
    const hasNW = !!(boot && boot.pk && boot.relays && boot.relays.length > 0);
    dnsCache.set(host, hasNW, CONFIG.DNS_CACHE_TTL);
    return hasNW;
  } catch (e) {
    // No Nostr Web DNS record
    dnsCache.set(host, false, CONFIG.DNS_CACHE_TTL);
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

// Page templates now imported from shared/page-templates.js

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
        prefetchCache.set(cacheKey, doc, CONFIG.PREFETCH_TTL);
        await cacheOffline(cacheKey, doc);

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
          if (prefetched && prefetched._siteIndexId === siteIndex.id) {
            logger.info("Prefetch cache hit - validated via entrypoint", {
              cacheKey,
              siteIndexId: siteIndex.id.slice(0, 8),
            });
            sendResponse({ ok: true, result: { doc: prefetched } });
            return;
          }

          const cached = await getOfflineCache(cacheKey);
          if (cached && cached._siteIndexId === siteIndex.id) {
            logger.info("Offline cache hit - validated via entrypoint", {
              cacheKey,
              siteIndexId: siteIndex.id.slice(0, 8),
            });
            // Update prefetch cache with validated content
            prefetchCache.set(cacheKey, cached, CONFIG.PREFETCH_TTL);
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
          prefetchCache.set(cacheKey, doc, CONFIG.PREFETCH_TTL);
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
        globalRateLimit.clear();

        logger.info("✅ Cleared in-memory caches (DNS, prefetch, rate limits)");

        // Clear Cache API (offline cache)
        const clearedCount = await clearOfflineCache();
        logger.info(`✅ Cleared ${clearedCount} offline cache(s)`);

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

/**
 * Debug/Admin Functions (exposed globally for console access)
 * Clear all extension caches
 * @returns {Promise<string>} Success message
 */
globalThis.clearAllCaches = async function () {
  logger.info("🗑️ Clearing all caches...");

  // Clear in-memory caches
  dnsCache.clear();
  prefetchCache.clear();
  dnsRateLimit.clear();
  globalRateLimit.clear();

  logger.info("✅ Cleared in-memory caches (DNS, prefetch, rate limits)");

  // Clear Cache API (offline cache)
  const clearedCount = await clearOfflineCache();
  logger.info(`✅ Cleared ${clearedCount} offline cache(s)`);

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

/**
 * Show cache statistics in console
 * @returns {string} Instructions message
 */
globalThis.showCacheStats = function () {
  console.log("📊 Cache Statistics:");
  console.log("  DNS Cache:", dnsCache.getStats());
  console.log("  Prefetch Cache:", prefetchCache.getStats());
  console.log("  DNS Rate Limiter:", dnsRateLimit.getStats());
  console.log("  Global Rate Limiter:", globalRateLimit.getStats());
  console.log("\nDNS Cache entries:");
  for (const key of dnsCache.keys()) {
    console.log(`  - ${key}:`, dnsCache.get(key));
  }
  return "Check console for details";
};

// Log helper message on service worker start
logger.info("🔧 Debug commands available:");
logger.info("  clearAllCaches() - Clear all extension caches");
logger.info("  showCacheStats() - Show cache statistics");
