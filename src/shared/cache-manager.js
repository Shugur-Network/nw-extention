/**
 * @fileoverview Centralized cache management for service workers
 * Handles DNS cache, prefetch cache, rate limiting, and LRU eviction
 */

import { CONFIG } from "./constants.js";
import { swLogger as logger } from "./logger.js";

/**
 * Generic cache with TTL and LRU eviction
 * @class
 */
export class CacheManager {
  /**
   * @param {number} maxSize - Maximum number of entries
   * @param {string} name - Cache name for logging
   */
  constructor(maxSize, name = "cache") {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.name = name;
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.exp) {
      this.cache.delete(key);
      return null;
    }

    // Update access time for LRU
    entry.lastAccess = Date.now();
    return entry.val;
  }

  /**
   * Set value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs) {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      val: value,
      exp: Date.now() + ttlMs,
      lastAccess: Date.now(),
    });
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Check if key exists in cache (without updating access time)
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.exp) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Clear all entries from cache
   */
  clear() {
    this.cache.clear();
    logger.info(`Cleared ${this.name}`, { entries: this.cache.size });
  }

  /**
   * Get cache size
   * @returns {number} Number of entries in cache
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Evict oldest entry based on LRU
   * @private
   */
  evictOldest() {
    let oldest = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldest = key;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
      logger.debug(`Evicted from ${this.name}`, { key: oldest });
    }
  }

  /**
   * Get all keys in cache
   * @returns {string[]} Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let valid = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.exp) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      name: this.name,
      total: this.cache.size,
      valid,
      expired,
      maxSize: this.maxSize,
      utilization: ((this.cache.size / this.maxSize) * 100).toFixed(2) + "%",
    };
  }
}

/**
 * Rate limiter with time windows
 * @class
 */
export class RateLimiter {
  /**
   * @param {number} maxCount - Maximum actions per window
   * @param {number} windowMs - Time window in milliseconds
   * @param {number} maxSize - Maximum number of tracked keys
   * @param {string} name - Rate limiter name for logging
   */
  constructor(maxCount, windowMs, maxSize = 100, name = "rate-limiter") {
    this.maxCount = maxCount;
    this.windowMs = windowMs;
    this.maxSize = maxSize;
    this.name = name;
    this.tracking = new Map();
  }

  /**
   * Check if action is allowed for key
   * @param {string} key - Unique key (e.g., hostname, user ID)
   * @returns {boolean} True if action is allowed
   */
  check(key) {
    const now = Date.now();
    const record = this.tracking.get(key) || {
      count: 0,
      windowStart: now,
    };

    // Reset window if expired
    if (now - record.windowStart > this.windowMs) {
      record.count = 0;
      record.windowStart = now;
    }

    record.count++;

    // Evict oldest entries if tracking too many keys
    if (this.tracking.size >= this.maxSize) {
      this.evictOldest();
    }

    this.tracking.set(key, record);

    const allowed = record.count <= this.maxCount;

    if (!allowed) {
      logger.warn(`Rate limit exceeded for ${this.name}`, {
        key,
        count: record.count,
        max: this.maxCount,
      });
    }

    return allowed;
  }

  /**
   * Reset rate limit for specific key
   * @param {string} key - Key to reset
   */
  reset(key) {
    this.tracking.delete(key);
  }

  /**
   * Clear all rate limit tracking
   */
  clear() {
    this.tracking.clear();
    logger.info(`Cleared ${this.name}`);
  }

  /**
   * Get current count for key
   * @param {string} key - Key to check
   * @returns {number} Current count
   */
  getCount(key) {
    const record = this.tracking.get(key);
    if (!record) return 0;

    const now = Date.now();
    if (now - record.windowStart > this.windowMs) {
      return 0; // Window expired
    }

    return record.count;
  }

  /**
   * Evict oldest entry based on window start time
   * @private
   */
  evictOldest() {
    let oldest = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.tracking.entries()) {
      if (entry.windowStart < oldestTime) {
        oldestTime = entry.windowStart;
        oldest = key;
      }
    }

    if (oldest) {
      this.tracking.delete(oldest);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const expired = [];

    for (const [key, entry] of this.tracking.entries()) {
      if (now - entry.windowStart > this.windowMs * 2) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.tracking.delete(key);
    }

    if (expired.length > 0) {
      logger.debug(`Cleaned up ${this.name}`, { expired: expired.length });
    }
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      name: this.name,
      tracked: this.tracking.size,
      maxSize: this.maxSize,
      maxCount: this.maxCount,
      windowMs: this.windowMs,
    };
  }
}

/**
 * Create standard cache instances for extension
 * @returns {Object} Cache instances
 */
export function createStandardCaches() {
  return {
    // DNS cache for TXT record lookups
    dns: new CacheManager(CONFIG.DNS_CACHE_MAX_SIZE, "dns-cache"),

    // Prefetch cache for pre-loaded content
    prefetch: new CacheManager(CONFIG.PREFETCH_MAX_SIZE, "prefetch-cache"),

    // Rate limiters
    dnsRateLimit: new RateLimiter(
      CONFIG.DNS_RATE_LIMIT_MAX,
      CONFIG.DNS_RATE_LIMIT_WINDOW,
      CONFIG.RATE_LIMIT_MAX_SIZE,
      "dns-rate-limit"
    ),

    globalRateLimit: new RateLimiter(
      CONFIG.GLOBAL_RATE_LIMIT_MAX,
      CONFIG.GLOBAL_RATE_LIMIT_WINDOW,
      1, // Only track global key
      "global-rate-limit"
    ),
  };
}

/**
 * Store document in offline cache (Cache API)
 * @param {string} cacheKey - Cache key
 * @param {Object} doc - Document to cache
 * @returns {Promise<void>}
 */
export async function cacheOffline(cacheKey, doc) {
  try {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    // Use fake https URL as cache key (Cache API requirement)
    const cacheUrl = `https://nostr-web.local/${cacheKey}`;
    const response = new Response(JSON.stringify(doc), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${CONFIG.CACHE_MAX_AGE / 1000}`,
        "X-Cached-At": Date.now().toString(),
      },
    });
    await cache.put(cacheUrl, response);
    logger.debug("Cached offline", { cacheKey });
  } catch (e) {
    logger.warn("Failed to cache offline", { error: e.message });
  }
}

/**
 * Retrieve document from offline cache (Cache API)
 * @param {string} cacheKey - Cache key
 * @returns {Promise<Object|null>} Cached document or null
 */
export async function getOfflineCache(cacheKey) {
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

/**
 * Clear all offline caches
 * @returns {Promise<number>} Number of caches cleared
 */
export async function clearOfflineCache() {
  try {
    const cacheNames = await caches.keys();
    let cleared = 0;

    for (const name of cacheNames) {
      if (name.startsWith("nostr-web")) {
        await caches.delete(name);
        cleared++;
        logger.info("Deleted cache", { name });
      }
    }

    return cleared;
  } catch (e) {
    logger.warn("Failed to clear offline cache", { error: e.message });
    return 0;
  }
}

