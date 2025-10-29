/**
 * @fileoverview Performance monitoring and analytics for Nostr Web
 * Tracks load times, relay performance, cache efficiency, and more
 */

import { swLogger as logger } from "./logger.js";

/**
 * @typedef {Object} LoadMetrics
 * @property {string} url - The loaded URL
 * @property {string} host - Site hostname
 * @property {string} route - Route path
 * @property {number} startTime - Load start timestamp
 * @property {number} endTime - Load end timestamp
 * @property {number} totalTime - Total load time in ms
 * @property {number} [dnsTime] - DNS lookup time
 * @property {number} [siteIndexTime] - Site index fetch time
 * @property {number} [manifestTime] - Manifest fetch time
 * @property {number} [assetsTime] - Assets fetch time
 * @property {number} [renderTime] - Rendering time
 * @property {boolean} success - Whether load was successful
 * @property {string} [error] - Error message if failed
 * @property {Object} [relayStats] - Relay performance stats
 */

/**
 * @typedef {Object} RelayMetrics
 * @property {string} url - Relay URL
 * @property {number} connectTime - Connection time in ms
 * @property {number} queryTime - Query response time in ms
 * @property {number} eventCount - Number of events received
 * @property {boolean} success - Whether query was successful
 * @property {number} timestamp - When this metric was recorded
 */

/**
 * @class PerformanceMonitor
 * Monitors and tracks extension performance metrics
 */
