# Nostr Web Extension (nw-extention)

Cross-browser extension for browsing decentralized websites over Nostr (Chrome & Firefox).

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hhdngjdmlabdachflbdfapkogadodkif?label=Chrome&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif)
[![Firefox Add-on](https://img.shields.io/amo/v/nostr-web-browser?label=Firefox&logo=firefox&logoColor=white&color=FF7139)](https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/)
[![Chrome Users](https://img.shields.io/chrome-web-store/users/hhdngjdmlabdachflbdfapkogadodkif?label=Chrome%20Users&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif)
[![Firefox Users](https://img.shields.io/amo/users/nostr-web-browser?label=Firefox%20Users&logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## ✨ Features

- 🌐 **Transparent Browsing** — Just type a URL, automatic Nostr Web detection
- ⚡ **Fast Loading** — Parallel relay fetching with smart caching and connection pooling
- 🔒 **Secure** — Author verification, SHA256 integrity, sandboxed rendering
- 💾 **Smart Caching** — DNS offline-only, site index always fresh, manifests cached
- 📡 **Multi-Relay** — Fetches from multiple relays for redundancy with automatic failover
- 🚀 **Performance** — First-EOSE optimization, WebSocket connection pooling, event deduplication
- 🦊 **Firefox Support** — Full Firefox compatibility with auto-reconnect and persistent connections
- 🎨 **Beautiful UI** — Modern interface with loading states and animations
- 📱 **Mobile-Ready** — Responsive design

## 🚀 Quick Start

### For Users

**Install from Store:**

- **Chrome**: [Chrome Web Store - Nostr Web Browser](https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif)
- **Firefox**: [Firefox Add-ons - Nostr Web Browser](https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/)

**Or Load Manually:**

1. Download the latest release ZIP from [GitHub Releases](https://github.com/Shugur-Network/nw-extention/releases)
2. Extract the appropriate ZIP (Chrome or Firefox)
3. **Chrome**: Load in `chrome://extensions` → Developer mode → Load unpacked → Select extracted folder
4. **Firefox**: Navigate to `about:debugging` → This Firefox → Load Temporary Add-on → Select any file from extracted folder

### For Developers

```bash
# Clone repository
git clone https://github.com/Shugur-Network/nw-extention.git
cd nw-extention

# Install dependencies
npm install

# Build both Chrome and Firefox extensions
npm run build

# Or build individually
npm run build:chrome    # Output: dist/chrome/
npm run build:firefox   # Output: dist/firefox/

# Run tests
npm test

# Validate extension structure
npm run validate
```

**Load in Browser:**

- **Chrome**: Open `chrome://extensions/` → Enable Developer mode → Load unpacked → Select `dist/chrome/`
- **Firefox**: Open `about:debugging` → This Firefox → Load Temporary Add-on → Select any file from `dist/firefox/`

## 📖 Usage

### Automatic Detection (Recommended)

1. Type any domain in your browser address bar (e.g., `example.com`)
2. Extension automatically checks for `_nweb.<domain>` DNS TXT record
3. If found, loads the Nostr Web site automatically in the viewer

**How it works:**

```
User navigates to example.com
    ↓
Extension intercepts navigation
    ↓
Checks DNS for _nweb.example.com
    ↓
Found? → Load from Nostr relays
Not found? → Allow normal browsing
```

### Manual Entry

1. Click the extension icon in your browser toolbar
2. Enter a domain (e.g., `nweb.shugur.com`)
3. Click "Open" or press Enter
4. Page loads in the Nostr Web viewer

### Settings

Click the ⚙️ icon in the viewer to access:

- **Default Website** — Set a site to load on extension first launch (default: `nweb.shugur.com`)
- **Clear Cache** — Remove all cached DNS records, events, and manifests (preserves settings)

## 🏗️ Architecture

The extension follows production patterns from MetaMask and other major Chrome extensions:

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

### Key Components

**Background Scripts:**

- **sw.js** — Service worker (navigation interception, caching, message routing)
- **offscreen.js** — Offscreen document (WebSocket relay connections, DNS queries, event fetching)

**UI Components:**

- **popup.html/js** — Extension icon popup (simple launcher)
- **viewer.html/js** — Main browser UI (address bar, navigation, history)
- **settings.html/js** — Settings page (default website, cache management)
- **sandbox.html** — Sandboxed renderer (CSP-exempt for dynamic content)

**Shared Modules:**

- **shared/logger.js** — Production logging with levels and sampling
- **shared/constants.js** — Centralized configuration
- **shared/errors.js** — Custom error classes
- **shared/validation.js** — Input validation utilities

## 🔒 Security Model

### 1. Author Pinning

DNS TXT record at `_nweb.<host>` pins the site's public key:

```json
{
  "pk": "5e56a...",
  "relays": ["wss://shu01.shugur.net", "wss://shu02.shugur.net"]
}
```

**All events MUST be authored by this public key.** Events from other authors are rejected.

### 2. Subresource Integrity (SRI)

JavaScript assets (kind 40002) **MUST** include SHA256 content hash:

```json
["sha256", "a3f9c8b2e1d0..."]
```

Extension verifies downloaded content matches the hash before execution.

### 3. Content Security Policy (CSP)

**Extension Pages (strict CSP):**

```
script-src 'self' 'wasm-unsafe-eval';
object-src 'none';
```

**Sandboxed Pages (relaxed CSP):**

```
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
```

Sandboxed pages are isolated from extension and can execute dynamic content safely.

### 4. Rate Limiting

- **DNS Queries:** Max 10 per host per minute
- **Global Limit:** Max 100 DNS queries per minute across all hosts
- **Relay Queries:** No artificial limit (relays enforce their own limits)

## 💾 Caching Strategy

### DNS Records

- **TTL:** Offline only (no expiration)
- **Strategy:** Always fetch fresh from DoH (Google/Cloudflare DNS)
- **Fallback:** Use cache only when offline (network error)
- **Rationale:** Detect DNS changes immediately (pubkey rotation, relay updates)

### Entrypoint (kind 11126)

- **TTL:** 0 seconds (always fresh)
- **Strategy:** Always query relays, never cache
- **Rationale:** Must detect site updates immediately (points to current site index)
- **Performance:** ~200-500ms per query (acceptable for transparency)

### Site Index (kind 31126)

- **TTL:** 30 seconds
- **Strategy:** Fetch by ID from entrypoint, cache temporarily
- **Cache Hit:** Use cached if entrypoint still points to same ID
- **Fallback:** Use cache if relays offline
- **Validation:** Content-addressed by d-tag (content hash)

### Page Manifests (kind 1126)

- **TTL:** 30 seconds
- **Strategy:** Fetch by ID, cache temporarily
- **Cache Hit:** Use cached if site index still references same manifest ID
- **Fallback:** Use cache if relays offline
- **Validation:** Fetched by event ID from site index

### Assets (kind 1125)

- **TTL:** 7 days
- **Strategy:** Content-addressed by event ID, immutable
- **Cache:** In-memory Map with LRU eviction (max 500 entries)
- **Expiration:** Timestamp-based, auto-evict on read
- **Types:** HTML, CSS, JavaScript, images, fonts, videos, etc.

## ⚡ Performance Optimizations

### 1. First-EOSE Strategy

The extension queries all relays simultaneously but returns as soon as **any relay** sends EOSE (End of Stored Events):

```javascript
// Queries all 3 relays in parallel
// Returns after first EOSE + 200ms buffer (to catch other fast relays)
// Example: If relay A responds in 500ms, relay B in 600ms, relay C in 2000ms
// Result: Total time ~700ms (not 2000ms!)
```

**Benefits:**

- ✅ Uses fastest available relay
- ✅ Doesn't wait for slow relays
- ✅ Still queries all relays for redundancy

### 2. WebSocket Connection Pooling

**Chrome:** Uses persistent offscreen document that keeps connections alive indefinitely

**Firefox:** Implements auto-reconnect with connection pooling:

```javascript
// Connections automatically reconnect if dropped
ws.onclose = () => {
  setTimeout(() => connectRelay(url), 1500); // Auto-reconnect
};
```

**Benefits:**

- ✅ First load: Establishes connections (~500-2000ms)
- ✅ Subsequent loads: Reuses connections (~100-300ms)
- ✅ Automatic failover if relay disconnects

### 3. Event Deduplication

Multiple relays may return the same events. The extension deduplicates by event ID:

```javascript
const seen = new Set();
onEvent: (event) => {
  if (!seen.has(event.id)) {
    seen.add(event.id);
    events.push(event);
  }
};
```

**Benefits:**

- ✅ Reduces processing overhead
- ✅ Saves bandwidth
- ✅ Prevents duplicate renders

### 4. Version Resolution

When different relays have different versions, the extension uses **timestamp-based resolution**:

```javascript
// Sort by created_at (newest wins)
events.sort((a, b) => b.created_at - a.created_at);
const latest = events[0]; // Always use newest version
```

**Example:**

```
Relay 1: version created_at=1699000000 (Nov 3, 2023)
Relay 2: version created_at=1700000000 (Nov 15, 2023) ← Selected
Relay 3: version created_at=1700000000 (Nov 15, 2023)
```

**Benefits:**

- ✅ Always gets latest version
- ✅ Resilient to stale relays
- ✅ Follows Nostr NIP-16/33 standards

### 5. Sandboxed Rendering

**Firefox-specific optimizations:**

- Single navigation handler (prevents duplicate event listeners)
- Direct `document.write()` without blob conversion (faster rendering)
- No CSP conflicts (sandboxed context allows inline scripts)

**Performance:**

- HTML assembly: ~5-10ms
- document.write(): ~2-8ms
- Total render time: ~10-20ms

## 🧪 Testing

The extension includes a comprehensive test suite:

```bash
npm test
```

**Test Coverage:**

- ✅ Input validation (domains, pubkeys, event IDs)
- ✅ Error handling (network errors, invalid data, timeouts)
- ✅ Rate limiting (DNS queries, global limits)
- ✅ Caching logic (TTL, expiration, fallback)
- ✅ Security (author verification, SRI validation)

**Output:**

```
✅ 57/57 tests passing
⏱️ ~200ms execution time
📦 14 test suites
```

## 🔧 Development

### Available Scripts

```bash
npm test                # Run all tests
npm run build           # Build both Chrome and Firefox extensions
npm run build:chrome    # Build Chrome extension only
npm run build:firefox   # Build Firefox extension only
npm run validate        # Validate extension structure
```

### Debugging

Set log level in Chrome DevTools console:

```javascript
// In service worker console (chrome://extensions → Details → Service worker → Inspect)
import { swLogger } from "./shared/logger.js";
swLogger.setLevel("debug"); // error, warn, info, debug, trace

// In viewer page console
import { uiLogger } from "./shared/logger.js";
uiLogger.setLevel("debug");
```

### Mock DNS for Testing

The extension includes a mock DNS entry for `test.example.com` in `offscreen.js`:

```javascript
if (host === "test.example.com") {
  return {
    pk: "5e56...", // Your test site pubkey
    relays: ["wss://shu01.shugur.net", ...],
  };
}
```

**⚠️ Remove this before production deployment!**

## 📋 Protocol

The extension implements **Nostr Web (NIP-YY)** protocol:

### Event Kinds

**Regular Events (Content-Addressed by ID):**

- **1125** — Asset events (HTML, CSS, JavaScript, media files, etc.)
- **1126** — Page Manifest (defines page structure and references assets by ID)

**Addressable Events (Content-Addressed by d-tag):**

- **31126** — Site Index (addressable by content hash in d-tag, lists all page manifests)

**Replaceable Events (Always Fetch Latest):**

- **11126** — Entrypoint (points to current site index event ID, always fetch fresh)

### DNS Bootstrap

DNS TXT record at `_nweb.<host>` contains JSON:

```json
{
  "pk": "5e56a8f2c91b3d4e7f0a9c1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e",
  "relays": [
    "wss://shu01.shugur.net",
    "wss://shu02.shugur.net",
    "wss://shu03.shugur.net"
  ]
}
```

**Required Fields:**

- `pk` — Public key (hex format, 64 chars)
- `relays` — Array of WebSocket relay URLs

### Data Flow

```
DNS TXT (_nweb.example.com) → Returns pubkey + relay list
    ↓
Entrypoint (kind 11126) → Always fetched fresh, points to current site index ID
    ↓
Site Index (kind 31126, d=<content-hash>) → Fetched by ID, lists all page manifests
    ↓
Page Manifest (kind 1126, fetched by ID) → Defines page structure, references assets
    ↓
Assets (kind 1125, fetched by ID) → HTML, CSS, JS, images, fonts, etc.
```

### Event Structure Examples

**Entrypoint Event (kind 11126):**

```json
{
  "kind": 11126,
  "pubkey": "5e56a...",
  "content": "<site-index-event-id>",
  "tags": [["d", "<domain>"]]
}
```

**Site Index Event (kind 31126):**

```json
{
  "kind": 31126,
  "pubkey": "5e56a...",
  "content": "",
  "tags": [
    ["d", "<content-hash-of-manifest-list>"],
    ["m", "<manifest-id-1>", "/"],
    ["m", "<manifest-id-2>", "/about"],
    ["m", "<manifest-id-3>", "/contact"]
  ]
}
```

**Page Manifest Event (kind 1126):**

```json
{
  "kind": 1126,
  "pubkey": "5e56a...",
  "content": "",
  "tags": [
    ["a", "<html-asset-id>", "text/html"],
    ["a", "<css-asset-id>", "text/css"],
    ["a", "<js-asset-id>", "application/javascript"],
    ["title", "Page Title"],
    ["description", "Page description"]
  ]
}
```

**Asset Event (kind 1125):**

```json
{
  "kind": 1125,
  "pubkey": "5e56a...",
  "content": "<actual-content-base64-or-text>",
  "tags": [
    ["mime", "text/html"],
    ["sha256", "<content-hash>"]
  ]
}
```

## 🚨 Troubleshooting

### Extension not detecting sites

**Problem:** Typing a domain doesn't load Nostr Web site

**Solutions:**

1. Check DNS TXT record exists at `_nweb.<domain>`
2. Wait for DNS propagation (5-30 minutes after DNS update)
3. Open service worker console (chrome://extensions → Details → Inspect service worker)
4. Check for DNS errors in console
5. Try manual entry via extension popup

### Slow loading

**Problem:** Pages take >10 seconds to load

**Solutions:**

1. Check relay response times (use `debug` log level)
2. Verify events published to all configured relays
3. Check network connection (extension requires internet for first load)
4. Clear extension cache (Settings → Clear Cache)

### Scripts not working

**Problem:** JavaScript on page doesn't execute

**Solutions:**

1. Check browser console for CSP errors (F12 → Console)
2. Verify SHA256 hashes in event tags match actual content
3. Ensure author pubkey matches DNS record pubkey
4. Check if events are kind 40002 (JavaScript)
5. Verify events published correctly (use publisher CLI's verify mode)

### Cache not clearing

**Problem:** Old content still loads after site update

**Solutions:**

1. Open Settings → Click "Clear Cache"
2. Verify site_index event has newer `created_at` timestamp
3. Check if page manifest references new asset IDs
4. Try hard reload: Close viewer tab, reopen via extension popup

## 📦 Production Checklist

Before deploying to Chrome Web Store:

- [ ] Remove mock DNS from `offscreen.js` (line ~150)
- [ ] Set default log level to `'warn'` or `'info'` in `shared/logger.js`
- [ ] Test with real Nostr Web sites (not just `nweb.shugur.com`)
- [ ] Verify SRI verification works for JavaScript
- [ ] Test offline mode with cached sites
- [ ] Security audit (author verification, CSP, rate limiting)
- [ ] Performance testing (first load, cached load, navigation)
- [ ] Capture screenshots (1280×800 for Chrome Web Store)
- [ ] Build extensions with `npm run build`
- [ ] Create distribution ZIPs (see packaging instructions below)
- [ ] Submit to Chrome Web Store and Firefox Add-ons

## 📄 File Structure

### Essential Files (Required)

```
manifest.json       — Extension configuration (MV3)
sw.js               — Service worker (background)
offscreen.html/js   — Offscreen document (WebSocket)
popup.html/js       — Extension popup
viewer.html/js      — Main browser UI
settings.html/js    — Settings page
sandbox.html        — Sandboxed renderer
shared/             — Shared utilities (logger, errors, validation, constants)
icons/              — Extension icons (16/48/128px PNG)
```

### Development Files (Exclude from distribution)

```
test/               — Test suite
build-prod.js       — Build script for Chrome Web Store ZIP
generate-icons.js   — Icon generation script
validate.js         — Extension structure validator
*.svg               — Source SVG files
node_modules/       — Dependencies
package-lock.json   — Dependency lockfile
```
