/**
 * @fileoverview Shared constants across the extension
 * Following MetaMask's pattern for centralized configuration
 */

export const CONFIG = {
  // Cache settings
  DNS_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  PREFETCH_TTL: 5 * 60 * 1000, // 5 minutes
  CACHE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
  CACHE_NAME: "nostr-web-v2",

  // Rate limiting
  DNS_RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  DNS_RATE_LIMIT_MAX: 10, // Max 10 DNS queries per minute per host

  // Timeouts
  RPC_TIMEOUT: 30000, // 30 seconds
  RELAY_TIMEOUT: 6000, // 6 seconds
  NAVIGATION_TIMEOUT: 10000, // 10 seconds

  // UI
  STATUS_TIMEOUT: 3000, // 3 seconds
  MAX_HISTORY_SIZE: 50,
  MAX_URL_LENGTH: 253,
  MAX_ROUTE_LENGTH: 1024,

  // Relay settings
  MAX_RELAY_CONNECTIONS: 5,
  RELAY_RECONNECT_DELAY: 1500, // 1.5 seconds

  // Error cache
  FAILURE_CACHE_TIME: 60000, // 1 minute
};

export const MESSAGE_TYPES = {
  // Service worker commands
  NW_LOAD: "nw.load",
  NW_OPEN: "nw.open",
  DNS_BOOTSTRAP: "dnsBootstrap",
  FETCH_SITE_INDEX: "fetchSiteIndex",
  FETCH_MANIFEST: "fetchManifestForRoute",
  FETCH_ASSETS: "fetchAssets",
  VERIFY_SRI: "verifySRI",
  ASSEMBLE_DOCUMENT: "assembleDocument",

  // Content script messages
  PREFETCH: "prefetch",
  RENDER_BUNDLE: "renderBundle",

  // Error types
  ERROR_DNS: "ERROR_DNS",
  ERROR_RELAY: "ERROR_RELAY",
  ERROR_MANIFEST: "ERROR_MANIFEST",
  ERROR_TIMEOUT: "ERROR_TIMEOUT",
  ERROR_VALIDATION: "ERROR_VALIDATION",
};

export const ERROR_MESSAGES = {
  EMPTY_ADDRESS: "Empty address",
  INVALID_URL: "Invalid URL format",
  INVALID_DOMAIN: "Invalid domain format",
  URL_TOO_LONG: "URL too long",
  ROUTE_TOO_LONG: "Route too long",
  SUSPICIOUS_CHARS: "Invalid URL format - suspicious characters detected",
  UNSUPPORTED_PROTOCOL: "Only nweb:// or bare host is supported",
  DNS_NOT_CONFIGURED: "Domain not configured for Nostr Web",
  RELAY_UNREACHABLE: "Unable to connect to Nostr relays",
  MANIFEST_NOT_FOUND: "Site configuration not found",
  LOAD_FAILED: "Load failed",
  TIMEOUT: "Request timed out",
  RENDER_ERROR: "Render error",
};

export const CSP = {
  // Default CSP for rendered content
  DEFAULT:
    "default-src 'self'; img-src 'self' data: https:; script-src 'self' blob: 'unsafe-inline'; style-src 'self' 'unsafe-inline' blob:; connect-src 'self' https: wss:; font-src 'self' data: https:;",

  // Viewer page CSP
  VIEWER:
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'",

  // Content page CSP
  CONTENT:
    "default-src 'self'; img-src 'self' data: https:; script-src 'self' blob: 'unsafe-inline'; style-src 'self' 'unsafe-inline' blob:; connect-src 'self' https: wss:;",
};

export const VALIDATION = {
  // URL validation patterns
  SUSPICIOUS_PATTERNS: [
    /[<>'"]/, // HTML injection attempts
    /\.\./, // Directory traversal
    /[^\w\-\.\/]/, // Invalid characters in URL
  ],

  // Domain validation
  DOMAIN_PATTERN: /^[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)*$/,

  // Route validation
  ROUTE_PATTERN: /^([a-zA-Z0-9\-\.]+)(\/.*)?$/,
};

export const NOSTR = {
  // Event kinds
  KIND_HTML: 40000,
  KIND_CSS: 40001,
  KIND_JS: 40002,
  KIND_COMPONENTS: 40003,
  KIND_PAGE_MANIFEST: 34235,
  KIND_SITE_INDEX: 34236,

  // TTLs for Nostr events
  TTL_IMMUTABLE: 7 * 24 * 3600 * 1000, // 7 days for events by ID
  TTL_REPLACEABLE: 60 * 1000, // 1 minute for replaceable events
};

export const STORAGE_KEYS = {
  ERROR_PREFIX: "err:",
  DNS_PREFIX: "dns:",
  CACHE_PREFIX: "cache:",
};