export class PerformanceMonitor {
  constructor() {
    this.storageKey = "nweb_performance";
    this.maxHistorySize = 100; // Keep last 100 loads
    this.maxRelayHistory = 500; // Keep last 500 relay queries
    this.loadMetrics = [];
    this.relayMetrics = [];
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
    };
    this.sessionStart = Date.now();
    this.loaded = false;
  }

  /**
   * Initialize performance monitor by loading from storage
   * @returns {Promise<void>}
   */
  async init() {
    if (this.loaded) return;

    try {
      const browserAPI = typeof browser !== "undefined" ? browser : chrome;
      const result = await new Promise((resolve, reject) => {
        browserAPI.storage.local.get([this.storageKey], (data) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve(data);
          }
        });
      });

      if (result[this.storageKey]) {
        const stored = result[this.storageKey];
        this.loadMetrics = stored.loadMetrics || [];
        this.relayMetrics = stored.relayMetrics || [];
        this.cacheStats = stored.cacheStats || {
          hits: 0,
          misses: 0,
          totalRequests: 0,
        };
      }

      this.loaded = true;
      logger.info("Performance monitor initialized", {
        loads: this.loadMetrics.length,
        relays: this.relayMetrics.length,
      });
    } catch (e) {
      logger.error("Failed to load performance data", { error: e.message });
      this.loaded = true;
    }
  }

  /**
   * Save performance data to storage
   * @returns {Promise<void>}
   * @private
   */
  async _save() {
    try {
      const browserAPI = typeof browser !== "undefined" ? browser : chrome;
      const data = {
        loadMetrics: this.loadMetrics.slice(-this.maxHistorySize),
        relayMetrics: this.relayMetrics.slice(-this.maxRelayHistory),
        cacheStats: this.cacheStats,
      };

      await new Promise((resolve, reject) => {
        browserAPI.storage.local.set({ [this.storageKey]: data }, () => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      logger.debug("Performance data saved");
    } catch (e) {
      logger.error("Failed to save performance data", { error: e.message });
    }
  }

  /**
   * Record a page load
   * @param {LoadMetrics} metrics - Load metrics
   * @returns {Promise<void>}
   */
  async recordLoad(metrics) {
    await this.init();

    this.loadMetrics.push({
      ...metrics,
      timestamp: Date.now(),
    });

    // Trim if exceeds max size
    if (this.loadMetrics.length > this.maxHistorySize) {
      this.loadMetrics.shift();
    }

    await this._save();
    logger.debug("Load recorded", { url: metrics.url, time: metrics.totalTime });
  }

  /**
   * Record relay performance
   * @param {RelayMetrics} metrics - Relay metrics
   * @returns {Promise<void>}
   */
  async recordRelay(metrics) {
    await this.init();

    this.relayMetrics.push({
      ...metrics,
      timestamp: Date.now(),
    });

    // Trim if exceeds max size
    if (this.relayMetrics.length > this.maxRelayHistory) {
      this.relayMetrics.shift();
    }

    await this._save();
    logger.debug("Relay performance recorded", {
      relay: metrics.url,
      time: metrics.queryTime,
    });
  }

  /**
   * Record cache hit
   * @returns {Promise<void>}
   */
  async recordCacheHit() {
    await this.init();
    this.cacheStats.hits++;
    this.cacheStats.totalRequests++;
    await this._save();
  }

  /**
   * Record cache miss
   * @returns {Promise<void>}
   */
  async recordCacheMiss() {
    await this.init();
    this.cacheStats.misses++;
    this.cacheStats.totalRequests++;
    await this._save();
  }

  /**
   * Get load statistics
   * @returns {Promise<Object>}
   */
  async getLoadStats() {
    await this.init();

    if (this.loadMetrics.length === 0) {
      return {
        totalLoads: 0,
        successfulLoads: 0,
        failedLoads: 0,
        averageLoadTime: 0,
        medianLoadTime: 0,
        fastestLoad: null,
        slowestLoad: null,
      };
    }

    const successful = this.loadMetrics.filter((m) => m.success);
    const failed = this.loadMetrics.filter((m) => !m.success);

    // Calculate average
    const totalTime = successful.reduce((sum, m) => sum + m.totalTime, 0);
    const averageLoadTime =
      successful.length > 0 ? totalTime / successful.length : 0;

    // Calculate median
    const sortedTimes = successful
      .map((m) => m.totalTime)
      .sort((a, b) => a - b);
    const medianLoadTime =
      sortedTimes.length > 0
        ? sortedTimes[Math.floor(sortedTimes.length / 2)]
        : 0;

    // Find fastest and slowest
    let fastestLoad = null;
    let slowestLoad = null;

    if (successful.length > 0) {
      fastestLoad = successful.reduce((min, m) =>
        m.totalTime < min.totalTime ? m : min
      );
      slowestLoad = successful.reduce((max, m) =>
        m.totalTime > max.totalTime ? m : max
      );
    }

    return {
      totalLoads: this.loadMetrics.length,
      successfulLoads: successful.length,
      failedLoads: failed.length,
      averageLoadTime: Math.round(averageLoadTime),
      medianLoadTime: Math.round(medianLoadTime),
      fastestLoad: fastestLoad
        ? {
            url: fastestLoad.url,
            time: Math.round(fastestLoad.totalTime),
            timestamp: fastestLoad.timestamp,
          }
        : null,
      slowestLoad: slowestLoad
        ? {
            url: slowestLoad.url,
            time: Math.round(slowestLoad.totalTime),
            timestamp: slowestLoad.timestamp,
          }
        : null,
    };
  }

  /**
   * Get relay statistics
   * @returns {Promise<Object>}
   */
  async getRelayStats() {
    await this.init();

    if (this.relayMetrics.length === 0) {
      return {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        averageQueryTime: 0,
        relayPerformance: [],
      };
    }

    const successful = this.relayMetrics.filter((m) => m.success);
    const failed = this.relayMetrics.filter((m) => !m.success);

    // Calculate average query time
    const totalTime = successful.reduce((sum, m) => sum + m.queryTime, 0);
    const averageQueryTime =
      successful.length > 0 ? totalTime / successful.length : 0;

    // Group by relay URL
    const relayGroups = {};
    for (const metric of this.relayMetrics) {
      if (!relayGroups[metric.url]) {
        relayGroups[metric.url] = [];
      }
      relayGroups[metric.url].push(metric);
    }

    // Calculate stats per relay
    const relayPerformance = Object.entries(relayGroups).map(
      ([url, metrics]) => {
        const successfulMetrics = metrics.filter((m) => m.success);
        const avgTime =
          successfulMetrics.length > 0
            ? successfulMetrics.reduce((sum, m) => sum + m.queryTime, 0) /
              successfulMetrics.length
            : 0;
        const totalEvents = metrics.reduce((sum, m) => sum + (m.eventCount || 0), 0);

        return {
          url,
          queries: metrics.length,
          successRate:
            metrics.length > 0
              ? (successfulMetrics.length / metrics.length) * 100
              : 0,
          averageQueryTime: Math.round(avgTime),
          totalEvents,
          lastQuery: metrics[metrics.length - 1].timestamp,
        };
      }
    );

    // Sort by success rate and average time
    relayPerformance.sort((a, b) => {
      if (Math.abs(a.successRate - b.successRate) > 5) {
        return b.successRate - a.successRate;
      }
      return a.averageQueryTime - b.averageQueryTime;
    });

    return {
      totalQueries: this.relayMetrics.length,
      successfulQueries: successful.length,
      failedQueries: failed.length,
      averageQueryTime: Math.round(averageQueryTime),
      relayPerformance,
    };
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getCacheStats() {
    await this.init();

    const hitRate =
      this.cacheStats.totalRequests > 0
        ? (this.cacheStats.hits / this.cacheStats.totalRequests) * 100
        : 0;

    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      totalRequests: this.cacheStats.totalRequests,
      hitRate: Math.round(hitRate * 10) / 10, // One decimal place
    };
  }

  /**
   * Get recent load history
   * @param {number} limit - Number of recent loads to return
   * @returns {Promise<LoadMetrics[]>}
   */
  async getRecentLoads(limit = 10) {
    await this.init();
    return this.loadMetrics.slice(-limit).reverse();
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>}
   */
  async getSessionStats() {
    await this.init();

    const sessionDuration = Date.now() - this.sessionStart;
    const recentLoads = this.loadMetrics.filter(
      (m) => m.timestamp >= this.sessionStart
    );

    return {
      sessionDuration,
      loadsThisSession: recentLoads.length,
      successfulLoads: recentLoads.filter((m) => m.success).length,
      failedLoads: recentLoads.filter((m) => !m.success).length,
    };
  }

  /**
   * Get performance trends (hourly buckets for last 24 hours)
   * @returns {Promise<Object>}
   */
  async getTrends() {
    await this.init();

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const twentyFourHours = 24 * oneHour;

    // Filter metrics from last 24 hours
    const recentMetrics = this.loadMetrics.filter(
      (m) => now - m.timestamp < twentyFourHours
    );

    // Group into hourly buckets
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      loads: 0,
      averageTime: 0,
      success: 0,
      failed: 0,
    }));

    for (const metric of recentMetrics) {
      const hoursAgo = Math.floor((now - metric.timestamp) / oneHour);
      const bucket = buckets[23 - hoursAgo]; // Reverse order (0 = current hour)

      if (bucket) {
        bucket.loads++;
        if (metric.success) {
          bucket.success++;
          bucket.averageTime += metric.totalTime;
        } else {
          bucket.failed++;
        }
      }
    }

    // Calculate averages
    for (const bucket of buckets) {
      if (bucket.success > 0) {
        bucket.averageTime = Math.round(bucket.averageTime / bucket.success);
      }
    }

    return {
      hourly: buckets,
      totalLoadsLast24h: recentMetrics.length,
    };
  }

  /**
   * Clear all performance data
   * @returns {Promise<void>}
   */
  async clear() {
    this.loadMetrics = [];
    this.relayMetrics = [];
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
    };
    await this._save();
    logger.info("Performance data cleared");
  }

  /**
   * Export performance data as JSON
   * @returns {Promise<string>}
   */
  async export() {
    await this.init();
    return JSON.stringify(
      {
        loadMetrics: this.loadMetrics,
        relayMetrics: this.relayMetrics,
        cacheStats: this.cacheStats,
        exportDate: new Date().toISOString(),
      },
      null,
      2
    );
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

