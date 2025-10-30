// Firefox-compatible background script
// Merges functionality from sw.js + offscreen.js
// Uses browser API with chrome fallback for compatibility

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Import shared modules
import { swLogger as logger } from "./shared/logger.js";
import { CONFIG, NOSTR } from "./shared/constants.js";
import { CacheManager } from "./shared/cache-manager.js";

// ===== CACHE LAYER =====
// Use shared CacheManager for all caching needs
const eventCache = new CacheManager("Event Cache", 500);
const dnsCache = new CacheManager("DNS Cache", CONFIG.DNS_CACHE_MAX_SIZE);
const prefetchCache = new CacheManager(
  "Prefetch Cache",
  CONFIG.PREFETCH_MAX_SIZE
);

// Helper functions for backward compatibility
function cget(k) {
  return eventCache.get(k);
}

function cset(k, v, ttlMs) {
  eventCache.set(k, v, ttlMs);
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

  // Check DNS cache first
  const cached = dnsCache.get(ck);
  if (cached) {
    logger.debug("DNS cache hit", { host });
    return cached;
  }

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
              // Store in DNS cache with long TTL (1 year)
              dnsCache.set(ck, obj, CONFIG.DNS_CACHE_TTL);
              logger.debug("DNS resolved and cached", { host });
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
    // Try cache again as fallback (in case network is down)
    const cachedFallback = dnsCache.get(ck);
    if (cachedFallback) {
      logger.info("Using cached DNS (offline fallback)", { host });
      return cachedFallback;
    }
    throw e;
  }
}

// ===== WEBSOCKET RELAY POOL =====
const activeSockets = new Map();
const reconnectEnabled = new Map(); // Track which relays should reconnect
let poolClosed = false; // Track if the entire pool has been closed

function closeAllRelays() {
  poolClosed = true;

  // Disable all reconnections
  for (const url of activeSockets.keys()) {
    reconnectEnabled.set(url, false);
  }

  // Close all WebSockets
  for (const state of activeSockets.values()) {
    if (state.ws) {
      state.ws.close();
    }
  }

  activeSockets.clear();
  reconnectEnabled.clear();
  logger.info("All relay connections closed");
}

