# Development Guide

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- Chrome or Firefox browser
- Basic knowledge of JavaScript and browser extensions

### Setup

```bash
# Clone the repository
git clone https://github.com/Shugur-Network/nw-extention.git
cd nw-extention

# Install dependencies
npm install

# Build the extension
npm run build

# Output will be in dist/chrome/ and dist/firefox/
```

### Loading the Extension

**Chrome:**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select `dist/chrome/` directory

**Firefox:**

1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select any file in `dist/firefox/`

## Project Structure

```
nw-extention/
├── src/
│   ├── chrome/              # Chrome-specific files
│   │   ├── manifest.chrome.json
│   │   ├── sw.js           # Service worker
│   │   ├── offscreen.js    # Offscreen document
│   │   ├── offscreen.html
│   │   └── ...
│   ├── firefox/            # Firefox-specific files
│   │   ├── manifest.firefox.json
│   │   ├── background.js   # Background script
│   │   └── ...
│   ├── shared/             # Shared modules
│   │   ├── logger.js
│   │   ├── constants.js
│   │   ├── errors.js
│   │   └── validation.js
│   └── ui/                 # UI components
│       ├── popup.html/js
│       ├── viewer.html/js
│       ├── settings.html/js
│       └── sandbox.html/js
├── test/                   # Test files
├── scripts/                # Build scripts
├── docs/                   # Documentation
└── public/                 # Static assets
```

## Available Scripts

```bash
# Development
npm run build              # Build both Chrome and Firefox
npm run build:chrome       # Build Chrome only
npm run build:firefox      # Build Firefox only
npm test                   # Run test suite
npm run validate           # Validate extension structure

# The build process:
# 1. Copies shared modules to both builds
# 2. Copies UI files to both builds
# 3. Copies browser-specific files
# 4. Processes manifests
# 5. Copies public assets
```

## Development Workflow

### 1. Make Changes

Edit files in `src/` directory:

```bash
# Edit shared logic
vi src/shared/constants.js

# Edit UI
vi src/ui/viewer.js

# Edit Chrome-specific code
vi src/chrome/offscreen.js

# Edit Firefox-specific code
vi src/firefox/background.js
```

### 2. Rebuild

```bash
npm run build
```

### 3. Reload Extension

**Chrome:**

- Go to `chrome://extensions/`
- Click reload icon on your extension card

**Firefox:**

- Go to `about:debugging`
- Click "Reload" next to your extension

### 4. Test

Manual testing:

```bash
# Load a test site
1. Click extension icon
2. Enter: nweb.shugur.com
3. Verify it loads correctly
```

Automated testing:

```bash
npm test
```

### 5. Debug

**Service Worker (Chrome):**

```
chrome://extensions/ → Details → Service worker → Inspect
```

**Background Script (Firefox):**

```
about:debugging → Inspect
```

**Viewer Page:**

```
Right-click page → Inspect
```

Enable debug logging:

```javascript
import { swLogger } from "./shared/logger.js";
swLogger.setLevel("debug");
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node --test test/validation.test.js

# Watch mode (run on file changes)
node --test --watch
```

### Test Structure

```javascript
// test/example.test.js
import { test } from "node:test";
import assert from "node:assert";

test("validates domain format", () => {
  const result = validateDomain("example.com");
  assert.strictEqual(result, true);
});
```

### Writing Tests

1. **Create test file** in `test/` directory
2. **Import** the code to test
3. **Write test cases** using `node:test`
4. **Run** with `npm test`

Example:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { validateDomain } from "../src/shared/validation.js";

test("accepts valid domains", () => {
  assert.strictEqual(validateDomain("example.com"), true);
  assert.strictEqual(validateDomain("sub.example.com"), true);
});

