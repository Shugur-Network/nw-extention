// Firefox-compatible background script
// Merges functionality from sw.js + offscreen.js
// Uses browser API with chrome fallback for compatibility

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Import shared modules
import { swLogger as logger } from "./shared/logger.js";

// ===== CONFIGURATION =====
const CONFIG = {
  // Cache TTL
  TTL_IMM: 7 * 24 * 3600 * 1000, // 7 days (immutable assets)
  TTL_REP: 30 * 1000, // 30 seconds (page manifests)
  DNS_CACHE_TTL: 5 * 60 * 1000, // 5 minutes

  // WebSocket settings
  WS_RECONNECT_DELAY: 1500,
  WS_QUERY_TIMEOUT: 6000,
  WS_EOSE_WAIT_TIME: 200,
  MAX_RELAYS: 10,

  // Security
  MAX_CONTENT_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_CACHE_SIZE: 500,

  // Rate limiting
  DNS_RATE_LIMIT_MAX: 10,
  GLOBAL_RATE_LIMIT_MAX: 50,

  // Timeouts/Retry
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000,
  RETRY_BACKOFF: 2,

  // Default
  DEFAULT_SITE: "nweb.shugur.com",
};

// ===== CACHE LAYER =====
const cache = new Map();
const dnsCache = new Map();
const prefetchCache = new Map();

function cget(k) {
  const x = cache.get(k);
  if (!x || Date.now() > x.exp) {
    cache.delete(k);
    return null;
  }
  x.lastAccess = Date.now();
  return x.val;
}

function cset(k, v, ttlMs) {
  if (cache.size >= CONFIG.MAX_CACHE_SIZE) {
    let oldest = null,
      oldestTime = Infinity;
    for (const [key, entry] of cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldest = key;
      }
    }
    if (oldest) cache.delete(oldest);
  }
  cache.set(k, { val: v, exp: Date.now() + ttlMs, lastAccess: Date.now() });
}

