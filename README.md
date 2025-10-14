# Nostr Web Browser Extension

Production-grade Chrome extension for browsing decentralized websites over Nostr.

## ✨ Features

- 🌐 **Transparent Browsing** — Just type a URL, automatic Nostr Web detection
- ⚡ **Fast Loading** — Parallel relay fetching with smart caching
- 🔒 **Secure** — Author verification, SHA256 integrity, sandboxed rendering
- 💾 **Smart Caching** — DNS offline-only, site index always fresh, manifests cached
- 📡 **Multi-Relay** — Fetches from multiple relays for redundancy
- 🎨 **Beautiful UI** — Modern interface with loading states and animations
- 📱 **Mobile-Ready** — Responsive design

## 🚀 Quick Start

### For Users

**Install from Store:**
- [Chrome Web Store](https://chrome.google.com/webstore) (search for "Nostr Web") - Under Review

**Or Load Manually:**
1. Download the latest release ZIP from [GitHub Releases](https://github.com/Shugur-Network/nostr-web/releases)
2. Extract the ZIP file
3. Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → Select extracted folder

### For Developers

```bash
# Clone repository
git clone https://github.com/Shugur-Network/nostr-web.git
cd nostr-web/extension

# Install dependencies
npm install

# Generate icons (required for first-time setup)
npm run generate:icons

# Validate extension structure
npm run validate

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode" (top-right toggle)
# 3. Click "Load unpacked"
# 4. Select this directory
```

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

### Site Index (kind 34236)

- **TTL:** 0 seconds (always fresh)
- **Strategy:** Always query relays, never cache
- **Rationale:** Must detect site updates immediately
- **Performance:** ~200-500ms per query (acceptable for transparency)

### Page Manifests (kind 34235)

- **TTL:** 30 seconds
- **Strategy:** Fetch fresh, compare site_index ID with cached version
- **Cache Hit:** Use cached page if site_index unchanged
- **Fallback:** Use cache if relays offline
- **Validation:** Stored with `_siteIndexId` field for validation

### Assets (kinds 40000-40003)

- **TTL:** 7 days
- **Strategy:** Content-addressed, immutable
- **Cache:** In-memory Map with LRU eviction (max 500 entries)
- **Expiration:** Timestamp-based, auto-evict on read

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
npm run validate        # Validate extension structure
npm run generate:icons  # Generate placeholder icons (16/48/128px)
npm run build:prod      # Build production ZIP for Chrome Web Store
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

**Immutable Assets (Content-Addressed):**

- **40000** — HTML content
- **40001** — CSS stylesheets
- **40002** — JavaScript (requires SHA256 tag)
- **40003** — Components (reusable HTML fragments)

**Replaceable Metadata (Addressable):**

- **34235** — Page Manifest (per route via `["d", "/<route>"]`)
- **34236** — Site Index (singleton via `["d", "site-index"]`)

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

**Optional Fields:**

- `blossom` — Array of Blossom media server URLs (for images, videos, fonts)

### Data Flow

```
DNS TXT (_nweb.example.com)
    ↓
Site Index (kind 34236, d="site-index")
    ↓
Page Manifest (kind 34235, d="/path")
    ↓
Assets (kinds 40000-40003)
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
- [ ] Package with `npm run build:prod` script
- [ ] Submit to Chrome Web Store

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
