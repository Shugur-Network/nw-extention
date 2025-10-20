# Protocol Specification

## Overview

The Nostr Web Extension implements the **Nostr Web Protocol (NIP-YY and NIP-ZZ)** for decentralized website hosting on Nostr.

## Event Kinds

### Regular Events (Content-Addressed by ID)

#### Kind 1125 - Asset Events

Stores all types of content assets:

- HTML files
- CSS stylesheets
- JavaScript code
- Images (PNG, JPEG, GIF, SVG, WebP)
- Fonts (WOFF, WOFF2, TTF, OTF)
- Videos and audio files
- Any other web resources

**Structure:**

```json
{
  "kind": 1125,
  "pubkey": "<author-pubkey-hex>",
  "content": "<content-as-text-or-base64>",
  "tags": [
    ["mime", "text/html"],
    ["sha256", "<sha256-hash-of-content>"]
  ],
  "created_at": <unix-timestamp>,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

**Tags:**

- `mime` (required) - MIME type of the content
- `sha256` (required for JavaScript) - SHA256 hash for integrity verification
- `encoding` (optional) - `base64` if content is binary

#### Kind 1126 - Page Manifest

Defines the structure of a single page/route:

**Structure:**

```json
{
  "kind": 1126,
  "pubkey": "<author-pubkey-hex>",
  "content": "",
  "tags": [
    ["a", "<html-asset-event-id>", "text/html"],
    ["a", "<css-asset-event-id>", "text/css"],
    ["a", "<js-asset-event-id>", "application/javascript"],
    ["title", "Page Title"],
    ["description", "Page meta description"],
    ["favicon", "<favicon-asset-event-id>"]
  ],
  "created_at": <unix-timestamp>,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

**Tags:**

- `a` (required, multiple) - Asset references: `["a", "<event-id>", "<mime-type>"]`
- `title` (optional) - Page title for `<title>` tag
- `description` (optional) - Meta description
- `favicon` (optional) - Favicon asset event ID

### Addressable Events (Content-Addressed by d-tag)

#### Kind 31126 - Site Index

Lists all page manifests for the website:

**Structure:**

```json
{
  "kind": 31126,
  "pubkey": "<author-pubkey-hex>",
  "content": "",
  "tags": [
    ["d", "<content-hash-of-manifest-list>"],
    ["m", "<manifest-event-id-1>", "/"],
    ["m", "<manifest-event-id-2>", "/about"],
    ["m", "<manifest-event-id-3>", "/blog/post-1"],
    ["title", "Site Title"],
    ["description", "Site description"]
  ],
  "created_at": <unix-timestamp>,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

**Tags:**

- `d` (required) - Content hash of all manifest IDs (for content-addressing)
- `m` (required, multiple) - Manifest mappings: `["m", "<manifest-id>", "<route>"]`
- `title` (optional) - Site-wide title
- `description` (optional) - Site-wide description

**Content Addressing:**
The `d` tag contains a hash of all manifest IDs, making this event content-addressable. When manifests change, a new site index event is created with a different `d` tag.

### Replaceable Events (Always Fetch Latest)

#### Kind 11126 - Entrypoint

Points to the current site index:

**Structure:**

```json
{
  "kind": 11126,
  "pubkey": "<author-pubkey-hex>",
  "content": "<current-site-index-event-id>",
  "tags": [
    ["d", "<domain>"]
  ],
  "created_at": <unix-timestamp>,
  "id": "<event-id>",
  "sig": "<signature>"
}
```

**Tags:**

- `d` (required) - Domain name (e.g., "nweb.shugur.com")

**Purpose:**
This replaceable event always points to the latest site index. When you update your site, you publish a new site index and update the entrypoint to reference it. Clients always fetch the entrypoint first to get the current site index ID.

## DNS Bootstrap

### TXT Record Format

DNS TXT record at `_nweb.<domain>` contains JSON:

```json
{
  "pk": "5e56a8f2c91b3d4e7f0a9c1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e",
  "relays": [
    "wss://relay1.example.com",
    "wss://relay2.example.com",
    "wss://relay3.example.com"
  ]
}
```

**Required Fields:**

- `pk` - Public key in hex format (64 characters)
- `relays` - Array of WebSocket relay URLs (minimum 1, recommended 3+)

**Optional Fields:**

- `blossom` - Array of Blossom media server URLs for large files

### Example

For domain `nweb.shugur.com`:

1. DNS query: `_nweb.nweb.shugur.com` (TXT record)
2. Returns: `{"pk":"5e56a...","relays":["wss://shu01.shugur.net",...]} `
3. Extension extracts pubkey and relay URLs
4. All subsequent events MUST be authored by this pubkey

## Data Flow

### Complete Load Sequence

```
1. User navigates to domain (e.g., nweb.shugur.com)
   ↓
2. DNS Query: _nweb.nweb.shugur.com (TXT record)
   Returns: {"pk": "5e56a...", "relays": ["wss://..."]}
   ↓
3. Query Relays for Entrypoint (kind 11126)
   Filter: {"kinds": [11126], "authors": ["5e56a..."], "#d": ["nweb.shugur.com"]}
   Returns: Event with site index ID in content field
   ↓
4. Fetch Site Index (kind 31126)
   Filter: {"ids": ["<site-index-id>"]}
   Returns: Event with list of page manifests
   ↓
5. Fetch Page Manifest for Route (kind 1126)
   Filter: {"ids": ["<manifest-id-for-route>"]}
   Returns: Event with list of asset IDs
   ↓
6. Fetch All Assets (kind 1125)
   Filter: {"ids": ["<asset-id-1>", "<asset-id-2>", ...]}
   Returns: HTML, CSS, JS, and other assets
   ↓
7. Verify Integrity
   - Check all events are authored by the pubkey from DNS
   - Verify SHA256 hashes for JavaScript assets
   ↓
8. Assemble HTML Document
   - Inject CSS into <style> tags
   - Inject JS into <script> tags
   - Insert inline assets (images as data URLs)
   ↓
9. Render in Sandbox
   - Pass assembled HTML to sandboxed iframe
   - Execute scripts in isolated environment
```

### Caching Strategy

**DNS Records:**

- TTL: Offline only
- Strategy: Always fetch fresh, cache for offline fallback
- Rationale: Detect pubkey rotation and relay changes

**Entrypoint (kind 11126):**

- TTL: 0 seconds (always fresh)
- Strategy: Always query relays
- Rationale: Must detect site updates immediately

**Site Index (kind 31126):**

- TTL: 30 seconds
- Strategy: Cache temporarily, fetch if entrypoint changed
- Rationale: Reduce unnecessary queries while detecting updates

**Page Manifests (kind 1126):**

- TTL: 30 seconds
- Strategy: Cache temporarily, fetch if site index changed
- Rationale: Balance performance with update detection

**Assets (kind 1125):**

- TTL: 7 days
- Strategy: Content-addressed, immutable
- Rationale: Assets never change (referenced by ID)

## Publishing Workflow

### 1. Create Assets

For each file (HTML, CSS, JS, images, etc.):

```javascript
{
  "kind": 1125,
  "content": "<file-content>",
  "tags": [
    ["mime", "text/html"],
    ["sha256", "<hash>"]  // Required for JS
  ]
}
```

Publish and record event IDs.

### 2. Create Page Manifests

For each page/route:

```javascript
{
  "kind": 1126,
  "content": "",
  "tags": [
    ["a", "<html-id>", "text/html"],
    ["a", "<css-id>", "text/css"],
    ["a", "<js-id>", "application/javascript"],
    ["title", "Home Page"]
  ]
}
```

Publish and record event IDs.

### 3. Create Site Index

List all page manifests:

```javascript
{
  "kind": 31126,
  "tags": [
    ["d", "<hash-of-manifests>"],
    ["m", "<manifest-1>", "/"],
    ["m", "<manifest-2>", "/about"]
  ]
}
```

Publish and record event ID.

### 4. Update Entrypoint

Point to new site index:

```javascript
{
  "kind": 11126,
  "content": "<site-index-id>",
  "tags": [["d", "yourdomain.com"]]
}
```

Publish to all relays.

### 5. Configure DNS

Set TXT record at `_nweb.yourdomain.com`:

```
{"pk":"<your-pubkey>","relays":["wss://relay1.com",...]}
```

Wait for DNS propagation (5-30 minutes).

## Security Considerations

### Author Verification

**All events MUST be authored by the pubkey specified in DNS.**

The extension:

1. Fetches pubkey from DNS TXT record
2. Verifies `event.pubkey === dns.pk` for all events
3. Rejects events from other authors

This prevents:

- Impersonation attacks
- Content injection
- Unauthorized updates

### Subresource Integrity (SRI)

**JavaScript assets MUST include SHA256 hash.**

```json
{
  "kind": 1125,
  "content": "<javascript-code>",
  "tags": [
    ["mime", "application/javascript"],
    ["sha256", "a3f9c8b2e1d0..."]
  ]
}
```

The extension:

1. Downloads JavaScript content
2. Computes SHA256 hash
3. Compares with hash in event tag
4. Rejects if mismatch

This prevents:

- Code tampering
- Malicious relays
- Man-in-the-middle attacks

### Content Security Policy (CSP)

**Rendered content is sandboxed:**

```html
<iframe sandbox="allow-scripts allow-popups" src="..."></iframe>
```

Sandbox prevents:

- Access to extension APIs
- Access to browser storage
- Cross-origin requests
- Sandbox escape

### Rate Limiting

**DNS queries are rate-limited:**

- Maximum 10 queries per host per minute
- Maximum 100 queries total per minute
- Prevents DoS attacks
- Reduces DNS provider load

## Relay Requirements

Relays hosting Nostr Web sites should:

1. **Support NIP-01** - Basic protocol
2. **Support NIP-09** - Event deletion
3. **Index by kind** - Fast queries by kind
4. **Index by author** - Fast queries by author
5. **Index by tag** - Fast queries by d-tag, a-tag
6. **Maintain history** - Don't delete old events
7. **High availability** - 99%+ uptime recommended
8. **Fast response** - <500ms EOSE for best UX

## Client Requirements

Implementations should:

1. **Verify signatures** - All Nostr events
2. **Check author** - Match DNS pubkey
3. **Verify SRI** - JavaScript integrity
4. **Implement caching** - Reduce relay load
5. **Handle errors** - Graceful degradation
6. **Support offline** - Cached content
7. **Sandbox content** - Security isolation
8. **Rate limit DNS** - Prevent abuse

## Future Extensions

### Planned NIPs

- **NIP-XX** - Blossom integration for large files
- **NIP-YY** - Version pinning and rollback
- **NIP-ZZ** - Collaborative editing and multi-author sites
- **NIP-AA** - Dynamic content and server-side logic

### Experimental Features

- Streaming rendering
- Progressive web apps (PWAs)
- WebAssembly support
- Encrypted private sites
- Paid content gating

## References

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) - Basic Protocol
- [NIP-16](https://github.com/nostr-protocol/nips/blob/master/16.md) - Event Treatment
- [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md) - Parameterized Replaceable Events
- [Blossom](https://github.com/hzrd149/blossom) - Media server protocol