test("rejects invalid domains", () => {
  assert.throws(() => validateDomain(""), /Invalid domain/);
  assert.throws(() => validateDomain("exam ple.com"), /Invalid domain/);
});
```

### Test Coverage

Current coverage:

- ✅ Input validation
- ✅ Error handling
- ✅ Rate limiting
- ⏳ Caching logic (partial)
- ⏳ Network operations (mocked)
- ❌ UI interactions (manual only)

## Debugging Tips

### Console Logging

```javascript
// Import logger
import { swLogger } from "./shared/logger.js";

// Log at different levels
swLogger.error("Critical error");
swLogger.warn("Warning message");
swLogger.info("Informational");
swLogger.debug("Debug details");
swLogger.trace("Verbose trace");

// Change log level dynamically
swLogger.setLevel("debug"); // Shows debug and above
```

### Network Inspection

**WebSocket Messages:**

```javascript
// In offscreen.js or background.js
ws.addEventListener("message", (event) => {
  console.log("Relay message:", event.data);
});
```

**Chrome DevTools:**

1. Open DevTools on viewer page
2. Network tab → WS filter
3. See all WebSocket traffic

### Extension Storage

```javascript
// View all stored data
chrome.storage.local.get(null, (data) => {
  console.log("Storage:", data);
});

// Clear specific key
chrome.storage.local.remove("dns:example.com");

// Clear all
chrome.storage.local.clear();
```

### Performance Profiling

```javascript
// Measure operation time
performance.mark("start-fetch");
await fetchSomeData();
performance.mark("end-fetch");
performance.measure("fetch-duration", "start-fetch", "end-fetch");

// View measurements
performance.getEntriesByType("measure");
```

## Code Style

### JavaScript

Follow standard JavaScript conventions:

```javascript
// Use const/let, not var
const CONSTANT = "value";
let mutable = "value";

// Use arrow functions
const add = (a, b) => a + b;

// Use async/await
async function fetchData() {
  const response = await fetch(url);
  return response.json();
}

// Use template literals
const message = `Hello, ${name}!`;

// Use destructuring
const { pk, relays } = dnsRecord;
```

### Naming Conventions

```javascript
// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Functions: camelCase
function validateDomain(domain) {}

// Classes: PascalCase
class DNSError extends Error {}

// Private: prefix with _
const _internal = () => {};
```

### Comments

```javascript
/**
 * Fetches site index from Nostr relays
 * @param {string} pubkey - Author public key
 * @param {string[]} relays - Relay URLs
 * @returns {Promise<Event>} Site index event
 * @throws {RelayError} If all relays fail
 */
async function fetchSiteIndex(pubkey, relays) {
  // Implementation
}
```

## Architecture Guidelines

### Message Passing

All cross-context communication uses message passing:

```javascript
// Sending a message
chrome.runtime.sendMessage(
  {
    type: "nw.load",
    payload: { domain: "example.com" },
  },
  (response) => {
    console.log("Response:", response);
  }
);

// Receiving messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "nw.load") {
    handleLoad(message.payload).then(sendResponse);
    return true; // Keep channel open for async response
  }
});
```

### Error Handling

Use custom error classes:

```javascript
import { DNSError, RelayError } from "./shared/errors.js";

try {
  const dns = await lookupDNS(domain);
} catch (error) {
  if (error instanceof DNSError) {
    // Handle DNS-specific error
  } else {
    // Handle generic error
  }
}
```

### Logging

Use appropriate log levels:

```javascript
logger.error("Critical failure"); // Always shown
logger.warn("Potential issue"); // Production
logger.info("Normal operation"); // Production
logger.debug("Detailed debugging"); // Development
logger.trace("Very verbose"); // Troubleshooting
```

## Adding Features

### Example: New Cache Strategy

1. **Update constants:**

```javascript
// src/shared/constants.js
export const CONFIG = {
  ...
  NEW_CACHE_TTL: 60000,  // 1 minute
};
```

2. **Implement logic:**

```javascript
// src/chrome/offscreen.js
async function fetchWithCache(key, fetcher) {
  const cached = await getCache(key);
  if (cached && !isExpired(cached, CONFIG.NEW_CACHE_TTL)) {
    return cached.data;
  }

  const data = await fetcher();
  await setCache(key, data);
  return data;
}
```

3. **Add tests:**

```javascript
// test/cache.test.js
test("caches data for configured TTL", async () => {
  // Test implementation
});
```

4. **Update docs:**

```markdown
<!-- docs/ARCHITECTURE.md -->

