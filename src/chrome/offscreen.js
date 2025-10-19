// Enterprise-grade logging
import { offscreenLogger as logger } from "./shared/logger.js";

// Configuration constants
const CONFIG = {
  // Cache TTL settings
  TTL_IMM: 7 * 24 * 3600 * 1000, // 7 days (immutable)
  TTL_REP: 30 * 1000, // 30 seconds (site index - validated against entrypoint)
  // NOTE: Entrypoint (11126) is ALWAYS fetched fresh - never cached!

  // WebSocket settings
  WS_RECONNECT_DELAY: 1500, // 1.5 seconds
  WS_QUERY_TIMEOUT: 6000, // 6 seconds
  WS_EOSE_WAIT_TIME: 200, // 200ms after first EOSE

  // Relay connection settings
  MAX_RELAYS: 10, // Maximum number of relays to connect to

  // Security settings
  MAX_CONTENT_SIZE: 5 * 1024 * 1024, // 5MB max content size

  // Retry settings
  MAX_RETRIES: 2, // Max retry attempts for transient failures
  RETRY_DELAY: 1000, // Base delay between retries (ms)
  RETRY_BACKOFF: 2, // Exponential backoff multiplier
};

// ---- Retry utility for transient failures ----
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
        e.message?.includes("ECONNRESET") ||
        e.message?.includes("fetch failed");

      // Don't retry on non-transient errors
      if (!isTransient || attempt === CONFIG.MAX_RETRIES) {
        throw e;
      }

      // Exponential backoff
      const delay =
        CONFIG.RETRY_DELAY * Math.pow(CONFIG.RETRY_BACKOFF, attempt);
      logger.warn(`${operation} failed, retrying`, {
        attempt: attempt + 1,
        maxAttempts: CONFIG.MAX_RETRIES + 1,
        delayMs: delay,
        error: e.message,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ---- tiny TTL cache with LRU eviction ----
const cache = new Map(); // key -> { val, exp, lastAccess }
const MAX_CACHE_SIZE = 500; // Prevent memory leaks

function cget(k) {
  const x = cache.get(k);
  if (!x) return null;
  if (Date.now() > x.exp) {
    cache.delete(k);
    return null;
  }
  x.lastAccess = Date.now(); // Update access time
  return x.val;
}

function cset(k, v, ttlMs) {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldest = null;
    let oldestTime = Infinity;
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

// ---- helpers ----
// Simple bech32 decoder for npub (inline implementation to avoid build complexity)
function decodeBech32(str) {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const GENERATOR = [
    0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
  ];

  str = str.toLowerCase();
  const data = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charAt(i);
    const d = CHARSET.indexOf(c);
    if (d === -1) throw new Error("Invalid bech32 character");
    data.push(d);
  }

  // Convert from 5-bit to 8-bit
  let bits = 0;
  let value = 0;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    value = (value << 5) | data[i];
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((value >> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return result;
}

function normalizePubkey(pk) {
  if (!pk) return null;

  // Already hex format - just normalize case
  if (/^[0-9a-f]{64}$/i.test(pk)) return pk.toLowerCase();

  // Try to decode npub format (basic bech32 decode)
  if (pk.startsWith("npub1")) {
    try {
      // Extract the data part after 'npub1'
      const data = pk.slice(5, -6); // Remove 'npub1' prefix and 6-char checksum
      const decoded = decodeBech32(data);
      // Convert bytes to hex
      const hex = decoded.map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex.length === 64) {
        return hex.toLowerCase();
      }
      throw new Error("Invalid npub length");
    } catch (e) {
      logger.warn("Failed to decode npub", { error: e.message });
      throw new Error(
        `Invalid npub format: ${e.message}. Please use 64-character hex pubkey instead.`
      );
    }
  }

  throw new Error("Pubkey must be 64-char hex or npub1... format");
}

// ---- DoH ----
async function dohTxt(host) {
  const ck = "txt:" + host;

  // Try to fetch fresh DNS data first
  // NOTE: DNS contains only public key and relays (static info)
  // It does NOT contain site_index, so DNS never needs updating after initial setup
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

      let lastError;
      for (const url of eps) {
        try {
          const res = await fetch(url, {
            headers: { accept: "application/dns-json" },
          });

          if (!res.ok) {
            throw new Error(
              `DoH request failed: ${res.status} ${res.statusText}`
            );
          }

          const j = await res.json();
          for (const a of j.Answer || []) {
            if (a.type === 16 && typeof a.data === "string") {
              const txt = a.data.replace(/^"|"$/g, "").replace(/\"/g, '"');
              const obj = JSON.parse(txt);
              // Cache DNS record for offline fallback (24h TTL - allows relay updates)
              cset(ck, obj, 24 * 3600 * 1000); // 24 hours TTL
              return obj;
            }
          }
        } catch (e) {
          lastError = e;
          // Try next endpoint
          continue;
        }
      }

      throw (
        lastError || new Error(`No valid _nweb TXT record found for ${host}`)
      );
    }, `DNS lookup for ${host}`);
  } catch (fetchError) {
    // Only use cached DNS record if fetch failed (offline mode)
    const cached = cget(ck);
    if (cached) {
      logger.info("Using cached DNS record", { host, mode: "offline" });
      return cached;
    }
    // No cache available, throw original error
    throw fetchError;
  }
}

// ---- Relay pool ----
class Pool {
  constructor(urls) {
    this.urls = urls || [];
    this.sockets = new Map();
    this.listeners = new Map();
    this.next = 0;
    this.lastActivity = new Map(); // Track activity per relay
    this.cleanupTimer = null;
    this.startCleanupTimer();
  }

  startCleanupTimer() {
    // Clean up idle connections every 5 minutes
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [url, lastTime] of this.lastActivity.entries()) {
        if (now - lastTime > 5 * 60 * 1000) {
          // 5 min idle
          this.closeRelay(url);
        }
      }
    }, 60 * 1000); // Check every minute
  }

  closeRelay(url) {
    const ws = this.sockets.get(url);
    if (ws) {
      ws.close();
      this.sockets.delete(url);
      this.lastActivity.delete(url);
    }
  }

  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const ws of this.sockets.values()) {
      ws.close();
    }
    this.sockets.clear();
    this.listeners.clear();
    this.lastActivity.clear();
  }

  connectAll() {
    for (const u of this.urls) this.connect(u);
  }
  connect(url) {
    const ws = new WebSocket(url);
    ws.onopen = () => {};
    ws.onclose = () =>
      setTimeout(() => this.connect(url), CONFIG.WS_RECONNECT_DELAY);
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const [t, sub, body] = msg;
      const h = this.listeners.get(sub);
      if (!h) return;
      if (t === "EVENT") h({ t, ev: body });
      else if (t === "EOSE") h({ t });
    };
    this.sockets.set(url, ws);
  }
  query(filters, ttlKey = null, ttlMs = TTL_REP) {
    if (ttlKey) {
      const hit = cget(ttlKey);
      if (hit) return Promise.resolve(hit);
    }
    const sub = "s" + ++this.next;
    const req = JSON.stringify(["REQ", sub, filters]);
    const results = [];
    const seen = new Set(); // Dedupe by event ID
    let eoseCount = 0;
    const totalSockets = this.sockets.size;

    // Update activity timestamp for all relays
    const now = Date.now();
    for (const url of this.urls) {
      this.lastActivity.set(url, now);
    }

    return new Promise((resolve) => {
      const handler = (m) => {
        if (m.t === "EVENT") {
          // Deduplicate events by ID
          if (!seen.has(m.ev.id)) {
            seen.add(m.ev.id);
            results.push(m.ev);
          }
        }
        if (m.t === "EOSE") {
          eoseCount++;
          // Resolve as soon as we get EOSE from ANY relay (don't wait for all)
          // But wait a tiny bit more for other fast relays
          if (eoseCount === 1) {
            setTimeout(() => {
              this.listeners.delete(sub);
              // Sort by created_at DESC to get latest
              results.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
              if (ttlKey) cset(ttlKey, results, ttlMs);
              resolve(results);
            }, CONFIG.WS_EOSE_WAIT_TIME); // Wait configured time after first EOSE for other fast relays
          }
        }
      };

      this.listeners.set(sub, handler);

      // Send to all ready sockets immediately, queue for connecting ones
      for (const ws of this.sockets.values()) {
        if (ws.readyState === 1) {
          ws.send(req);
        } else {
          ws.addEventListener("open", () => ws.send(req), { once: true });
        }
      }

      // Timeout: resolve with what we have after configured timeout
      setTimeout(() => {
        this.listeners.delete(sub);
        results.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        if (ttlKey) cset(ttlKey, results, ttlMs);
        resolve(results);
      }, CONFIG.WS_QUERY_TIMEOUT);
    });
  }
}

