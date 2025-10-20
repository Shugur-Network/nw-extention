# Troubleshooting Guide

## Common Issues

### Extension Not Detecting Sites

**Symptom:** You type a domain but the site doesn't load automatically

**Possible Causes:**

1. **DNS TXT record missing**

   - Check: `dig TXT _nweb.yourdomain.com`
   - Should return JSON with `pk` and `relays`
   - Wait 5-30 minutes after DNS changes for propagation

2. **DNS TXT record malformed**

   - Must be valid JSON
   - Must have `pk` field (64-char hex)
   - Must have `relays` array with at least one URL
   - Example: `{"pk":"5e56a...","relays":["wss://relay.com"]}`

3. **Extension not enabled**
   - Chrome: Check `chrome://extensions/`
   - Firefox: Check `about:addons`
   - Ensure toggle is ON

**Solutions:**

```bash
# Verify DNS record
dig TXT _nweb.example.com

# Or use online tools
https://dns.google/query?name=_nweb.example.com&type=TXT
```

**Manual Workaround:**

1. Click extension icon
2. Enter domain manually
3. Click "Open"

---

### Slow Loading (>10 seconds)

**Symptom:** Pages take a very long time to load

**Possible Causes:**

1. **Slow relays**

   - Relay response time >2 seconds
   - Network congestion
   - Geographic distance

2. **Missing events**

   - Entrypoint not published
   - Site index not found
   - Page manifest missing
   - Assets not uploaded

3. **Network issues**
   - Slow internet connection
   - Firewall blocking WebSocket
   - VPN introducing latency

**Solutions:**

1. **Check relay response times:**

   ```javascript
   // In service worker console (chrome://extensions)
   import { swLogger } from "./shared/logger.js";
   swLogger.setLevel("debug");
   // Watch for relay response times in logs
   ```

2. **Verify all events published:**

   - Use Nostr client (e.g., nos2x) to search for events
   - Check entrypoint (kind 11126) exists
   - Verify site index (kind 31126) is reachable
   - Confirm all assets (kind 1125) are published

3. **Clear cache and retry:**

   - Click ⚙️ in viewer
   - Click "Clear Cache"
   - Reload page

4. **Try different relays:**
   - Update DNS TXT record with faster relays
   - Use relays geographically closer to you

---

### Scripts Not Working

**Symptom:** JavaScript on the page doesn't execute

**Possible Causes:**

1. **Missing SHA256 hash**

   - JavaScript assets (kind 1125) must have `sha256` tag
   - Extension rejects JS without integrity hash

2. **SHA256 mismatch**

   - Computed hash doesn't match tag
   - Content was modified
   - Encoding issue (check base64)

3. **Wrong author**

   - Event pubkey doesn't match DNS
   - Unauthorized publisher
   - DNS record outdated

4. **CSP blocking**
   - Browser console shows CSP errors
   - Sandbox restrictions
   - Invalid inline script

**Solutions:**

1. **Check browser console (F12):**

   ```
   Look for errors like:
   - "SRI verification failed"
   - "Refused to execute script"
   - "Content Security Policy"
   ```

2. **Verify event structure:**

   ```json
   {
     "kind": 1125,
     "content": "alert('test');",
     "tags": [
       ["mime", "application/javascript"],
       ["sha256", "<correct-hash>"]
     ]
   }
   ```

3. **Recompute hash:**

   ```bash
   echo -n "alert('test');" | sha256sum
   ```

4. **Check author:**
   - DNS pubkey must match event pubkey
   - Use `nostr` CLI to verify signatures

---

### Old Content After Update

**Symptom:** Site still shows old version after publishing updates

**Possible Causes:**

1. **Browser cache**

   - Extension cached old events
   - TTL not expired (30 seconds for manifests, 7 days for assets)

2. **Entrypoint not updated**

   - Still points to old site index
   - Forgot to update kind 11126 event

