# Nostr Web Extension

Browse decentralized websites on Nostr - A censorship-resistant, verifiable, permanent web.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hhdngjdmlabdachflbdfapkogadodkif?label=Chrome&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif)
[![Firefox Add-on](https://img.shields.io/amo/v/nostr-web-browser?label=Firefox&logo=firefox&logoColor=white&color=FF7139)](https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/)
[![Chrome Users](https://img.shields.io/chrome-web-store/users/hhdngjdmlabdachflbdfapkogadodkif?label=Chrome%20Users&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif)
[![Firefox Users](https://img.shields.io/amo/users/nostr-web-browser?label=Firefox%20Users&logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🚀 Quick Start

<table>
  <tr>
    <td align="center" width="50%">
      <a href="https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif">
        <img src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Web Store" />
      </a>
    </td>
    <td align="center" width="50%">
      <a href="https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/">
        <img src="https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Firefox Add-ons" />
      </a>
    </td>
  </tr>
</table>

### Usage

1. **Automatic Detection:** Just type any domain in your browser (e.g., `nweb.shugur.com`)
2. **Manual Entry:** Click extension icon → Enter domain → Press Enter
3. **Browse:** Navigate links, use back/forward, and enjoy decentralized web!

## Security

The extension implements multiple security layers:

1. **Author Pinning** - DNS TXT record pins site publisher's public key
2. **Subresource Integrity** - SHA256 verification for JavaScript
3. **Sandboxed Rendering** - Isolated execution environment
4. **Rate Limiting** - Protection against DoS attacks

## 🏗️ How It Works

```
User types domain → DNS lookup → Fetch from Nostr relays → Verify integrity → Render in sandbox
```

1. Check DNS TXT record at `_nweb.<domain>` for publisher pubkey and relay list
2. Query relays for entrypoint (kind 11126) pointing to site index
3. Fetch site index (kind 31126) listing all page manifests
4. Fetch page manifest (kind 1126) for current route
5. Fetch all assets (kind 1125) - HTML, CSS, JS, images, etc.
6. Verify author signatures and JavaScript integrity (SRI)
7. Assemble HTML and render in sandboxed iframe

## 🚀 Performance

- **First-EOSE Strategy** - Returns after fastest relay (200-500ms typical)
- **Connection Pooling** - Persistent WebSocket connections
- **Smart Caching** - 7-day asset cache, 30-second manifest cache
- **Event Deduplication** - Filters duplicates from multiple relays
- **Parallel Fetching** - Queries all relays simultaneously

## 🛠️ Development

```bash
# Setup
git clone https://github.com/Shugur-Network/nw-extention.git
cd nw-extention
npm install

# Build
npm run build            # Build both browsers
npm run build:chrome     # Chrome only
npm run build:firefox    # Firefox only

# Test
npm test                 # Run test suite
npm run validate         # Validate structure

# Output: dist/chrome/ and dist/firefox/
```

## 📋 Project Structure

```
nw-extention/
├── src/
│   ├── chrome/              # Chrome-specific (service worker + offscreen)
│   ├── firefox/             # Firefox-specific (background script)
│   ├── shared/              # Shared modules (logger, constants, errors)
│   └── ui/                  # UI components (popup, viewer, settings, sandbox)
├── test/                    # Test suite
├── scripts/                 # Build scripts
└── public/                  # Static assets
```

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new code
4. Submit a Pull Request

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

## 🔗 Links

- **Website:** https://nweb.shugur.com
- **GitHub:** https://github.com/Shugur-Network/nw-extention
- **Issues:** https://github.com/Shugur-Network/nw-extention/issues
- **Chrome Store:** https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif
- **Firefox Add-ons:** https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/Shugur-Network/nw-extention/issues)
- **Email:** support@shugur.com