// ===== UTILITY FUNCTIONS =====
async function withRetry(fn, operation = "operation") {
  let lastError;
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const isTransient =
        e.message?.includes("timeout") ||
        e.message?.includes("network") ||
        e.message?.includes("connection") ||
        e.message?.includes("ECONNRESET");
      if (!isTransient || attempt === CONFIG.MAX_RETRIES) throw e;

      const delay =
        CONFIG.RETRY_DELAY * Math.pow(CONFIG.RETRY_BACKOFF, attempt);
      logger.warn(`${operation} failed, retrying`, {
        attempt: attempt + 1,
        delayMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function normalizePubkey(pk) {
  if (!pk) return null;
  if (/^[0-9a-f]{64}$/i.test(pk)) return pk.toLowerCase();

  // npub decoding (bech32)
  if (pk.startsWith("npub1")) {
    try {
      const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
      const data = pk.slice(5); // Remove 'npub1' prefix

      // Decode bech32
      const values = [];
      for (let i = 0; i < data.length; i++) {
        const c = data.charAt(i);
        const d = CHARSET.indexOf(c);
        if (d === -1) throw new Error("Invalid bech32 character");
        values.push(d);
      }

      // Convert from 5-bit to 8-bit
      let bits = 0;
      let value = 0;
      const result = [];
      for (let i = 0; i < values.length - 6; i++) {
        // Skip 6-char checksum
        value = (value << 5) | values[i];
        bits += 5;
        while (bits >= 8) {
          bits -= 8;
          result.push((value >> bits) & 0xff);
          value &= (1 << bits) - 1;
        }
      }

      // Convert bytes to hex
      const hex = result.map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex.length === 64) {
        return hex.toLowerCase();
      }
      throw new Error("Invalid npub length");
    } catch (e) {
      logger.warn("Failed to decode npub", { error: e.message });
      throw new Error(`Invalid npub format: ${e.message}`);
    }
  }

  throw new Error("Pubkey must be 64-char hex or npub1... format");
}

function getTag(ev, name) {
  for (const t of ev.tags || []) if (t[0] === name) return t.slice(1);
  return null;
}

// ===== DNS LOOKUP =====
async function dohTxt(host) {
  const ck = "txt:" + host;

  try {
    return await withRetry(async () => {
      const eps = [
        `https://dns.google/resolve?name=_nweb.${encodeURIComponent(
          host
        )}&type=TXT`,
        `https://cloudflare-dns.com/dns-query?name=_nweb.${encodeURIComponent(
          host
        )}&type=TXT`,
      ];

      for (const url of eps) {
        try {
          const res = await fetch(url, {
            headers: { accept: "application/dns-json" },
          });
          if (!res.ok) continue;

          const j = await res.json();
          for (const a of j.Answer || []) {
            if (a.type === 16 && typeof a.data === "string") {
              const txt = a.data.replace(/^"|"$/g, "").replace(/\\"/g, '"');
              const obj = JSON.parse(txt);
              cset(ck, obj, 365 * 24 * 3600 * 1000); // Cache for 1 year
              return obj;
            }
          }
        } catch (e) {
          continue;
        }
      }
      throw new Error("No valid DNS TXT record found");
    }, "DNS lookup");
  } catch (e) {
    const cached = cget(ck);
    if (cached) {
      logger.info("Using cached DNS (offline fallback)", { host });
      return cached;
    }
    throw e;
  }
}

// ===== WEBSOCKET RELAY POOL =====
const activeSockets = new Map();

function connectRelay(relayUrl) {
  if (activeSockets.has(relayUrl)) {
    return activeSockets.get(relayUrl);
  }

  const ws = new WebSocket(relayUrl);
  const state = {
    ws,
    ready: false,
    subscriptions: new Map(),
    messageQueue: [],
  };

  ws.onopen = () => {
    state.ready = true;
    logger.debug("Relay connected", { relay: relayUrl });
    while (state.messageQueue.length > 0) {
      ws.send(state.messageQueue.shift());
    }
  };

  ws.onmessage = (event) => {
    try {
      const [type, subId, ...rest] = JSON.parse(event.data);
      if (type === "EVENT" && state.subscriptions.has(subId)) {
        state.subscriptions.get(subId).onEvent(rest[0]);
      } else if (type === "EOSE" && state.subscriptions.has(subId)) {
        state.subscriptions.get(subId).onEOSE();
      }
    } catch (e) {
      logger.warn("Failed to parse relay message", { error: e.message });
    }
  };

  ws.onerror = () => logger.warn("Relay error", { relay: relayUrl });
  ws.onclose = () => {
    logger.debug("Relay disconnected", { relay: relayUrl });
    activeSockets.delete(relayUrl);
  };

  activeSockets.set(relayUrl, state);
  return state;
}

async function queryRelays(relayUrls, filter) {
  const subId = Math.random().toString(36).slice(2);
  const events = [];
  let eoseCount = 0;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(events);
    }, CONFIG.WS_QUERY_TIMEOUT);

    const cleanup = () => {
      clearTimeout(timeout);
      relayUrls.forEach((url) => {
        const state = activeSockets.get(url);
        if (state) {
          state.subscriptions.delete(subId);
          if (state.ready) state.ws.send(JSON.stringify(["CLOSE", subId]));
        }
      });
    };

    const subscription = {
      onEvent: (event) => events.push(event),
      onEOSE: () => {
        eoseCount++;
        if (eoseCount >= relayUrls.length) {
          setTimeout(() => {
            cleanup();
            resolve(events);
          }, CONFIG.WS_EOSE_WAIT_TIME);
        }
      },
    };

    relayUrls.forEach((url) => {
      try {
        const state = connectRelay(url);
        state.subscriptions.set(subId, subscription);
        const reqMsg = JSON.stringify(["REQ", subId, filter]);
        state.ready ? state.ws.send(reqMsg) : state.messageQueue.push(reqMsg);
      } catch (e) {
        logger.warn("Failed to connect to relay", { relay: url });
      }
    });
  });
}

// ===== NOSTR EVENT FETCHING =====
async function fetchSiteIndex(pk, relays) {
  const ck = `idx:${pk}`;
  // Never cache site index - always fetch fresh

  const filter = {
    kinds: [34236],
    authors: [pk],
    "#d": ["site-index"],
    limit: 1,
  };
  const events = await queryRelays(relays, filter);

  if (events.length === 0) throw new Error("Site index not found");
  events.sort((a, b) => b.created_at - a.created_at);
  return events[0];
}

async function fetchManifestForRoute(pk, relays, route, siteIndexId) {
  const ck = `manifest:${pk}:${route}`;
  const cached = cget(ck);

  // Check if cached manifest is still valid
  if (cached && cached._siteIndexId === siteIndexId) {
    logger.debug("Using cached manifest", { route });
    return cached;
  }

  const filter = { kinds: [34235], authors: [pk], "#d": [route], limit: 1 };
  const events = await queryRelays(relays, filter);

  if (events.length === 0)
    throw new Error(`Page manifest not found for route: ${route}`);
  events.sort((a, b) => b.created_at - a.created_at);

  const manifest = events[0];
  manifest._siteIndexId = siteIndexId;
  cset(ck, manifest, CONFIG.TTL_REP);
  return manifest;
}

async function fetchAssetsByIds(ids, relays) {
  if (ids.length === 0) return [];

  const needed = [];
  const results = [];

  // Check cache first
  for (const id of ids) {
    const cached = cget(`asset:${id}`);
    if (cached) {
      results.push(cached);
    } else {
      needed.push(id);
    }
  }

  if (needed.length > 0) {
    const filter = { kinds: [40000, 40001, 40002, 40003], ids: needed };
    const events = await queryRelays(relays, filter);

    // Cache assets (immutable, long TTL)
    for (const ev of events) {
      cset(`asset:${ev.id}`, ev, CONFIG.TTL_IMM);
      results.push(ev);
    }
  }

  return results;
}

