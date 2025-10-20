# Architecture

## Overview

The Nostr Web Extension follows production patterns from MetaMask and other major browser extensions, using a service worker architecture with message passing for cross-context communication.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Service Worker (sw.js)                                  │
│ • Intercepts navigation via webNavigation API           │
│ • Manages caching (DNS, prefetch, offline)              │
│ • Coordinates with offscreen document                   │
│ • Handles all message routing                           │
└─────────────────────────────────────────────────────────┘
          │
          ├────────────────────────────┬──────────────┐
          ▼                            ▼              ▼
┌──────────────────────────────┐  ┌─────────────┐  ┌───────────┐
│ Offscreen Document           │  │ Popup       │  │ Viewer    │
│ (offscreen.html/js)          │  │ (popup.js)  │  │ (viewer.js│
│ • WebSocket connections      │  │ • Launcher  │  │ • Browser │
│ • Nostr relay pool           │  │ • Simple UI │  │ • Nav bar │
│ • DNS lookups (DoH)          │  └─────────────┘  │ • Sandbox │
│ • Event fetching/assembly    │                   └───────────┘
│ • SRI verification           │
└──────────────────────────────┘
          │
          ▼
┌──────────────────────────────┐
│ Sandbox (sandbox.html)       │
│ • CSP-exempt renderer        │
│ • Inline scripts allowed     │
│ • Isolated from extension    │
└──────────────────────────────┘
```

## Components

### Service Worker (sw.js)

**Purpose:** Central coordinator and message router

**Responsibilities:**
- Intercepts navigation events via `chrome.webNavigation.onBeforeNavigate`
- Routes messages between UI components and offscreen document
- Manages caching (DNS, events, manifests)
- Handles error states and timeouts
- Coordinates prefetching for performance

**Key APIs:**
- `chrome.webNavigation` - Navigation interception
- `chrome.storage` - Cache persistence
- `chrome.runtime.sendMessage` - Message passing
- `chrome.offscreen` - Offscreen document lifecycle

**Why Service Worker:**
- Required for Manifest V3 extensions
- Persistent background processing
- Can intercept navigation before page loads
- Access to all Chrome extension APIs

### Offscreen Document (offscreen.js)

**Purpose:** DOM-based context for network operations

**Responsibilities:**
- WebSocket connections to Nostr relays
- DNS-over-HTTPS (DoH) queries
- Nostr event fetching and filtering
- Content assembly and verification
- SRI (Subresource Integrity) validation

**Key Features:**
- Maintains persistent WebSocket connections
- Connection pooling for performance
- Event deduplication across relays
- First-EOSE strategy (returns after fastest relay)

**Why Offscreen:**
- Service workers can't use WebSocket directly
- Provides DOM APIs (WebSocket, fetch)
- Hidden from user (no UI)
- Can be long-lived for persistent connections

**Chrome vs Firefox:**
- **Chrome:** Uses persistent offscreen document
- **Firefox:** Uses background script (similar role)

### Popup (popup.js)

**Purpose:** Simple launcher UI

**Features:**
- Domain input field
- "Open" button to launch viewer
- Quick access to extension
- Minimal UI for fast loading

**Flow:**
1. User enters domain
2. Sends message to service worker
3. Service worker opens viewer tab
4. Viewer receives domain and loads content

### Viewer (viewer.js)

**Purpose:** Main browser UI

**Features:**
- Address bar with domain input
- Navigation buttons (back, forward, refresh)
- Settings button (gear icon)
- History management
- Sandboxed content rendering

**Responsibilities:**
- User interaction handling
- History stack management
- Communication with service worker
- Sandbox iframe management
- Loading state indicators

**Communication:**
- Sends load requests to service worker
- Receives assembled HTML from service worker
- Passes HTML to sandbox for rendering

### Sandbox (sandbox.html)

**Purpose:** Isolated renderer for untrusted content

**Features:**
- CSP-exempt (allows inline scripts)
- `sandbox` attribute without `allow-same-origin`
- Isolated from extension context
- Cannot access extension APIs

**Security:**
- No access to extension storage
- No access to browser cookies
- No cross-origin requests (enforced by CSP)
- Cannot escape sandbox

**Why Sandbox:**
- Nostr Web sites may include inline JavaScript
- Extension CSP is too strict for dynamic content
- Sandbox provides safe execution environment
- Prevents XSS and injection attacks

## Data Flow

### Page Load Sequence

```
1. User enters domain (e.g., nweb.shugur.com)
   ↓
2. Viewer sends NW_LOAD message to Service Worker
   ↓
3. Service Worker forwards to Offscreen Document
   ↓
4. Offscreen performs DNS lookup (_nweb.nweb.shugur.com)
   ↓
5. Offscreen queries Nostr relays for entrypoint (kind 11126)
   ↓
6. Offscreen fetches site index (kind 31126) by ID
   ↓
7. Offscreen fetches page manifest (kind 1126) for route
   ↓
8. Offscreen fetches all assets (kind 1125) referenced in manifest
   ↓
9. Offscreen verifies SRI hashes for JavaScript
   ↓
10. Offscreen assembles complete HTML document
   ↓
11. Service Worker receives assembled HTML
   ↓
12. Service Worker sends HTML to Viewer
   ↓
13. Viewer passes HTML to Sandbox
   ↓
14. Sandbox renders content with document.write()
   ↓
15. Page displays to user
```

### Message Types

**Service Worker Commands:**
- `nw.load` - Load a Nostr Web site
- `nw.open` - Open viewer with specific domain
- `dnsBootstrap` - Perform DNS lookup
- `fetchSiteIndex` - Get site index event
- `fetchManifestForRoute` - Get page manifest
- `fetchAssets` - Get content assets
- `verifySRI` - Verify JavaScript integrity
- `assembleDocument` - Build final HTML

**Responses:**
- `success` - Operation completed
- `error` - Operation failed (with error details)
- `cached` - Served from cache
- `timeout` - Operation timed out

## Browser Differences

### Chrome

**Structure:**
```
Service Worker (sw.js)
    ↓
Offscreen Document (offscreen.js)
    ↓
WebSocket Pool (persistent)
```

**Features:**
- Persistent offscreen document
- Long-lived WebSocket connections
- Automatic reconnection
- `chrome.offscreen` API

### Firefox

**Structure:**
```
Background Script (background.js)
    ↓
WebSocket Pool (with auto-reconnect)
```

**Features:**
- Background script instead of offscreen
- Auto-reconnect on connection close
- Similar functionality to Chrome
- Uses `browser.*` APIs

**Key Difference:**
Firefox doesn't have offscreen documents, so we use a background script with similar responsibilities.

## Performance Optimizations

### 1. Connection Pooling

Maintains open WebSocket connections to all configured relays:
- Avoids reconnection overhead
- Reduces latency on subsequent loads
- Automatic reconnection if dropped

### 2. First-EOSE Strategy

Returns results from the fastest relay:
- Queries all relays simultaneously
- Returns after first relay sends EOSE
- 200ms buffer to catch other fast relays
- Doesn't wait for slow relays

### 3. Event Deduplication

Prevents duplicate events from multiple relays:
- Tracks seen event IDs
- Filters duplicates before processing
- Reduces bandwidth and processing

### 4. Smart Caching

Different cache strategies for different event types:
- DNS: Cache for offline use
- Entrypoint: Always fetch fresh
- Site Index: Cache 30 seconds
- Manifests: Cache 30 seconds
- Assets: Cache 7 days (immutable)

### 5. Prefetching

Speculatively fetches content:
- On navigation hover
- On history navigation
- Reduces perceived latency

## Security Boundaries

### Extension Context

**Strict CSP:**
```
script-src 'self' 'wasm-unsafe-eval';
object-src 'none';
```

**Privileges:**
- Access to extension APIs
- Access to storage
- Can intercept navigation
- Can open tabs

### Sandbox Context

**Relaxed CSP:**
```
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
```

**Restrictions:**
- No extension API access
- No cross-origin requests
- No access to extension storage
- Isolated from parent context

**Communication:**
- One-way: Extension → Sandbox (HTML injection)
- Limited: Sandbox → Extension (postMessage for navigation)

## Shared Modules

### logger.js

Production-grade logging system:
- Multiple log levels (error, warn, info, debug, trace)
- Sampling to reduce noise
- Separate loggers per context
- Configurable at runtime

### constants.js

Centralized configuration:
- Event kinds
- Cache TTLs
- Timeouts
- Rate limits
- CSP policies

### errors.js

Custom error classes:
- `DNSError` - DNS lookup failures
- `RelayError` - Relay connection issues
- `ManifestError` - Missing or invalid manifests
- `ValidationError` - Input validation failures
- `TimeoutError` - Operation timeouts

### validation.js

Input validation utilities:
- Domain validation
- URL validation
- Pubkey validation
- Event ID validation
- Rate limiting

## Future Enhancements

### Planned Improvements

1. **Streaming Rendering** - Stream HTML as assets arrive
2. **Progressive Loading** - Show partial content while loading
3. **Background Sync** - Update cached content in background
4. **Service Worker Caching** - Use Cache API for better performance
5. **Preloading** - Prefetch linked pages
6. **Resource Hints** - Add preconnect/prefetch hints

### Scalability Considerations

- Event cache size limits (LRU eviction)
- Connection pool size limits
- Rate limiting for DNS queries
- Memory usage monitoring
- Storage quota management

## Development Tips

### Debugging

**Service Worker:**
```
chrome://extensions → Details → Service Worker → Inspect
```

**Offscreen Document:**
```
chrome://extensions → Details → Inspect views: offscreen.html
```

**Viewer:**
```
Right-click viewer tab → Inspect
```

### Logging

Enable debug logging:
```javascript
import { swLogger } from './shared/logger.js';
swLogger.setLevel('debug');
```

### Testing

Run automated tests:
```bash
npm test
```

Load unpacked extension:
```bash
npm run build:chrome
# Then load dist/chrome/ in chrome://extensions
```

## References

- [Chrome Extension Architecture](https://developer.chrome.com/docs/extensions/mv3/architecture-overview/)
- [Service Workers](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/offscreen/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
