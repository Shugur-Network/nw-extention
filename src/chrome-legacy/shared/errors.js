/**
 * @fileoverview Custom error classes for better error handling
 * Following MetaMask's pattern for structured errors
 */

import { ERROR_MESSAGES } from "./constants.js";

/**
 * Base error class for Nostr Web errors
 */
export class NostrWebError extends Error {
  constructor(message, code = "UNKNOWN_ERROR", details = {}) {
    super(message);
    this.name = "NostrWebError";
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * DNS lookup failure
 */
export class DNSError extends NostrWebError {
  constructor(host, originalError = null) {
    super(ERROR_MESSAGES.DNS_NOT_CONFIGURED, "DNS_ERROR", {
      host,
      originalError: originalError?.message,
    });
    this.name = "DNSError";
  }
}

/**
 * Relay connection failure
 */
export class RelayError extends NostrWebError {
  constructor(relays, originalError = null) {
    super(ERROR_MESSAGES.RELAY_UNREACHABLE, "RELAY_ERROR", {
      relays,
      originalError: originalError?.message,
    });
    this.name = "RelayError";
  }
}

/**
 * Manifest not found
 */
export class ManifestError extends NostrWebError {
  constructor(route, originalError = null) {
    super(ERROR_MESSAGES.MANIFEST_NOT_FOUND, "MANIFEST_ERROR", {
      route,
      originalError: originalError?.message,
    });
    this.name = "ManifestError";
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends NostrWebError {
  constructor(operation, timeout) {
    super(ERROR_MESSAGES.TIMEOUT, "TIMEOUT_ERROR", { operation, timeout });
    this.name = "TimeoutError";
  }
}

/**
 * Validation error
 */
export class ValidationError extends NostrWebError {
  constructor(field, value, reason) {
    super(reason || ERROR_MESSAGES.INVALID_URL, "VALIDATION_ERROR", {
      field,
      value,
    });
    this.name = "ValidationError";
  }
}

/**
 * SRI verification failure
 */
export class SRIError extends NostrWebError {
  constructor(eventId, expected, actual) {
    super(`SRI verification failed for event ${eventId}`, "SRI_ERROR", {
      eventId,
      expected,
      actual,
    });
    this.name = "SRIError";
  }
}

/**
 * Convert unknown errors to NostrWebError
 * @param {Error|string} error
 * @returns {NostrWebError}
 */
export function normalizeError(error) {
  if (error instanceof NostrWebError) {
    return error;
  }

  if (error instanceof Error) {
    return new NostrWebError(error.message, "INTERNAL_ERROR", {
      originalError: error.message,
      stack: error.stack,
    });
  }

  return new NostrWebError(String(error), "UNKNOWN_ERROR");
}
