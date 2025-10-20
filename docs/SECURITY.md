# Security Model

## Overview

The Nostr Web Extension implements multiple security layers to protect users from malicious content while allowing legitimate dynamic websites.

## Security Layers

### 1. Author Pinning

**Purpose:** Ensure only authorized publishers can update a site

**Implementation:**

DNS TXT record at `_nweb.<domain>` specifies the authoritative public key:

```json
{
  "pk": "5e56a8f2c91b3d4e7f0a9c1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e",
  "relays": [...]
}
```

**Verification:**

```javascript
// Every event MUST match this pubkey
if (event.pubkey !== dns.pk) {
  throw new Error("Unauthorized author");
}
```

**Protection Against:**
- Impersonation attacks
- Content injection from unauthorized parties
- Relay manipulation
- Man-in-the-middle attacks

**Attack Scenarios Prevented:**

1. **Malicious Relay:** Even if a relay returns fake events, they will be rejected because the pubkey won't match.

2. **DNS Hijacking:** If DNS is compromised, attacker can only point to their own pubkey, not impersonate the original author.

3. **Nostr Protocol:** All events are cryptographically signed, making forgery computationally infeasible.

### 2. Subresource Integrity (SRI)

**Purpose:** Verify JavaScript code hasn't been tampered with

**Implementation:**

JavaScript assets (kind 1125) MUST include SHA256 hash:

```json
{
  "kind": 1125,
  "content": "alert('Hello World');",
  "tags": [
    ["mime", "application/javascript"],
    ["sha256", "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae"]
  ]
}
```

**Verification:**

```javascript
const computed = await crypto.subtle.digest('SHA-256', content);
const expected = event.tags.find(t => t[0] === 'sha256')[1];

if (computed !== expected) {
  throw new Error("Integrity check failed");
}
```

**Protection Against:**
- Code tampering by malicious relays
- Man-in-the-middle attacks
- Corrupted downloads
- Relay bugs or errors

**Why Only JavaScript?**

JavaScript can execute arbitrary code, while HTML and CSS are declarative. This focuses verification on the highest-risk assets.

### 3. Content Security Policy (CSP)

**Purpose:** Isolate rendered content from extension privileges

**Extension Pages (Strict CSP):**

```
script-src 'self' 'wasm-unsafe-eval';
object-src 'none';
```

- Only extension scripts can run
- No inline scripts or eval
- No plugins or objects
- Protects extension integrity

**Sandboxed Pages (Relaxed CSP):**

```
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
connect-src 'self' https: wss:;
```

- Allows inline scripts (needed for dynamic sites)
- Allows eval (needed for some frameworks)
- Restricts network access
- Isolated from extension context

**Sandbox Attributes:**

```html
<iframe 
  sandbox="allow-scripts allow-popups allow-forms"
  src="...">
</iframe>
```

**What's Allowed:**
- `allow-scripts` - JavaScript execution
- `allow-popups` - Opening new windows
- `allow-forms` - Form submission

**What's Blocked:**
- `allow-same-origin` - **NOT SET** (crucial for security)
- Access to extension APIs
- Access to browser storage (cookies, localStorage)
- Access to parent window
- XMLHttpRequest to other origins

**Protection Against:**
- XSS (Cross-Site Scripting)
- Sandbox escape attempts
- Extension API abuse
- Cookie theft
- LocalStorage access

### 4. Rate Limiting

**Purpose:** Prevent denial-of-service attacks

**DNS Query Limits:**

```javascript
// Per-host limit
MAX_QUERIES_PER_HOST = 10;  // per minute
WINDOW_SIZE = 60000;  // 1 minute

// Global limit
MAX_QUERIES_GLOBAL = 100;  // per minute
```

**Implementation:**

```javascript
const queryCount = await getQueryCount(host);
if (queryCount >= MAX_QUERIES_PER_HOST) {
  throw new Error("Rate limit exceeded");
}
```

**Protection Against:**
- DNS amplification attacks
- Resource exhaustion
- API abuse
- Accidental infinite loops

### 5. Input Validation

**Purpose:** Prevent injection and exploitation

**Domain Validation:**

```javascript
// Valid: alphanumeric, hyphens, dots
const DOMAIN_PATTERN = /^[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)*$/;

if (!DOMAIN_PATTERN.test(domain)) {
  throw new ValidationError("Invalid domain format");
}
```

**Route Validation:**

```javascript
// Reject directory traversal
if (route.includes('..')) {
  throw new ValidationError("Invalid route");
}

// Reject HTML injection
if (/<|>|'|"/.test(route)) {
  throw new ValidationError("Suspicious characters");
}
```

**URL Length Limits:**

```javascript
const MAX_URL_LENGTH = 253;  // DNS spec limit
const MAX_ROUTE_LENGTH = 1024;

if (url.length > MAX_URL_LENGTH) {
  throw new ValidationError("URL too long");
}
```

**Protection Against:**
- SQL injection
- XSS attacks
- Path traversal
- Buffer overflows
- DoS via large inputs

