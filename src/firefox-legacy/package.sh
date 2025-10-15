#!/bin/bash

# Nostr Web Extension - Firefox Package Script
# Creates Firefox Add-ons ready ZIP file

set -e

VERSION="0.9.6"
PACKAGE_NAME="nostr-web-extension-firefox-v${VERSION}.zip"

echo "🦊 Packaging Nostr Web Extension v${VERSION} for Firefox"
echo ""

# Remove old package if exists
if [ -f "$PACKAGE_NAME" ]; then
    echo "🗑️  Removing old package..."
    rm "$PACKAGE_NAME"
fi

# Create ZIP with Firefox-specific files
# Note: sw.js and offscreen.js are excluded (Chrome-only)
echo "📁 Creating Firefox ZIP archive..."
zip -r "$PACKAGE_NAME" \
    manifest.json \
    background.js \
    popup.html \
    popup.js \
    viewer.html \
    viewer.js \
    settings.html \
    settings.js \
    sandbox.html \
    sandbox.js \
    renderer.html \
    renderer.js \
    content.html \
    content.js \
    shared/ \
    icons/ \
    screenshots/ \
    -x "*.DS_Store" "*/.*" "sw.js" "offscreen.*" "*.sh" "*.zip" "package.json" "package-lock.json" "node_modules/*" "test/*" "build-prod.js" "generate-*.js" "generate-*.cjs" "*.svg" "validate.js" "prefetch.js" \
    > /dev/null

# Get file size
SIZE=$(du -h "$PACKAGE_NAME" | cut -f1)

echo ""
echo "✅ Firefox package created successfully!"
echo ""
echo "📦 File: $PACKAGE_NAME"
echo "📊 Size: $SIZE"
echo ""
echo "📋 Contents:"
unzip -l "$PACKAGE_NAME" | tail -n +4 | head -n -2
echo ""
echo "🎯 Next steps:"
echo "   1. Test locally:"
echo "      • Open Firefox"
echo "      • Go to: about:debugging#/runtime/this-firefox"
echo "      • Click 'Load Temporary Add-on'"
echo "      • Select manifest.json from extension-firefox/ folder"
echo ""
echo "   2. Upload to Firefox Add-ons:"
echo "      • https://addons.mozilla.org/developers/"
echo "      • Submit this ZIP file"
echo ""
echo "   3. Privacy Policy:"
echo "      • https://github.com/Shugur-Network/nostr-web/blob/main/PRIVACY.md"
echo ""
echo "📝 Firefox Notes:"
echo "   • Uses background.js (single unified script)"
echo "   • WebSocket connections run directly in background"
echo "   • Extension ID: nostr-web@shugur.com"
echo "   • Minimum version: Firefox 109.0+"
echo "   • Uses browser.* API with chrome.* polyfill"
echo ""
