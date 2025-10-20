# Installation Guide

## Installing from Browser Stores

### Chrome Web Store

<table>
  <tr>
    <td align="center">
      <a href="https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif">
        <img src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Web Store" />
      </a>
    </td>
  </tr>
</table>

1. Click the badge above or visit the [Chrome Web Store](https://chromewebstore.google.com/detail/nostr-web-browser/hhdngjdmlabdachflbdfapkogadodkif)
2. Click "Add to Chrome"
3. Confirm the installation when prompted
4. The extension icon will appear in your browser toolbar

### Firefox Add-ons

<table>
  <tr>
    <td align="center">
      <a href="https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/">
        <img src="https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Firefox Add-ons" />
      </a>
    </td>
  </tr>
</table>

1. Click the badge above or visit [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/nostr-web-browser/)
2. Click "Add to Firefox"
3. Confirm the installation when prompted
4. The extension icon will appear in your browser toolbar

## Manual Installation (For Testing)

### Chrome

1. Download the latest release ZIP from [GitHub Releases](https://github.com/Shugur-Network/nw-extention/releases)
2. Extract the `chrome` folder from the ZIP
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top-right corner)
5. Click "Load unpacked"
6. Select the extracted `chrome` folder
7. The extension will appear in your extensions list

### Firefox

1. Download the latest release ZIP from [GitHub Releases](https://github.com/Shugur-Network/nw-extention/releases)
2. Extract the `firefox` folder from the ZIP
3. Open Firefox and navigate to `about:debugging`
4. Click "This Firefox" in the left sidebar
5. Click "Load Temporary Add-on"
6. Navigate to the extracted `firefox` folder and select any file (e.g., `manifest.json`)
7. The extension will appear in your add-ons list

**Note:** Temporary add-ons in Firefox are removed when you close the browser. For permanent installation, use the Firefox Add-ons store.

## Building from Source

If you want to build the extension yourself:

```bash
# Clone the repository
git clone https://github.com/Shugur-Network/nw-extention.git
cd nw-extention

# Install dependencies
npm install

# Build both Chrome and Firefox versions
npm run build

# Or build individually
npm run build:chrome    # Output: dist/chrome/
npm run build:firefox   # Output: dist/firefox/
```

Then follow the manual installation steps above, using the `dist/chrome/` or `dist/firefox/` folders.

## Verification

After installation, verify the extension is working:

1. Click the extension icon in your browser toolbar
2. You should see the Nostr Web Browser popup
3. Try entering a domain like `nweb.shugur.com`
4. The site should load in the viewer

## Troubleshooting Installation

### Extension doesn't appear after installation

- **Chrome:** Check `chrome://extensions/` - ensure the extension is enabled
- **Firefox:** Check `about:addons` - ensure the extension is enabled

### "Manifest file is missing or unreadable" error

- Make sure you extracted the ZIP file completely
- Ensure you're selecting the correct folder (chrome or firefox)
- Try re-downloading the release ZIP

### Chrome Web Store says "Item not found"

- The extension may be under review - try again later
- Use manual installation in the meantime

### Firefox says "This add-on could not be installed"

- Ensure you're using Firefox 112 or later
- Check Firefox's security settings allow installing add-ons

## Next Steps

- Read the [Usage Guide](USAGE.md) to learn how to browse Nostr websites
- Check the [Troubleshooting Guide](TROUBLESHOOTING.md) if you encounter issues
- Learn about the [Protocol](PROTOCOL.md) to understand how it works
