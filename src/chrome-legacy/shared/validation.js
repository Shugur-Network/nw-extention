/**
 * @fileoverview Input validation utilities
 * Security-first validation for all user inputs
 */

import { CONFIG, VALIDATION, ERROR_MESSAGES } from "./constants.js";
import { ValidationError } from "./errors.js";

/**
 * Sanitize and validate a URL input
 * @param {string} input - Raw user input
 * @returns {{host: string, route: string}} Validated host and route
 * @throws {ValidationError}
 */
export function validateAndParseURL(input) {
  const trimmed = (input || "").trim();

  // Check for empty input
  if (!trimmed) {
    throw new ValidationError("url", input, ERROR_MESSAGES.EMPTY_ADDRESS);
  }

  // Check length limits
  if (trimmed.length > CONFIG.MAX_URL_LENGTH) {
    throw new ValidationError("url", input, ERROR_MESSAGES.URL_TOO_LONG);
  }

  // Parse URL with protocol support
  const hasScheme = /^[a-z]+:\/\//i.test(trimmed);
  let url;

  try {
    url = new URL(hasScheme ? trimmed : `nweb://${trimmed}`);
  } catch (e) {
    throw new ValidationError("url", input, ERROR_MESSAGES.INVALID_URL);
  }

  // Validate protocol
  if (url.protocol !== "nweb:") {
    throw new ValidationError(
      "protocol",
      url.protocol,
      ERROR_MESSAGES.UNSUPPORTED_PROTOCOL
    );
  }

  const host = url.hostname;
  const route = url.pathname || "/";

  // Validate host
  if (!VALIDATION.DOMAIN_PATTERN.test(host)) {
    throw new ValidationError("host", host, ERROR_MESSAGES.INVALID_DOMAIN);
  }

  // Check for suspicious patterns
  for (const pattern of VALIDATION.SUSPICIOUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new ValidationError("url", input, ERROR_MESSAGES.SUSPICIOUS_CHARS);
    }
  }

  // Validate route length
  if (route.length > CONFIG.MAX_ROUTE_LENGTH) {
    throw new ValidationError("route", route, ERROR_MESSAGES.ROUTE_TOO_LONG);
  }

  return { host, route };
}

/**
 * Validate a pubkey (hex or npub format)
 * @param {string} pk - Public key
 * @returns {boolean}
 */
export function isValidPubkey(pk) {
  if (!pk) return false;

  // Check for 64-char hex
  if (/^[0-9a-f]{64}$/i.test(pk)) return true;

  // Check for npub format
  if (pk.startsWith("npub1") && pk.length === 63) return true;

  return false;
}

/**
 * Validate relay URL
 * @param {string} relay - Relay URL
 * @returns {boolean}
 */
export function isValidRelay(relay) {
  if (!relay || typeof relay !== "string") return false;

  try {
    const url = new URL(relay);
    return url.protocol === "wss:" || url.protocol === "ws:";
  } catch {
    return false;
  }
}

/**
 * Sanitize HTML to prevent XSS
 * @param {string} html - Raw HTML
 * @returns {string} Sanitized HTML
 */
export function sanitizeHTML(html) {
  if (!html || typeof html !== "string") return "";

  // Remove potentially dangerous script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Validate and sanitize CSS
 * @param {string} css - Raw CSS
 * @returns {string} Sanitized CSS
 */
export function sanitizeCSS(css) {
  if (!css || typeof css !== "string") return "";

  // Remove potential CSS injection vectors
  return css
    .replace(/javascript:/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/@import/gi, "");
}

/**
 * Rate limit check
 * @param {Map} rateMap - Rate limit tracking map
 * @param {string} key - Unique key for the action
 * @param {number} maxCount - Maximum allowed count
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} True if action is allowed
 */
export function checkRateLimit(rateMap, key, maxCount, windowMs) {
  const now = Date.now();
  const record = rateMap.get(key) || { count: 0, windowStart: now };

  // Reset window if expired
  if (now - record.windowStart > windowMs) {
    record.count = 0;
    record.windowStart = now;
  }

  record.count++;
  rateMap.set(key, record);

  return record.count <= maxCount;
}