### New Cache Strategy

...
```

### Example: New UI Feature

1. **Add HTML:**

```html
<!-- src/ui/viewer.html -->
<button id="new-feature-btn">New Feature</button>
```

2. **Add JavaScript:**

```javascript
// src/ui/viewer.js
document.getElementById("new-feature-btn").addEventListener("click", () => {
  // Feature implementation
});
```

3. **Add styles:**

```css
/* src/ui/viewer.html <style> */
#new-feature-btn {
  background: blue;
  color: white;
}
```

4. **Test manually:**

- Rebuild: `npm run build`
- Reload extension
- Verify feature works

## Release Process

### 1. Version Bump

Update version in three places:

```json
// package.json
{
  "version": "1.0.1"
}
```

```json
// src/chrome/manifest.chrome.json
{
  "version": "1.0.1"
}
```

```json
// src/firefox/manifest.firefox.json
{
  "version": "1.0.1"
}
```

### 2. Build

```bash
npm run build
```

### 3. Create Distribution ZIPs

```bash
# Chrome
cd dist/chrome
zip -r ../nostr-web-browser-chrome-1.0.1.zip *
cd ../..

# Firefox
cd dist/firefox
zip -r ../nostr-web-browser-firefox-1.0.1.zip *
cd ../..
```

### 4. Test

- Load both builds manually
- Test all features
- Verify version numbers
- Check console for errors

### 5. Git Tag

```bash
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

### 6. GitHub Release

1. Go to GitHub Releases
2. Create new release
3. Upload both ZIP files
4. Add release notes

### 7. Submit to Stores

**Chrome Web Store:**

1. https://chrome.google.com/webstore/devconsole
2. Upload `nostr-web-browser-chrome-1.0.1.zip`
3. Wait for review (~1-3 days)

**Firefox Add-ons:**

1. https://addons.mozilla.org/developers/
2. Upload `nostr-web-browser-firefox-1.0.1.zip`
3. Wait for review (~1-7 days)

## Contributing

### Pull Request Process

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes
4. Add tests
5. Run tests: `npm test`
6. Commit: `git commit -m "Add my feature"`
7. Push: `git push origin feature/my-feature`
8. Open Pull Request on GitHub

### Code Review

PRs should:

- Pass all tests
- Include documentation updates
- Follow code style guidelines
- Have clear commit messages
- Be focused on single feature/fix

## Best Practices

### Security

- Never log sensitive data (private keys, user data)
- Validate all inputs
- Use CSP properly
- Keep dependencies updated
- Follow principle of least privilege

### Performance

- Cache aggressively
- Minimize network requests
- Use connection pooling
- Lazy load when possible
- Profile before optimizing

### Maintainability

- Write tests for new code
- Document complex logic
- Keep functions small and focused
- Use meaningful variable names
- Avoid magic numbers (use constants)

## Resources

### Documentation

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Firefox Extension Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Nostr Protocol](https://github.com/nostr-protocol/nips)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### Tools

- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
- [Firefox DevTools](https://firefox-source-docs.mozilla.org/devtools-user/)
- [websocat](https://github.com/vi/websocat) - WebSocket CLI
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) - Nostr utilities

### Community

- GitHub Issues: https://github.com/Shugur-Network/nw-extention/issues
- Nostr: npub1arxyhhak4zlhjyav60s5vd9hahptq5jh070j8n0yxv6keuv53k6q05g4z8
- Email: support@shugur.com