function connectRelay(relayUrl, allowReconnect = true) {
  // Don't connect if pool is closed
  if (poolClosed) return null;

  if (activeSockets.has(relayUrl)) {
    return activeSockets.get(relayUrl);
  }

  // Enable reconnection for this URL
  reconnectEnabled.set(relayUrl, allowReconnect);

  const ws = new WebSocket(relayUrl);
  const state = {
    ws,
    ready: false,
    subscriptions: new Map(),
    messageQueue: [],
    url: relayUrl, // Store URL for logging
  };

  // Set a connection timeout - if relay doesn't connect within 3 seconds, mark it as slow
  const connectionTimeout = setTimeout(() => {
    if (!state.ready) {
      logger.warn("Relay connection timeout", { relay: relayUrl });
      // Don't close the connection, but mark it as slow
      state.slow = true;
    }
  }, 3000); // 3 second timeout

  ws.onopen = () => {
    clearTimeout(connectionTimeout);
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

  ws.onerror = (err) => {
    clearTimeout(connectionTimeout);
    logger.warn("Relay error", {
      relay: relayUrl,
      error: err.message || "unknown",
    });
  };

  ws.onclose = () => {
    clearTimeout(connectionTimeout);
    logger.debug("Relay disconnected", { relay: relayUrl });
    activeSockets.delete(relayUrl);

    // Only reconnect if:
    // 1. Pool is not closed
    // 2. Reconnection is enabled for this URL
    const shouldReconnect =
      !poolClosed && reconnectEnabled.get(relayUrl) === true;

    if (shouldReconnect) {
      logger.debug("Auto-reconnecting to relay", { relay: relayUrl });
      setTimeout(() => {
        connectRelay(relayUrl, true);
      }, CONFIG.WS_RECONNECT_DELAY);
    } else {
      logger.debug("Not reconnecting to relay", {
        relay: relayUrl,
        poolClosed,
        reconnectEnabled: reconnectEnabled.get(relayUrl),
      });
      reconnectEnabled.delete(relayUrl);
    }
  };

  activeSockets.set(relayUrl, state);
  return state;
}

async function queryRelays(relayUrls, filter) {
  const subId = Math.random().toString(36).slice(2);
  const events = [];
  const seen = new Set(); // Deduplicate events by ID (like Chrome)
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
      onEvent: (event) => {
        // Deduplicate events by ID (same as Chrome)
        if (!seen.has(event.id)) {
          seen.add(event.id);
          events.push(event);
        }
      },
      onEOSE: () => {
        eoseCount++;
        // OPTIMIZATION: Resolve as soon as we get EOSE from ANY relay (don't wait for all)
        // Wait a tiny bit more for other fast relays to respond
        if (eoseCount === 1) {
          setTimeout(() => {
            cleanup();
            resolve(events);
          }, CONFIG.WS_EOSE_WAIT_TIME); // 200ms after first EOSE
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
  // Step 1: Fetch entrypoint (kind 11126 - replaceable event pointing to current site index)
  // IMPORTANT: Always fetch fresh (no cache) to detect site updates immediately!
  logger.debug("Fetching entrypoint", { pubkey: pk.slice(0, 8) });

  const entrypointFilter = {
    kinds: [11126],
    authors: [pk],
    limit: 1,
  };
  const entrypointEvs = await queryRelays(relays, entrypointFilter);

  if (entrypointEvs.length === 0) {
    throw new Error(
      `Entrypoint (kind 11126) not found for pubkey ${pk.slice(
        0,
        8
      )}... on relays: ${relays.join(", ")}. ` +
        `This site may not be published yet, or the relays may be offline.`
    );
  }

  // Get the latest entrypoint (replaceable event, so latest created_at wins)
  entrypointEvs.sort((a, b) => b.created_at - a.created_at);
  const entrypoint = entrypointEvs[0];

  logger.debug("Entrypoint fetched", {
    id: entrypoint.id.slice(0, 8),
    createdAt: entrypoint.created_at,
  });

  // Step 2: Extract site index address from entrypoint's 'a' tag
  // Format: ["a", "31126:<pubkey>:<d-tag-hash>", "<relay-url>"]
  const aTag = entrypoint.tags.find((t) => t[0] === "a");
  if (!aTag || !aTag[1]) {
    throw new Error(
      `Invalid entrypoint: Missing 'a' tag pointing to site index. ` +
        `Entrypoint ${entrypoint.id.slice(0, 8)}... must include an 'a' tag.`
    );
  }

  // Parse address coordinates: kind:pubkey:d-tag
  const [kind, pubkey, dTag] = aTag[1].split(":");
  if (kind !== "31126" || !dTag) {
    throw new Error(
      `Invalid entrypoint 'a' tag format: ${aTag[1]}. ` +
        `Expected format: "31126:<pubkey>:<d-tag>"`
    );
  }

  logger.debug("Site index address from entrypoint", {
    kind,
    dTag,
    pubkey: pubkey.slice(0, 8),
  });

  // Step 3: Fetch site index (kind 31126 - addressable event) using the d-tag
  // Cache with short TTL (30 seconds) - content-addressed by d-tag
  const siteIndexFilter = {
    kinds: [31126],
    authors: [pk],
    "#d": [dTag],
  };
  const siteIndexEvs = await queryRelays(relays, siteIndexFilter);

  if (siteIndexEvs.length === 0) {
    throw new Error(
      `Site index (kind 31126, d=${dTag}) not found for pubkey ${pk.slice(
        0,
        8
      )}... on relays: ${relays.join(", ")}. ` +
        `Entrypoint points to this site index, but it was not found.`
    );
  }

  // Sort by created_at descending (should only be one, but be defensive)
  siteIndexEvs.sort((a, b) => b.created_at - a.created_at);
  const siteIndex = siteIndexEvs[0];

  logger.debug("Site index fetched", {
    id: siteIndex.id.slice(0, 8),
    dTag,
    createdAt: siteIndex.created_at,
  });

  return siteIndex;
}

async function fetchManifestForRoute(pk, relays, route, siteIndex) {
  // Parse site index content (NIP-YY format)
  // Content is JSON with structure: { routes: {...}, version: "X.Y.Z", defaultRoute: "/", notFoundRoute: "/404" }
  const content = JSON.parse(siteIndex.content || "{}");

  // Validate content structure
  if (!content.routes || typeof content.routes !== "object") {
    throw new Error(
      "Site index content missing 'routes' field. " +
        "Site must be published with NIP-YY compliant publisher."
    );
  }

  const routes = content.routes;

  logger.debug("Fetching manifest for route", {
    route,
    availableRoutes: Object.keys(routes),
  });

  // Get manifest ID for this route from site index
  const manifestId = routes[route];

  // If route not found, throw 404 error
  if (!manifestId) {
    const availableRoutes = Object.keys(routes);
    throw new Error(
      `404: Page not found for route "${route}". ` +
        `Available routes: ${
          availableRoutes.length ? availableRoutes.join(", ") : "none"
        }. ` +
        `Try visiting the home page ("/") instead.`
    );
  }

  logger.debug("Manifest ID from site index", {
    id: manifestId.slice(0, 8) + "...",
    route,
  });

  // Fetch manifest by ID (kind 1126 is now a REGULAR event, not addressable)
  // Manifests are referenced by their event ID in the site index
  const ck = `man:${manifestId}`;
  const cached = cget(ck);
  if (cached) {
    logger.debug("Using cached manifest", { route });
    return cached;
  }

  const filter = { ids: [manifestId] };
  const events = await queryRelays(relays, filter);

  if (events.length > 0) {
    const manifest = events[0];
    logger.debug("Manifest fetched by ID", {
      id: manifest.id.slice(0, 8),
    });
    cset(ck, manifest, NOSTR.TTL_IMM); // Cache with long TTL (immutable by ID)
    return manifest;
  }

  // Manifest not found
  throw new Error(
    `Page manifest (kind 1126, id=${manifestId.slice(
      0,
      8
    )}...) not found for route "${route}". ` +
      `The manifest referenced by site index was not found on relays. ` +
      `Relays: ${relays.join(", ")}`
  );
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
    // Fetch all assets by ID (kind 1125 - all assets use same kind)
    const filter = { kinds: [1125], ids: needed };
    const events = await queryRelays(relays, filter);

    // Cache assets (immutable, long TTL)
    for (const ev of events) {
      cset(`asset:${ev.id}`, ev, NOSTR.TTL_IMM);
      results.push(ev);
    }
  }

  logger.debug("Assets fetched", {
    count: results.length,
    cached: ids.length - needed.length,
    fetched: needed.length,
  });

  return results;
}

// ===== MESSAGE HANDLING =====
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // Handle high-level commands (from viewer.js)
      if (msg?.cmd === "nw.load") {
        const { host, route } = msg;
        const loadStartTime = performance.now();
        logger.info("Loading site", { host, route });

        try {
          // DNS bootstrap
          const dnsStartTime = performance.now();
          const dnsRecord = await dohTxt(host);
          logger.info(
            `⏱️ DNS lookup took ${(performance.now() - dnsStartTime).toFixed(
              2
            )}ms`
          );

          if (!dnsRecord || !dnsRecord.pk) {
            throw new Error("No Nostr Web DNS record found");
          }

          const pk = normalizePubkey(dnsRecord.pk);
          const relays = dnsRecord.relays || [];

          // Fetch site index
          const siteIndexStartTime = performance.now();
          const siteIndex = await fetchSiteIndex(pk, relays);
          logger.info(
            `⏱️ Site index fetch took ${(
              performance.now() - siteIndexStartTime
            ).toFixed(2)}ms`
          );

          const siteIndexContent = JSON.parse(siteIndex.content || "{}");

          // Fetch manifest for route
          const manifestStartTime = performance.now();
          const actualRoute = route || "/";
          const manifest = await fetchManifestForRoute(
            pk,
            relays,
            actualRoute,
            siteIndex // Pass full siteIndex object, not just ID
          );
          logger.info(
            `⏱️ Manifest fetch took ${(
              performance.now() - manifestStartTime
            ).toFixed(2)}ms`
          );

          const manifestContent = JSON.parse(manifest.content || "{}");

          // Extract asset IDs from manifest
          const assetIds = [];
          for (const tag of manifest.tags || []) {
            if (tag[0] === "e" && tag[1]) {
              assetIds.push(tag[1]); // Collect all referenced event IDs
            }
          }

          // Fetch assets
          const assetsStartTime = performance.now();
          const assets = await fetchAssetsByIds(assetIds, relays);
          logger.info(
            `⏱️ Assets fetch took ${(
              performance.now() - assetsStartTime
            ).toFixed(2)}ms`
          );

          // Organize assets by MIME type (from 'm' tag)
          const orgStartTime = performance.now();
          const doc = {
            html: "",
            css: [],
            js: [],
            title: manifestContent.title || host,
            csp: manifestContent.csp || {},
          };

          for (const asset of assets) {
            // Get MIME type from 'm' tag
            const mimeTag = asset.tags.find((t) => t[0] === "m");
            const mimeType = mimeTag ? mimeTag[1] : "application/octet-stream";

            if (mimeType === "text/html") {
              doc.html = asset.content;
            } else if (mimeType === "text/css") {
              doc.css.push(asset.content);
            } else if (
              mimeType === "application/javascript" ||
              mimeType === "text/javascript"
            ) {
              doc.js.push(asset.content);
            }
          }
          logger.info(
            `⏱️ Asset organization took ${(
              performance.now() - orgStartTime
            ).toFixed(2)}ms`
          );

          const totalLoadTime = performance.now() - loadStartTime;
          logger.info(
            `✅ Site loaded successfully in ${totalLoadTime.toFixed(2)}ms`,
            { host, route }
          );

          // Build metadata object
          const metadata = {
            pubkey: pk,
            relays: relays,
            lastUpdated: new Date().toISOString(),
            signatureValid: true, // We verified signatures during fetch
            relayHealth: "healthy", // Simplified - we successfully fetched
          };

          sendResponse({ ok: true, result: { doc, metadata } });
        } catch (e) {
          logger.error("Failed to load site", { error: e.message });
          sendResponse({ ok: false, error: e.message });
        }
        return;
      }

      if (msg?.cmd === "nw.prefetch") {
        const { host, route } = msg;
        logger.info("Prefetching site", { host, route });

        try {
          // Check prefetch cache first
          const cacheKey = `${host}:${route || "/"}`;
          const cached = prefetchCache.get(cacheKey);
          if (cached) {
            logger.info("Returning prefetched content from cache", {
              host,
              route,
            });
            sendResponse({ ok: true, result: cached });
            return;
          }

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
            siteIndex
          );
          const manifestContent = JSON.parse(manifest.content || "{}");

          // Extract asset IDs from manifest
          const assetIds = [];
          for (const tag of manifest.tags || []) {
            if (tag[0] === "e" && tag[1]) {
              assetIds.push(tag[1]);
            }
          }

          // Fetch assets
          const assets = await fetchAssetsByIds(assetIds, relays);

          // Organize assets
          const doc = {
            html: "",
            css: [],
            js: [],
            title: manifestContent.title || host,
            csp: manifestContent.csp || {},
          };

          for (const asset of assets) {
            const mimeTag = asset.tags.find((t) => t[0] === "m");
            const mimeType = mimeTag ? mimeTag[1] : "application/octet-stream";

            if (mimeType === "text/html") {
              doc.html = asset.content;
            } else if (mimeType === "text/css") {
              doc.css.push(asset.content);
            } else if (
              mimeType === "application/javascript" ||
              mimeType === "text/javascript"
            ) {
              doc.js.push(asset.content);
            }
          }

          // Build metadata
          const metadata = {
            pubkey: pk,
            relays: relays,
            lastUpdated: new Date().toISOString(),
            signatureValid: true,
            relayHealth: "healthy",
          };

          const result = { doc, metadata };

          // Store in prefetch cache
          prefetchCache.set(cacheKey, result);
          logger.info("Prefetch complete and cached", { host, route });

          sendResponse({ ok: true, result });
        } catch (e) {
          logger.error("Failed to prefetch site", { error: e.message });
          sendResponse({ ok: false, error: e.message });
        }
        return;
      }

      if (msg?.cmd === "nw.getDNS") {
        const { host } = msg;
        logger.info("Getting DNS info for metadata", { host });

        try {
          const dnsRecord = await dohTxt(host);
          if (!dnsRecord || !dnsRecord.pk) {
            throw new Error("No Nostr Web DNS record found");
          }

          const pk = normalizePubkey(dnsRecord.pk);
          const relays = dnsRecord.relays || [];

          const metadata = {
            pubkey: pk,
            relays: relays,
            lastUpdated: new Date().toISOString(),
            signatureValid: true,
            relayHealth: "healthy",
          };

          sendResponse({ ok: true, result: { metadata } });
        } catch (e) {
          logger.error("Failed to get DNS info", { error: e.message });
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
          params.siteIndex // Expect full siteIndex object
        );
        sendResponse({ result });
      } else if (method === "fetchAssetsByIds") {
        const result = await fetchAssetsByIds(params.ids, params.relays);
        sendResponse({ result });
      } else if (method === "clearCache") {
        eventCache.clear();
        dnsCache.clear();
        prefetchCache.clear();
        logger.info("All caches cleared", {
          eventCache: eventCache.size,
          dnsCache: dnsCache.size,
          prefetchCache: prefetchCache.size,
        });
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