3. **Relay propagation**
   - New events not synced to all relays
   - Some relays still serving old version

**Solutions:**

1. **Clear extension cache:**

   - Click ⚙️ icon in viewer
   - Click "Clear Cache"
   - Refresh page

2. **Verify entrypoint:**

   ```javascript
   // Query for entrypoint
   {
     "kinds": [11126],
     "authors": ["<your-pubkey>"],
     "#d": ["yourdomain.com"]
   }
   // Content should be newest site index ID
   ```

3. **Wait for relay sync:**

   - Give relays 1-5 minutes to sync
   - Query each relay individually
   - Republish if missing

4. **Hard reload:**
   - Close viewer tab
   - Open extension popup
   - Enter domain again
   - Forces fresh fetch

---

### "Manifest Not Found" Error

**Symptom:** Extension shows "Site configuration not found"

**Possible Causes:**

1. **Page manifest doesn't exist**

   - Route not configured in site index
   - Missing kind 1126 event

2. **Wrong route in site index**

   - Typo in `m` tag
   - Case sensitivity issue
   - Missing leading slash

3. **Event not published to relays**
   - Published locally but not synced
   - Relay rejected event

**Solutions:**

1. **Check site index structure:**

   ```json
   {
     "kind": 31126,
     "tags": [
       ["m", "<manifest-id>", "/"],
       ["m", "<manifest-id-2>", "/about"]
     ]
   }
   ```

2. **Verify route matches:**

   - Routes are case-sensitive
   - Must start with `/`
   - No trailing slash (except root)

3. **Query relay directly:**

   ```bash
   # Use websocat or similar
   websocat wss://relay.com
   ["REQ","test",{"kinds":[1126],"ids":["<manifest-id>"]}]
   ```

4. **Republish manifest:**
   - Ensure event is signed correctly
   - Publish to all configured relays
   - Verify with REQ query

---

### WebSocket Connection Errors

**Symptom:** Console shows "WebSocket connection failed"

**Possible Causes:**

1. **Relay is down**

   - Temporary outage
   - Maintenance
   - Permanent shutdown

2. **Firewall blocking**

   - Corporate firewall
   - VPN restrictions
   - Browser security settings

