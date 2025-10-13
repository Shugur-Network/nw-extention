/**
 * @fileoverview Enterprise-grade logging utility
 * Production-ready logging with levels, sampling, and performance tracking
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

// Production environment detection (safe for all contexts)
let IS_PRODUCTION = false;
let IS_DEV = true;
try {
  // chrome.runtime.getManifest() not available in all contexts (e.g., offscreen)
  const manifest = chrome.runtime.getManifest();
  IS_PRODUCTION = !manifest.key; // Development builds have no key
  IS_DEV = !IS_PRODUCTION;
} catch (e) {
  // Fallback: assume development if manifest check fails
  IS_PRODUCTION = false;
  IS_DEV = true;
}

// Default log level based on environment
const DEFAULT_LOG_LEVEL = IS_PRODUCTION ? LOG_LEVELS.WARN : LOG_LEVELS.INFO;

// Performance sampling rate (log 1 in N slow operations)
const PERF_SAMPLE_RATE = IS_PRODUCTION ? 100 : 1;

class Logger {
  constructor(context = "NostrWeb") {
    this.context = context;
    this.level = DEFAULT_LOG_LEVEL;
    this.perfSampleCounter = 0;

    // Load saved log level from storage
    this.loadLogLevel();
  }

  /**
   * Load log level from storage (allows runtime configuration)
   */
  async loadLogLevel() {
    try {
      const result = await chrome.storage.local.get(["nweb_log_level"]);
      if (result.nweb_log_level) {
        this.level =
          LOG_LEVELS[result.nweb_log_level.toUpperCase()] ?? this.level;
      }
    } catch (e) {
      // Ignore errors loading log level
    }
  }

  /**
   * Set log level
   * @param {string} level - 'error', 'warn', 'info', 'debug', or 'trace'
   */
  setLevel(level) {
    const newLevel = LOG_LEVELS[level.toUpperCase()];
    if (newLevel !== undefined) {
      this.level = newLevel;
      // Persist to storage
      chrome.storage.local.set({ nweb_log_level: level.toLowerCase() });
    }
  }

  /**
   * Format log message with context and timestamp
   * @param {string} level
   * @param {string} message
   * @returns {string}
   */
  format(level, message) {
    if (IS_DEV) {
      // Detailed format for development
      const timestamp = new Date().toISOString();
      return `[${timestamp}] [${this.context}] [${level}] ${message}`;
    } else {
      // Minimal format for production
      return `[${this.context}] ${message}`;
    }
  }

  /**
   * Sanitize data for logging (remove sensitive info)
   * @param {any} data
   * @returns {any}
   */
  sanitize(data) {
    if (!data) return data;

    // Don't sanitize in development
    if (IS_DEV) return data;

    // Clone and remove sensitive fields in production
    if (typeof data === "object") {
      const sanitized = { ...data };
      const sensitiveKeys = ["privateKey", "sk", "nsec", "password", "token"];

      for (const key of sensitiveKeys) {
        if (key in sanitized) {
          sanitized[key] = "[REDACTED]";
        }
      }

      return sanitized;
    }

    return data;
  }

  /**
   * Check if sampling allows this log
   * @returns {boolean}
   */
  shouldSample() {
    if (IS_DEV) return true;
    this.perfSampleCounter++;
    return this.perfSampleCounter % PERF_SAMPLE_RATE === 0;
  }

  /**
   * Log error message (always logged)
   * @param {string} message
   * @param {Error|object} error
   */
  error(message, error = null) {
    if (this.level >= LOG_LEVELS.ERROR) {
      const formatted = this.format("ERROR", message);
      if (error instanceof Error) {
        console.error(formatted, {
          message: error.message,
          stack: IS_DEV ? error.stack : undefined,
        });
      } else {
        console.error(formatted, this.sanitize(error));
      }
    }
  }

  /**
   * Log warning message (production default)
   * @param {string} message
   * @param {object} data
   */
  warn(message, data = null) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(this.format("WARN", message), this.sanitize(data));
    }
  }

  /**
   * Log info message (development only by default)
   * @param {string} message
   * @param {object} data
   */
  info(message, data = null) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(this.format("INFO", message), this.sanitize(data));
    }
  }

  /**
   * Log debug message (development only)
   * @param {string} message
   * @param {object} data
   */
  debug(message, data = null) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.debug(this.format("DEBUG", message), this.sanitize(data));
    }
  }

  /**
   * Log trace message (verbose debugging)
   * @param {string} message
   * @param {object} data
   */
  trace(message, data = null) {
    if (this.level >= LOG_LEVELS.TRACE) {
      console.debug(this.format("TRACE", message), this.sanitize(data));
    }
  }

  /**
   * Log performance metric (sampled in production)
   * @param {string} operation
   * @param {number} duration - Duration in milliseconds
   * @param {object} metadata
   */
  perf(operation, duration, metadata = null) {
    if (this.shouldSample()) {
      const message = `${operation} took ${duration.toFixed(2)}ms`;
      if (duration > 1000) {
        this.warn(message, metadata);
      } else if (this.level >= LOG_LEVELS.INFO) {
        console.log(this.format("PERF", message), this.sanitize(metadata));
      }
    }
  }

  /**
   * Start performance timing
   * @param {string} operation
   * @returns {Function} - Call to log duration
   */
  time(operation) {
    const start = performance.now();
    return (metadata = null) => {
      const duration = performance.now() - start;
      this.perf(operation, duration, metadata);
      return duration;
    };
  }

  /**
   * Log group (development only)
   * @param {string} label
   * @param {Function} fn
   */
  group(label, fn) {
    if (IS_DEV && this.level >= LOG_LEVELS.DEBUG) {
      console.group(this.format("GROUP", label));
      try {
        fn();
      } finally {
        console.groupEnd();
      }
    } else {
      fn();
    }
  }

  /**
   * Log table (development only)
   * @param {Array|Object} data
   */
  table(data) {
    if (IS_DEV && this.level >= LOG_LEVELS.DEBUG) {
      console.table(data);
    }
  }
}

// Export singleton instances for different contexts
export const swLogger = new Logger("SW");
export const uiLogger = new Logger("UI");
export const contentLogger = new Logger("Content");
export const offscreenLogger = new Logger("Offscreen");

// Export Logger class for custom instances
export { Logger, LOG_LEVELS, IS_PRODUCTION, IS_DEV };
export default Logger;