## Attack Scenarios & Mitigations

### Scenario 1: Malicious Relay

**Attack:** Relay returns fake events with malicious JavaScript

**Mitigation:**
1. Author pinning - Events from wrong pubkey are rejected
2. SRI verification - Modified JavaScript fails hash check
3. Signature verification - Invalid signatures are rejected

**Result:** Attack fails at multiple levels

### Scenario 2: Compromised DNS

**Attack:** Attacker controls DNS and points to their pubkey

**Mitigation:**
- DNS is trusted by design (same as regular web)
- Users can verify pubkey independently
- Domain ownership proves legitimacy
- DNSSEC can be used for additional security

**Result:** Same trust model as traditional web

### Scenario 3: XSS Attempt

**Attack:** Malicious site tries to inject scripts into extension

**Mitigation:**
1. Sandbox isolation - No access to extension context
2. CSP enforcement - Strict policies on extension pages
3. No `allow-same-origin` - Sandbox can't access parent

**Result:** Scripts are confined to sandbox, can't access extension

### Scenario 4: Sandbox Escape

**Attack:** Malicious code tries to break out of sandbox

**Mitigation:**
1. Browser-enforced sandbox (not bypassable)
2. No `allow-same-origin` flag (prevents most escapes)
3. Separate process in modern browsers
4. Regular browser updates patch vulnerabilities

**Result:** Escape requires browser 0-day vulnerability

### Scenario 5: Relay Censorship

**Attack:** All relays refuse to serve content

**Mitigation:**
1. Cache fallback - Serves cached version
2. Multiple relays - Redundancy prevents single point of failure
3. User can add custom relays

**Result:** Content remains accessible even if some relays are down

### Scenario 6: DNS Poisoning

**Attack:** MITM attacker intercepts DNS queries

**Mitigation:**
1. DNS-over-HTTPS (DoH) - Encrypted DNS queries
2. Uses Google/Cloudflare DNS - Trusted resolvers
3. DNSSEC support (if enabled)

**Result:** DNS queries are encrypted and authenticated

## Privacy Considerations

### What's Private

- **No tracking** - Extension doesn't phone home
- **No analytics** - No user behavior collection
- **No account** - No sign-in required
- **Local storage** - All data stored locally
- **Open source** - Verifiable code

### What's Not Private

- **DNS queries** - Sent to DoH providers (Google/Cloudflare)
- **Relay connections** - IP address visible to relays
- **Page loads** - Relays know which sites you request

### Privacy Tips

1. **Use VPN/Tor** - Hide IP from relays
2. **Custom DNS** - Use privacy-focused DNS provider
3. **Self-host relay** - Run your own relay
4. **Clear cache** - Remove browsing history

## Threat Model

### In Scope

- Malicious website owners
- Compromised relays
- Man-in-the-middle attackers
- Malicious extensions
- XSS and injection attacks

### Out of Scope

- Browser 0-day exploits
- OS-level malware
- Physical device access
- Social engineering
- DNS provider compromise

### Assumptions

1. **Browser is trusted** - We rely on browser security model
2. **Nostr protocol is sound** - Cryptographic signatures are secure
3. **DNS is trusted** - Same assumption as traditional web
4. **User's device is not compromised** - Malware can bypass all protections

## Security Best Practices

### For Site Publishers

1. **Protect your private key** - Use hardware wallet or secure storage
2. **Use strong relay** - Choose reputable, well-maintained relays
3. **Verify SRI hashes** - Ensure integrity tags are correct
4. **Regular updates** - Keep site content current
5. **Monitor relays** - Check your content is being served correctly

### For Users

1. **Keep browser updated** - Latest security patches
2. **Verify domains** - Check you're on the right site
3. **Be cautious** - Don't blindly trust all Nostr Web sites
4. **Report issues** - Help improve security by reporting bugs
5. **Check extension** - Verify you installed the official extension

### For Developers

1. **Review code** - Security audit before deployment
2. **Test thoroughly** - Include security test cases
3. **Follow guidelines** - Implement all required security measures
4. **Report vulnerabilities** - Responsible disclosure
5. **Stay updated** - Follow security advisories

## Security Audits

### Recommended Audits

- [ ] Code review by security professionals
- [ ] Penetration testing
- [ ] Fuzzing tests for parser vulnerabilities
- [ ] Dependency audit (npm audit)
- [ ] Static analysis (ESLint security plugins)

### Known Limitations

1. **DNS trust** - Same as traditional web, DNS is a trust anchor
2. **Browser sandbox** - Security depends on browser implementation
3. **Relay availability** - Sites can be censored if all relays block them
4. **Nostr key management** - Users must protect their keys

## Reporting Security Issues

If you find a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. **Email:** security@shugur.com
3. **Include:** Detailed description and reproduction steps
4. **Wait:** Allow time for fix before public disclosure
5. **Credit:** You'll be credited in security advisory

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Browser Sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-sandbox)
- [SRI Specification](https://www.w3.org/TR/SRI/)
- [DNS-over-HTTPS](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/)
