/**
 * @fileoverview Shared constants across the extension
 * Following MetaMask's pattern for centralized configuration
 *
 * IMPORTANT: This is the single source of truth for all configuration.
 * Do NOT duplicate these values in service workers or other files.
 */

export const CONFIG = {
  // Cache settings
  DNS_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  DNS_CACHE_MAX_SIZE: 100, // Max entries in DNS cache
  PREFETCH_TTL: 5 * 60 * 1000, // 5 minutes (validated via entrypoint)
  PREFETCH_MAX_SIZE: 50, // Max entries in prefetch cache
  CACHE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours (offline cache)
  CACHE_NAME: "nostr-web-v4", // Bumped for NIP updates
  MAX_CACHE_SIZE: 500, // Max entries in offscreen cache (LRU eviction)

  // Rate limiting
  DNS_RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  DNS_RATE_LIMIT_MAX: 10, // Max 10 DNS queries per minute per host
  RATE_LIMIT_MAX_SIZE: 100, // Max entries in rate limit map
  GLOBAL_RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  GLOBAL_RATE_LIMIT_MAX: 50, // Max 50 total DNS queries per minute (all domains)
  RELAY_RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RELAY_RATE_LIMIT_MAX: 100, // Max 100 relay queries per minute

  // Timeouts
  RPC_TIMEOUT: 30000, // 30 seconds
  FETCH_TIMEOUT: 15000, // 15 seconds
  RELAY_TIMEOUT: 6000, // 6 seconds (WebSocket query timeout)
  NAVIGATION_TIMEOUT: 10000, // 10 seconds
  WS_QUERY_TIMEOUT: 6000, // 6 seconds (alias for RELAY_TIMEOUT for clarity)

  // Retry settings
  MAX_RETRIES: 2, // Max retry attempts for transient failures
  RETRY_DELAY: 1000, // 1 second base delay
  RETRY_BACKOFF: 2, // Exponential backoff multiplier

  // UI
  STATUS_TIMEOUT: 3000, // 3 seconds
  MAX_HISTORY_SIZE: 50, // Max navigation history entries
  MAX_URL_LENGTH: 253, // Max domain length per RFC 1035
  MAX_ROUTE_LENGTH: 1024, // Max route path length

  // Relay/WebSocket settings
  MAX_RELAY_CONNECTIONS: 10, // Maximum number of relays to connect to
  RELAY_RECONNECT_DELAY: 1500, // 1.5 seconds
  WS_RECONNECT_DELAY: 1500, // 1.5 seconds (alias for clarity)
  WS_EOSE_WAIT_TIME: 200, // 200ms after first EOSE to wait for other fast relays

  // Offscreen document settings (Chrome only)
  OFFSCREEN_DOCUMENT_LIFETIME: 5 * 60 * 1000, // 5 minutes

  // Loading page settings
  LOADING_UPDATE_INTERVAL: 500, // 500ms
  LOADING_MAX_TIME: 30000, // 30 seconds

  // Failure/Error cache
  FAILURE_CACHE_TIME: 60000, // 1 minute

  // Default website
  DEFAULT_SITE: "nweb.shugur.com", // Demo site shown to first-time users

  // Security settings
  MAX_CONTENT_SIZE: 5 * 1024 * 1024, // 5MB max content size (prevent DoS)
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
  // Event kinds (NIP-YY and NIP-ZZ compliant)
  KIND_ASSET: 1125, // Regular event for all assets (HTML, CSS, JS, media, etc.)
  KIND_PAGE_MANIFEST: 1126, // Regular event for page manifests
  KIND_SITE_INDEX: 31126, // Addressable event for site index (content-addressed d-tag)
  KIND_ENTRYPOINT: 11126, // Replaceable event pointing to current site index

  // TTLs for Nostr events (cache duration)
  TTL_IMMUTABLE: 7 * 24 * 3600 * 1000, // 7 days for events by ID (assets, manifests)
  TTL_REPLACEABLE: 30 * 1000, // 30 seconds for site index
  TTL_ENTRYPOINT: 0, // Always fetch fresh entrypoint to detect updates

  // Legacy aliases for backward compatibility
  TTL_IMM: 7 * 24 * 3600 * 1000, // Alias for TTL_IMMUTABLE
  TTL_REP: 30 * 1000, // Alias for TTL_REPLACEABLE
};

export const STORAGE_KEYS = {
  ERROR_PREFIX: "err:",
  DNS_PREFIX: "dns:",
  CACHE_PREFIX: "cache:",
};
