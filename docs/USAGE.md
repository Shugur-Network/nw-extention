# Usage Guide

## Quick Start

There are two ways to browse Nostr websites with this extension:

1. **Automatic Detection** (Recommended) - Just type a domain in your browser
2. **Manual Entry** - Use the extension popup

## Automatic Detection

The extension automatically detects when you navigate to a domain configured for Nostr Web.

### How it works:

1. Type any domain in your browser address bar (e.g., `nweb.shugur.com`)
2. Press Enter to navigate
3. Extension checks for `_nweb.<domain>` DNS TXT record
4. If found, automatically loads the site from Nostr relays
5. If not found, allows normal web browsing

### Flow Diagram:

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

### Example:

```
1. Type: nweb.shugur.com
2. Extension checks: _nweb.nweb.shugur.com
3. DNS record found → Loads site from Nostr
4. Site appears in the viewer
```

## Manual Entry

Use the extension popup for direct access:

1. Click the extension icon in your browser toolbar
2. Enter a domain (e.g., `nweb.shugur.com`)
3. Click "Open" or press Enter
4. Page loads in the Nostr Web viewer

**Benefits:**

- Access sites without typing in address bar
- Works even if you can't intercept navigation
- Useful for bookmarking or quick access

## Navigation

Once a site is loaded:

### Address Bar

- Type a new domain or path to navigate
- Press Enter or click the Go button
- Use `/path` for same-domain navigation (e.g., `/about`)

### Back/Forward Buttons

- Click ← to go back in history
- Click → to go forward
- History is maintained within the viewer session

### Links

- Click any link on the page to navigate
- External links (non-Nostr) open in a new tab
- Internal links navigate within the viewer

### Refresh

- Click the refresh button (🔄) to reload the current page
- Useful after clearing cache or if content seems stale

## Settings

Access settings by clicking the ⚙️ (gear) icon in the viewer:

### Default Website

Set a site to load automatically when you first open the viewer:

1. Click the ⚙️ icon
2. Enter a domain in the "Default Website" field (e.g., `nweb.shugur.com`)
3. Changes save automatically
4. Leave blank for no default site

**Use cases:**

- Set your personal homepage
- Quick access to frequently visited sites
- Testing during development

### Clear Cache

Remove all cached data to force fresh content:

1. Click the ⚙️ icon
2. Click the "Clear Cache" button
3. Confirmation message appears
4. All DNS records, events, and manifests are cleared
5. Your settings are preserved

**When to clear cache:**

- Site content appears outdated
- After a site update is published
- Troubleshooting loading issues
- Testing new content as a developer

## Browsing Tips

### Performance

**First Load:**

- May take 2-5 seconds depending on relay speed
- Extension establishes WebSocket connections
- Fetches site index and page manifest

**Subsequent Loads:**

- Much faster (100-300ms) thanks to connection pooling
- Cached content loads instantly
- Only checks for updates, doesn't re-download

### Offline Mode

The extension works offline with cached content:

- DNS records: Cached (used when offline)
- Site index: Not cached (requires connection)
- Page manifests: Cached for 30 seconds
- Assets: Cached for 7 days

**Note:** First load requires internet connection. Once cached, you can browse offline.

### Privacy

- No tracking or analytics
- All data stored locally in your browser
- Direct connection to Nostr relays (no proxy)
- Open source - verify yourself!

## Example Sites

Try these Nostr Web sites:

- `nweb.shugur.com` - Demo site showcasing the technology
- More sites coming soon!

## Common Workflows

### Daily Browsing

```
1. Type domain in address bar
2. Site loads automatically
3. Browse normally with links
4. Use back/forward buttons as needed
```

### Developer Testing

```
1. Publish your site to Nostr
2. Configure DNS TXT record
3. Open extension popup
4. Enter your domain
5. Clear cache if you update content
6. Refresh to see changes
```

### Troubleshooting

```
1. Site won't load? Check DNS TXT record
2. Old content? Clear cache via settings
3. Still issues? Check console logs
4. Report bugs on GitHub
```

## Next Steps

- Learn about the [Architecture](ARCHITECTURE.md)
- Read the [Protocol Specification](PROTOCOL.md)
- Check [Troubleshooting](TROUBLESHOOTING.md) for common issues
- See [Security Model](SECURITY.md) to understand how it's protected