let pool = null,
  poolKey = "";
function ensurePool(relays) {
  const key = (relays || []).slice().sort().join(",");
  if (pool && poolKey === key) return pool;

  // Close old pool if relays changed
  if (pool) pool.close();

  pool = new Pool(relays);
  poolKey = key;

  // Start connecting immediately (parallel connection establishment)
  pool.connectAll();

  return pool;
}

// ---- SRI ----
async function sha256hexText(txt) {
  const buf = new TextEncoder().encode(txt);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- nw ops ----
async function dnsBootstrap({ host }) {
  const boot = await dohTxt(host);
  if (!boot?.pk || !Array.isArray(boot.relays) || !boot.relays.length)
    throw new Error("_nweb TXT must include pk and relays");
  // Normalize pk to hex
  boot.pk = normalizePubkey(boot.pk);
  if (!boot.pk) throw new Error("Invalid pk in DNS (must be hex or npub)");

  // NOTE: DNS no longer contains site_index event ID
  // Extension always queries relays by pubkey for latest site index
  // This allows publishers to update content without touching DNS

  return boot;
}

async function fetchSiteIndex({ boot }) {
  const p = ensurePool(boot.relays);

  // Step 1: Fetch entrypoint (kind 11126 - replaceable event pointing to current site index)
  // IMPORTANT: Always fetch fresh (no cache) to detect site updates immediately!
  logger.debug("Fetching entrypoint", { pubkey: boot.pk.slice(0, 8) });

  const entrypointEvs = await p.query(
    { kinds: [11126], authors: [boot.pk], limit: 1 },
    null, // No cache key
    0 // TTL=0 - always fetch fresh!
  );

  if (!entrypointEvs.length) {
    throw new Error(
      `Entrypoint (kind 11126) not found for pubkey ${boot.pk.slice(
        0,
        8
      )}... on relays: ${boot.relays.join(", ")}. ` +
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
  const siteIndexEvs = await p.query(
    { kinds: [31126], authors: [boot.pk], "#d": [dTag] },
    `idx:${boot.pk}:${dTag}`,
    CONFIG.TTL_REP // 30 second cache
  );

  if (!siteIndexEvs.length) {
    throw new Error(
      `Site index (kind 31126, d=${dTag}) not found for pubkey ${boot.pk.slice(
        0,
        8
      )}... on relays: ${boot.relays.join(", ")}. ` +
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

function routesFromIndex(idx) {
  // Parse site index content (NIP-YY format)
  // Content is JSON with structure: { routes: {...}, version: "X.Y.Z", defaultRoute: "/", notFoundRoute: "/404" }
  const content = JSON.parse(idx.content || "{}");

  // Validate content structure
  if (!content.routes || typeof content.routes !== "object") {
    throw new Error(
      "Site index content missing 'routes' field. " +
        "Site must be published with NIP-YY compliant publisher."
    );
  }

  logger.debug("Site index content parsed", {
    routeCount: Object.keys(content.routes).length,
    version: content.version || "unknown",
    defaultRoute: content.defaultRoute || "/",
    notFoundRoute: content.notFoundRoute || null,
  });

  // Return routes object directly (maps route paths to manifest event IDs)
  return content.routes;
}

async function fetchManifestForRoute({ boot, siteIndex, route }) {
  const p = ensurePool(boot.relays);
  const routes = routesFromIndex(siteIndex);

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
  const manifestEvs = await p.query(
    { ids: [manifestId] },
    "man:" + manifestId,
    CONFIG.TTL_IMM // Cache with long TTL (immutable by ID)
  );

  if (manifestEvs.length > 0) {
    logger.debug("Manifest fetched by ID", {
      id: manifestEvs[0].id.slice(0, 8),
    });
    return manifestEvs[0];
  }

  // Manifest not found
  throw new Error(
    `Page manifest (kind 1126, id=${manifestId.slice(
      0,
      8
    )}...) not found for route "${route}". ` +
      `The manifest referenced by site index was not found on relays. ` +
      `Relays: ${boot.relays.join(", ")}`
  );
}

function extractIds(manifest) {
  // Per NIP-YY: Page manifests now use 'e' tags with relay hints for all assets
  // Format: ["e", "<event-id>", "<relay-url>"]
  // Assets are identified by their event ID; MIME type is in the asset's 'm' tag

  const ids = [];

  for (const t of manifest.tags || []) {
    if (t[0] === "e" && t[1]) {
      ids.push(t[1]); // Collect all referenced event IDs
    }
  }

  logger.debug("Asset IDs extracted from manifest", {
    count: ids.length,
    ids: ids.map((id) => id.slice(0, 8) + "..."),
  });

  return ids;
}

async function fetchAssets({ boot, manifest, siteIndexId }) {
  const p = ensurePool(boot.relays);
  const assetIds = extractIds(manifest);

  // DEBUG: Log what we're fetching
  logger.debug("Fetching assets", {
    assetCount: assetIds.length,
    siteIndexId: siteIndexId ? siteIndexId.slice(0, 8) : "NONE",
  });

  // Validate we have at least one asset
  if (assetIds.length === 0) {
    throw new Error(
      `Invalid manifest: No asset references found. ` +
        `Manifest must include at least one ["e", "<id>", "<relay>"] tag.`
    );
  }

  // Cache key includes site index ID for automatic invalidation on site updates
  const cacheKey = siteIndexId
    ? `site:${siteIndexId}:assets:${assetIds.join(",")}`
    : `assets:${assetIds.join(",")}`;

  // Fetch all assets by ID (kind 1125 - all assets use same kind)
  const events = await p.query({ ids: assetIds }, cacheKey, CONFIG.TTL_IMM);

  const byId = Object.fromEntries(events.map((e) => [e.id, e]));

  // Categorize assets by MIME type (from 'm' tag)
  const categorized = { html: null, css: [], js: [], other: [] };

  for (const ev of events) {
    const mimeTag = ev.tags.find((t) => t[0] === "m");
    const mimeType = mimeTag ? mimeTag[1] : "application/octet-stream";

    if (mimeType === "text/html") {
      categorized.html = ev.id;
    } else if (mimeType === "text/css") {
      categorized.css.push(ev.id);
    } else if (
      mimeType === "application/javascript" ||
      mimeType === "text/javascript"
    ) {
      categorized.js.push(ev.id);
    } else {
      categorized.other.push(ev.id);
    }
  }

  // DEBUG: Log what we fetched
  logger.debug("Assets fetched and categorized", {
    count: events.length,
    html: categorized.html ? categorized.html.slice(0, 8) : "NONE",
    cssCount: categorized.css.length,
    jsCount: categorized.js.length,
    otherCount: categorized.other.length,
    assets: events.map((ev) => {
      const mimeTag = ev.tags.find((t) => t[0] === "m");
      return {
        kind: ev.kind,
        mime: mimeTag ? mimeTag[1] : "unknown",
        id: ev.id.slice(0, 8),
        size: ev.content?.length || 0,
      };
    }),
  });

  // Verify all required assets were fetched
  const missing = assetIds.filter((id) => !byId[id]);
  if (missing.length > 0) {
    throw new Error(
      `Failed to fetch ${missing.length} asset(s) from relays: ${missing
        .map((id) => id.slice(0, 8))
        .join(", ")}... ` +
        `Relays: ${boot.relays.join(
          ", "
        )}. Assets may have been deleted or relays may be offline.`
    );
  }

  // Validate we have HTML asset
  if (!categorized.html) {
    throw new Error(
      `Invalid manifest: Missing HTML asset. ` +
        `Manifest must reference at least one asset with MIME type 'text/html'.`
    );
  }

  // Verify author matches for all assets (security)
  for (const [id, ev] of Object.entries(byId)) {
    if (ev.pubkey !== boot.pk) {
      throw new Error(
        `❌ Security: Asset ${id.slice(0, 8)}... has wrong author. ` +
          `Expected: ${boot.pk.slice(0, 8)}..., Got: ${ev.pubkey.slice(
            0,
            8
          )}... ` +
          `This could indicate an attack or relay corruption.`
      );
    }
  }

  // Return both the categorized IDs and the events by ID for compatibility
  return { ids: categorized, byId };
}

async function verifySRI({ assets }) {
  const SRI_TIMEOUT = 10000; // 10 seconds timeout for SRI verification

  const verificationPromise = (async () => {
    for (const id of Object.keys(assets.byId)) {
      const ev = assets.byId[id];

      // Get MIME type from 'm' tag
      const mimeTag = ev.tags.find((t) => t[0] === "m");
      const mimeType = mimeTag ? mimeTag[1] : "application/octet-stream";

      // Get content hash from 'x' tag (per NIP-YY, all assets have 'x' tag with SHA-256 hash)
      const xTag = ev.tags.find((t) => t[0] === "x");

      // Verify content hash for all assets (required by NIP-YY)
      if (xTag && xTag[1]) {
        const calc = await sha256hexText(ev.content || "");
        if (calc !== xTag[1]) {
          throw new Error(
            `❌ Security: Asset ${id.slice(
              0,
              8
            )}... has invalid content hash. ` +
              `Expected: ${xTag[1].slice(0, 16)}..., Got: ${calc.slice(
                0,
                16
              )}... ` +
              `MIME: ${mimeType}. ` +
              `This indicates content tampering or corruption.`
          );
        }

        // Log verification for JavaScript and CSS (security critical)
        if (
          mimeType === "application/javascript" ||
          mimeType === "text/javascript"
        ) {
          logger.debug("Content hash verified for JS", {
            id: id.slice(0, 8),
            hash: xTag[1].slice(0, 16) + "...",
          });
        } else if (mimeType === "text/css") {
          logger.debug("Content hash verified for CSS", {
            id: id.slice(0, 8),
            hash: xTag[1].slice(0, 16) + "...",
          });
        } else {
          logger.trace("Content hash verified", {
            id: id.slice(0, 8),
            mime: mimeType,
          });
        }
      } else {
        // 'x' tag is required for all assets per NIP-YY
        logger.warn("Asset missing content hash 'x' tag", {
          id: id.slice(0, 8),
          mime: mimeType,
        });
      }
    }
    return true;
  })();

  // Race between verification and timeout
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("SRI verification timeout (10s exceeded)")),
      SRI_TIMEOUT
    )
  );

  return Promise.race([verificationPromise, timeoutPromise]);
}

function cspFromManifest(manifest) {
  try {
    const m = JSON.parse(manifest.content || "{}");
    const c = m.csp;
    if (!c) return null;
    const map = {
      defaultSrc: "default-src",
      imgSrc: "img-src",
      scriptSrc: "script-src",
      styleSrc: "style-src",
      connectSrc: "connect-src",
      frameSrc: "frame-src",
      fontSrc: "font-src",
    };
    const entries = Object.entries(c)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => `${map[k] || k} ${v.join(" ")}`);
    return entries.length ? entries.join("; ") : null;
  } catch {
    return null;
  }
}

async function assembleDocument({ manifest, assets }) {
  const ids = assets.ids,
    byId = assets.byId;
  const html =
    byId[ids.html]?.content ||
    "<!doctype html><html><head></head><body>Empty</body></html>";

  // Extract CSS and JS content separately (don't embed in HTML)
  const cssContents = ids.css.map((id) => byId[id]?.content || "");
  const jsContents = ids.js.map((id) => byId[id]?.content || "");

  // DEBUG: Log assembled content
  logger.debug("Document assembled", {
    htmlSize: html.length,
    cssFiles: cssContents.length,
    cssTotalSize: cssContents.reduce((sum, css) => sum + css.length, 0),
    jsFiles: jsContents.length,
    jsTotalSize: jsContents.reduce((sum, js) => sum + js.length, 0),
  });

  // Validate total content size
  const totalSize =
    html.length +
    cssContents.reduce((sum, css) => sum + css.length, 0) +
    jsContents.reduce((sum, js) => sum + js.length, 0);

  if (totalSize > CONFIG.MAX_CONTENT_SIZE) {
    throw new Error(
      `Assembled document exceeds maximum size: ${(
        totalSize /
        1024 /
        1024
      ).toFixed(2)}MB > ${(CONFIG.MAX_CONTENT_SIZE / 1024 / 1024).toFixed(
        2
      )}MB. ` +
        `This protects against DoS attacks. Consider splitting content across multiple pages.`
    );
  }

  // Remove original script and style tags from HTML
  let cleanHtml = html
    .replace(
      /<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi,
      ""
    ) // Remove CSP
    .replace(/<link[^>]*rel=["']?stylesheet["'][^>]*>/gi, "") // Remove stylesheet links
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""); // Remove all scripts

  // Return as bundle for renderer to handle
  return {
    html: cleanHtml,
    css: cssContents,
    js: jsContents,
    manifest: manifest, // Include manifest in the bundle
  };
}

// ---- RPC bridge ----
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.target !== "offscreen") return false; // Not for us, don't indicate async response

  (async () => {
    const { id, method, params } = msg;

    try {
      // Validate sender origin
      if (!sender.id || sender.id !== chrome.runtime.id) {
        throw new Error("Unauthorized sender");
      }

      // Validate message structure
      if (!msg || typeof method !== "string" || !id) {
        throw new Error("Invalid message format");
      }

      // Validate method name (whitelist)
      const allowedMethods = [
        "dnsBootstrap",
        "fetchSiteIndex",
        "fetchManifestForRoute",
        "fetchAssets",
        "verifySRI",
        "assembleDocument",
      ];
      if (!allowedMethods.includes(method)) {
        throw new Error(`Unknown method: ${method}`);
      }

      // Validate params if present
      if (params && typeof params !== "object") {
        throw new Error("Invalid params format");
      }

      let result;
      if (method === "dnsBootstrap") result = await dnsBootstrap(params);
      else if (method === "fetchSiteIndex")
        result = await fetchSiteIndex(params);
      else if (method === "fetchManifestForRoute")
        result = await fetchManifestForRoute(params);
      else if (method === "fetchAssets") result = await fetchAssets(params);
      else if (method === "verifySRI") result = await verifySRI(params);
      else if (method === "assembleDocument")
        result = await assembleDocument(params);
      else if (method === "clearCache") {
        cache.clear();
        logger.info("Offscreen cache cleared");
        result = { cleared: true };
      }

      chrome.runtime.sendMessage({ target: "sw", id, result });
    } catch (e) {
      chrome.runtime.sendMessage({
        target: "sw",
        id,
        error: String(e?.message || e),
      });
    }
  })();

  return false; // We're using sendMessage, not sendResponse
});
