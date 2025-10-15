/**
 * Privacy-First Analytics Module
 *
 * This module provides OPTIONAL anonymous usage analytics that:
 * - Requires explicit user opt-in
 * - Never collects PII (no IPs, no fingerprints, no tracking)
 * - Only sends aggregated metrics (success/error counts, timing)
 * - Can be completely disabled by user
 * - Respects Do Not Track browser setting
 * - Does not use external services by default
 *
 * All telemetry stays local unless user explicitly opts in and
 * configures an analytics endpoint.
 */

const ANALYTICS_KEY = "nweb_analytics_enabled";
const TELEMETRY_KEY = "nweb_telemetry_endpoint";
const DNT_HEADER = "DNT";

export class Analytics {
  constructor() {
    this.enabled = false;
    this.endpoint = null;
    this.buffer = [];
    this.flushInterval = null;

    // Check DNT first
    if (this.isDNTEnabled()) {
      this.enabled = false;
      return;
    }

    // Check user preference
    this.loadPreferences();
  }

  /**
   * Check if Do Not Track is enabled
   */
  isDNTEnabled() {
    return navigator.doNotTrack === "1" || window.doNotTrack === "1";
  }

  /**
   * Load analytics preferences from storage
   */
  async loadPreferences() {
    try {
      const result = await chrome.storage.local.get([
        ANALYTICS_KEY,
        TELEMETRY_KEY,
      ]);
      this.enabled = result[ANALYTICS_KEY] === true;
      this.endpoint = result[TELEMETRY_KEY] || null;

      if (this.enabled && this.endpoint) {
        this.startFlushTimer();
      }
    } catch (err) {
      console.error("Failed to load analytics preferences:", err);
      this.enabled = false;
    }
  }

  /**
   * Enable analytics (requires user action)
   */
  async enable(endpoint) {
    if (this.isDNTEnabled()) {
      throw new Error("Cannot enable analytics: Do Not Track is enabled");
    }

    this.enabled = true;
    this.endpoint = endpoint;

    await chrome.storage.local.set({
      [ANALYTICS_KEY]: true,
      [TELEMETRY_KEY]: endpoint,
    });

    this.startFlushTimer();
  }

  /**
   * Disable analytics
   */
  async disable() {
    this.enabled = false;
    this.endpoint = null;
    this.buffer = [];

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await chrome.storage.local.set({
      [ANALYTICS_KEY]: false,
      [TELEMETRY_KEY]: null,
    });
  }

  /**
   * Record an event (only if enabled)
   */
  track(eventName, properties = {}) {
    if (!this.enabled || !this.endpoint) {
      return; // No-op if disabled
    }

    // Sanitize properties (remove PII)
    const sanitized = this.sanitizeProperties(properties);

    this.buffer.push({
      event: eventName,
      timestamp: Date.now(),
      properties: sanitized,
    });

    // Auto-flush if buffer is large
    if (this.buffer.length >= 10) {
      this.flush();
    }
  }

  /**
   * Remove any potential PII from properties
   */
  sanitizeProperties(props) {
    const sanitized = {};

    for (const [key, value] of Object.entries(props)) {
      // Skip sensitive fields
      if (["url", "domain", "host", "npub", "pk", "relay"].includes(key)) {
        continue;
      }

      // Only allow primitive types
      if (["string", "number", "boolean"].includes(typeof value)) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Send buffered events to endpoint
   */
  async flush() {
    if (this.buffer.length === 0 || !this.endpoint) {
      return;
    }

    const events = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: "1.0.0",
          events,
        }),
      });

      if (!response.ok) {
        console.warn("Analytics flush failed:", response.status);
      }
    } catch (err) {
      console.warn("Analytics flush error:", err.message);
      // Don't retry - just drop events
    }
  }

  /**
   * Start auto-flush timer
   */
  startFlushTimer() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush every 5 minutes
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5 * 60 * 1000);
  }

  /**
   * Convenience methods for common events
   */

  trackPageLoad(success, loadTime) {
    this.track("page_load", {
      success,
      load_time_ms: loadTime,
    });
  }

  trackError(errorType) {
    this.track("error", {
      type: errorType,
    });
  }

  trackCacheHit(hit) {
    this.track("cache", {
      hit,
    });
  }

  trackDNSLookup(success, lookupTime) {
    this.track("dns_lookup", {
      success,
      lookup_time_ms: lookupTime,
    });
  }
}

// Singleton instance
export const analytics = new Analytics();

// Helper to check if analytics is available
export function isAnalyticsEnabled() {
  return analytics.enabled;
}

// Helper to get analytics status
export async function getAnalyticsStatus() {
  const isDNT = analytics.isDNTEnabled();
  const result = await chrome.storage.local.get([ANALYTICS_KEY, TELEMETRY_KEY]);

  return {
    dnt_enabled: isDNT,
    user_enabled: result[ANALYTICS_KEY] === true,
    endpoint: result[TELEMETRY_KEY] || null,
    active: analytics.enabled && analytics.endpoint !== null,
  };
}