// ===== MESSAGE HANDLING =====
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // Handle high-level commands (from viewer.js)
      if (msg?.cmd === "nw.load") {
        const { host, route } = msg;
        logger.info("Loading site", { host, route });

        try {
          // DNS bootstrap
          const dnsRecord = await dohTxt(host);
          if (!dnsRecord || !dnsRecord.pk) {
            throw new Error("No Nostr Web DNS record found");
          }

          const pk = normalizePubkey(dnsRecord.pk);
          const relays = dnsRecord.relays || [];

          // Fetch site index
          const siteIndex = await fetchSiteIndex(pk, relays);
          const siteIndexContent = JSON.parse(siteIndex.content || "{}");

          // Fetch manifest for route
          const actualRoute = route || "/";
          const manifest = await fetchManifestForRoute(
            pk,
            relays,
            actualRoute,
            siteIndex.id
          );
          const manifestContent = JSON.parse(manifest.content || "{}");

          // Extract asset IDs from manifest
          const assetIds = [];
          for (const tag of manifest.tags || []) {
            if (tag[0] === "e" && ["html", "css", "js"].includes(tag[2])) {
              assetIds.push(tag[1]);
            }
          }

          // Fetch assets
          const assets = await fetchAssetsByIds(assetIds, relays);

          // Organize assets by type
          const doc = {
            html: "",
            css: [],
            js: [],
            title: manifestContent.title || host,
            csp: manifestContent.csp || {},
          };

          for (const asset of assets) {
            const marker = manifest.tags.find(
              (t) => t[0] === "e" && t[1] === asset.id
            )?.[2];
            if (marker === "html") {
              doc.html = asset.content;
            } else if (marker === "css") {
              doc.css.push(asset.content);
            } else if (marker === "js") {
              doc.js.push(asset.content);
            }
          }

          logger.info("Site loaded successfully", { host, route });
          sendResponse({ ok: true, result: { doc } });
        } catch (e) {
          logger.error("Failed to load site", { error: e.message });
          sendResponse({ ok: false, error: e.message });
        }
        return;
      }

      // Handle low-level RPC methods (legacy/direct calls)
      const { method, params } = msg;

      if (method === "lookupDNS") {
        const result = await dohTxt(params.host);
        sendResponse({ result });
      } else if (method === "fetchSiteIndex") {
        const result = await fetchSiteIndex(params.pk, params.relays);
        sendResponse({ result });
      } else if (method === "fetchManifestForRoute") {
        const result = await fetchManifestForRoute(
          params.pk,
          params.relays,
          params.route,
          params.siteIndexId
        );
        sendResponse({ result });
      } else if (method === "fetchAssetsByIds") {
        const result = await fetchAssetsByIds(params.ids, params.relays);
        sendResponse({ result });
      } else if (method === "clearCache") {
        cache.clear();
        dnsCache.clear();
        prefetchCache.clear();
        sendResponse({ result: "Cache cleared" });
      } else {
        sendResponse({ error: "Unknown method: " + method });
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();

  return true; // Keep channel open for async response
});

// ===== NAVIGATION INTERCEPTION =====
browserAPI.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;

  try {
    const url = new URL(details.url);
    const host = url.hostname;

    // Skip if already in viewer
    if (details.url.includes(browserAPI.runtime.getURL("viewer.html"))) return;

    // Check for Nostr Web DNS record
    const dnsRecord = await dohTxt(host);

    if (dnsRecord && dnsRecord.pk) {
      logger.info("Nostr Web site detected", { host });
      // Pass the full domain (including path) as the url parameter
      const fullUrl =
        host + (url.pathname || "/") + (url.search || "") + (url.hash || "");
      const viewerUrl = browserAPI.runtime.getURL(
        `viewer.html?url=${encodeURIComponent(fullUrl)}`
      );
      await browserAPI.tabs.update(details.tabId, { url: viewerUrl });
    }
  } catch (e) {
    // No Nostr Web record, proceed normally
  }
});

// ===== INITIALIZATION =====
browserAPI.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    logger.info("Nostr Web extension installed (Firefox)", {
      defaultSite: CONFIG.DEFAULT_SITE,
    });
    browserAPI.storage.local.set({ nweb_default_site: CONFIG.DEFAULT_SITE });
  } else if (details.reason === "update") {
    logger.info("Nostr Web extension updated (Firefox)", {
      version: browserAPI.runtime.getManifest().version,
    });
  }
});

// Ensure default site is set
browserAPI.storage.local.get(["nweb_default_site"]).then((result) => {
  if (!result.nweb_default_site) {
    browserAPI.storage.local.set({ nweb_default_site: CONFIG.DEFAULT_SITE });
  }
});

logger.info("Nostr Web background script loaded (Firefox)");