3. **Invalid relay URL**
   - Typo in DNS record
   - Wrong protocol (ws:// vs wss://)
   - Port blocked

**Solutions:**

1. **Test relay manually:**

   ```bash
   # Install websocat
   brew install websocat  # macOS

   # Connect to relay
   websocat wss://relay.example.com

   # Should see connection open
   # Send test: ["REQ","test",{"kinds":[1],"limit":1}]
   ```

2. **Check relay list:**

   - Verify DNS TXT record
   - Ensure at least one relay is working
   - Add backup relays

3. **Try different network:**

   - Disable VPN
   - Try mobile hotspot
   - Test from different location

4. **Update DNS record:**
   - Remove dead relays
   - Add working alternatives
   - Wait for DNS propagation

---

### Cache Won't Clear

**Symptom:** "Clear Cache" button doesn't work

**Possible Causes:**

1. **Browser storage locked**

   - Extension updated while running
   - Browser bug
   - Storage quota exceeded

2. **Extension context stale**
   - Service worker suspended
   - Message passing failed

**Solutions:**

1. **Reload extension:**

   - Chrome: `chrome://extensions/` → Click reload icon
   - Firefox: `about:debugging` → Reload

2. **Clear browser data:**

   - Chrome: Settings → Privacy → Clear browsing data
   - Firefox: Settings → Privacy → Clear Data
   - Select "Cached files" only

3. **Reinstall extension:**

   - Remove extension
   - Close browser
   - Reinstall from store

4. **Check storage quota:**
   ```javascript
   // In extension console
   chrome.storage.local.getBytesInUse(null, (bytes) => {
     console.log("Storage used:", bytes);
   });
   ```

---

### Extension Icon Missing

**Symptom:** Can't find extension in toolbar

**Solutions:**

1. **Pin extension:**

   - Chrome: Click puzzle piece icon → Pin extension
   - Firefox: Right-click toolbar → Customize → Drag icon

2. **Extension not installed:**

   - Check extensions page
   - Reinstall if missing

3. **Extension disabled:**
   - Enable in extensions page
   - Check for error messages

---

### "Invalid Domain Format" Error

**Symptom:** Extension rejects valid-looking domain

**Causes:**

- Special characters not allowed
- Unicode/internationalized domains
- Whitespace or line breaks
- URL instead of domain (includes http://)

**Solutions:**

1. **Enter domain only:**

   ```
   ❌ https://example.com
   ❌ example.com/path
   ✅ example.com
   ```

2. **Check for hidden characters:**

   - Copy-paste may include extra spaces
   - Type manually

3. **Use punycode for international domains:**
   ```
   ❌ münchen.de
   ✅ xn--mnchen-3ya.de
   ```

---

## Advanced Debugging

### Enable Debug Logging

**Service Worker:**

```javascript
// Open service worker console: chrome://extensions → Inspect service worker
import { swLogger } from "./shared/logger.js";
swLogger.setLevel("debug"); // Shows all debug messages
```

**Viewer Page:**

```javascript
// Open viewer page console: Right-click viewer → Inspect
import { uiLogger } from "./shared/logger.js";
uiLogger.setLevel("debug");
```

### Inspect Network Traffic

**Chrome DevTools:**

1. Open viewer page
2. F12 → Network tab
3. Filter: WS (WebSocket)
4. Watch relay messages

### Check Extension Storage

```javascript
// In extension console
chrome.storage.local.get(null, (data) => {
  console.log("All stored data:", data);
});
```

### Analyze Relay Performance

```javascript
// In offscreen document console
performance.getEntriesByType("measure").filter((m) => m.name.includes("relay"));
```

---

## Getting Help

If you're still stuck:

1. **Check GitHub Issues:**

   - https://github.com/Shugur-Network/nw-extention/issues
   - Search for similar problems
   - Check closed issues too

2. **Open New Issue:**

   - Include browser version
   - Include extension version
   - Describe steps to reproduce
   - Include console errors
   - Include relevant DNS/relay info

3. **Community Support:**

   - Nostr: npub1arxyhhak4zlhjyav60s5vd9hahptq5jh070j8n0yxv6keuv53k6q05g4z8
   - Email: support@shugur.com

4. **Include in Bug Report:**
   - Browser: Chrome/Firefox + version
   - Extension version: Check `chrome://extensions/`
   - Domain trying to load
   - Error messages from console
   - DNS TXT record content
   - Relay URLs

---

## Known Issues

### Firefox-Specific

1. **Temporary add-ons removed on restart**

   - Expected behavior for manually loaded extensions
   - Install from AMO for permanent installation

2. **Slower initial load than Chrome**
   - Firefox background scripts vs Chrome offscreen
   - Working as designed, subsequent loads are fast

### Chrome-Specific

1. **Service worker suspended after 30 seconds**
   - Normal Chrome behavior for inactive extensions
   - Wakes up on navigation events

### Both Browsers

1. **Large sites (>1MB) load slowly**

   - Network bandwidth limited
   - Consider using Blossom for large media

2. **Offline mode limited**
   - Must load online first to cache
   - DNS lookups require internet

---

## Performance Tips

1. **Use fast relays:**

   - Test relay latency
   - Use geographically close relays
   - Run your own relay for best performance

2. **Optimize assets:**

   - Minimize JavaScript
   - Compress images
   - Use modern formats (WebP, AVIF)

3. **Limit asset count:**

   - Fewer events = faster loading
   - Bundle JavaScript when possible
   - Inline small CSS/JS

4. **Configure caching:**
   - Assets cached 7 days by default
   - Manifests cached 30 seconds
   - Balance freshness vs performance
