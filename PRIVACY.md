# Privacy Policy for Nostr Web Browser Extension

**Last Updated:** October 12, 2025  
**Extension Version:** 0.9.6

---

## Overview

The Nostr Web Browser extension enables browsing of decentralized static websites published to Nostr relays. This privacy policy explains how the extension handles data and protects your privacy.

---

## Data Collection

**The Nostr Web Browser extension does NOT:**

- ❌ Collect any personal information
- ❌ Transmit data to remote servers (except DNS and Nostr relays as described below)
- ❌ Track your browsing history
- ❌ Use cookies or tracking technologies
- ❌ Sell or share your data with third parties
- ❌ Include analytics or telemetry

---

## Data Storage

The extension stores the following data **locally** on your device in Chrome's storage:

### 1. DNS TXT Records

- **What:** DNS records for `_nweb.<domain>` lookups
- **Why:** Cached for offline access and performance
- **Duration:** Cached temporarily, cleared when you clear cache
- **Location:** Chrome local storage

### 2. Nostr Events (Website Content)

- **What:** Website content (HTML, CSS, JavaScript, images) fetched from Nostr relays
- **Why:** Cached for offline access and faster loading
- **Duration:** Cached with TTL (time-to-live), automatically expires
- **Location:** Chrome local storage

### 3. User Settings

- **What:** Your preferences (default website, log level)
- **Why:** Remember your settings between sessions
- **Duration:** Persists until you clear settings or uninstall extension
- **Location:** Chrome local storage

**All data is stored locally and never leaves your device except when:**

1. Querying DNS-over-HTTPS for `_nweb.<domain>` records
2. Fetching website content from Nostr relays

---

## Permissions Usage

The extension requests the following permissions:

### Required Permissions

**storage**

- **Purpose:** Cache website content and user settings locally
- **Data Access:** Only extension data, no access to other extensions or browser data
- **Privacy Impact:** None - data stays on your device

**offscreen**

- **Purpose:** Maintain WebSocket connections to Nostr relays
- **Data Access:** None - used only for relay connections
- **Privacy Impact:** None - technical requirement for Chrome MV3

**webNavigation**

- **Purpose:** Detect when you navigate to a domain and check for `_nweb.<domain>` DNS TXT record
- **Data Access:** URL of pages you visit (to check for Nostr Web DNS records)
- **Privacy Impact:** Minimal - only checks DNS, does NOT store or transmit browsing history

**host_permissions (dns.google, cloudflare-dns.com)**

- **Purpose:** Query DNS-over-HTTPS for `_nweb.<domain>` TXT records
- **Data Access:** DNS queries only (domain names you visit)
- **Privacy Impact:** Minimal - standard DNS queries, same as normal browsing

### Optional Permissions (Not Currently Used)

**alarms**

- **Purpose:** Future feature for automatic cache cleanup
- **Status:** Not implemented in v0.9.6
- **Privacy Impact:** None

**tabs**

- **Purpose:** Future feature for "Open in New Tab" functionality
- **Status:** Not implemented in v0.9.6
- **Privacy Impact:** None

---

## Third-Party Services

The extension connects to the following third-party services:

### 1. DNS-over-HTTPS Providers

**Google DNS** (`dns.google`) and **Cloudflare DNS** (`cloudflare-dns.com`)

- **Purpose:** Query `_nweb.<domain>` DNS TXT records
- **Data Sent:** Domain name you're visiting (e.g., `_nweb.example.com`)
- **Privacy:** Both providers have their own privacy policies:
  - Google DNS: <https://developers.google.com/speed/public-dns/privacy>
  - Cloudflare DNS: <https://www.cloudflare.com/privacypolicy/>

### 2. Nostr Relays

**User-specified relays** (from DNS TXT records)

- **Purpose:** Fetch website content (HTML, CSS, JavaScript, images)
- **Data Sent:** Nostr event IDs and filters (to fetch website content)
- **Privacy:** Relay operators may log connections (standard WebSocket behavior)
- **Note:** You control which relays are used (specified in site's DNS record)

---

## Web Navigation

The extension uses the `webNavigation` permission to detect Nostr Web sites:

1. **When you navigate to a domain** (e.g., `example.com`), the extension checks for a `_nweb.example.com` DNS TXT record
2. **If found**, the extension fetches the site from Nostr relays
3. **If not found**, the extension does nothing and normal browsing continues

**Important:** The extension does NOT:

- Store your browsing history
- Track which pages you visit (beyond checking DNS)
- Transmit browsing data to any server
- Share navigation data with third parties

---

## Data Security

**Local Storage:**

- All cached data is stored in Chrome's secure storage
- Protected by Chrome's extension sandbox
- Only this extension can access its own storage

**Network Connections:**

- DNS queries use HTTPS (encrypted)
- Nostr relay connections use WSS (WebSocket Secure, encrypted)
- No unencrypted connections

**Content Security:**

- All JavaScript assets verified with SHA256 hashes (Subresource Integrity)
- Content rendered in sandboxed iframe (Chrome's official sandbox pattern)
- Content Security Policy (CSP) enforced to prevent malicious code

---

## Your Control

You have full control over your data:

### Clear Cache

- Open extension → Settings → "Clear Cache"
- Removes all cached DNS records and Nostr events
- **Preserves** your settings (default website, log level)

### Clear Settings

- Clear Chrome extension data:
  1. `chrome://extensions/`
  2. Find "Nostr Web Browser"
  3. Click "Remove" or clear site data

### Uninstall Extension

- Removes all extension data from your device
- No data remains after uninstallation

---

## Children's Privacy

The extension does not knowingly collect data from children under 13 years of age. The extension is not directed at children.

---

## Changes to This Privacy Policy

We may update this privacy policy from time to time. Changes will be reflected in this document with an updated "Last Updated" date.

**How to check for updates:**

- Visit: <https://github.com/Shugur-Network/nw-extention/blob/main/PRIVACY.md>
- Check the "Last Updated" date at the top

---

## Open Source

The extension is **open source** and available for audit:

- **Repository:** <https://github.com/Shugur-Network/nw-extention>
- **License:** MIT License
- **Transparency:** All code is publicly available for review

---

## Contact

For questions, concerns, or privacy-related inquiries:

- **GitHub Issues:** <https://github.com/Shugur-Network/nw-extention/issues>
- **Email:** privacy@shugur.net

---

## Compliance

This extension complies with:

- Chrome Web Store Developer Program Policies
- Chrome Extension Platform Developer Terms
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

---

**Summary:** The Nostr Web Browser extension is privacy-focused by design. It does not collect, track, or transmit your personal data. All data is stored locally on your device for caching and performance purposes only.
