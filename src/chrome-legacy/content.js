/**
 * @fileoverview Content page renderer
 * Renders Nostr Web pages with proper CSP and blob: URL support
 * Production-grade implementation following MetaMask patterns
 */

import { contentLogger as logger } from "./shared/logger.js";

// Track blob URLs for cleanup
const blobURLs = new Set();

/**
 * Create a blob URL and track it for cleanup
 * @param {string} text - Content text
 * @param {string} mime - MIME type
 * @returns {string} Blob URL
 */
function createBlobURL(text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  blobURLs.add(url);
  return url;
}

/**
 * Cleanup all tracked blob URLs
 */
function cleanupBlobURLs() {
  logger.debug(`Cleaning up ${blobURLs.size} blob URLs`);
  blobURLs.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.warn("Failed to revoke blob URL", e);
    }
  });
  blobURLs.clear();
}

/**
 * Render a Nostr Web page bundle
 * @param {object} bundle - Page bundle with html, css, js arrays
 */
function renderBundle(bundle) {
  try {
    // Cleanup previous render
    cleanupBlobURLs();

    // Extract content from bundle
    let html =
      bundle.html ||
      "<!doctype html><html><head></head><body><p>Empty page</p></body></html>";
    const cssTexts = Array.isArray(bundle.css) ? bundle.css : [];
    const jsTexts = Array.isArray(bundle.js) ? bundle.js : [];

    logger.info("Rendering bundle", {
      htmlLength: html.length,
      cssCount: cssTexts.length,
      jsCount: jsTexts.length,
    });

    // CRITICAL: Remove ALL CSP meta tags from HTML to avoid conflicts
    html = html.replace(
      /<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi,
      ""
    );

    // Inject our own CSP that allows blob: URLs
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' blob:; style-src 'self' blob: 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self' https: wss:;">`;

    // Insert CSP at the beginning of <head>
    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${csp}`);
    } else if (html.includes("<head ")) {
      html = html.replace(/<head\s/, (match) => `${match}>${csp}<`);
    } else {
      // No head tag, add one
      html = html.replace("<html>", `<html><head>${csp}</head>`);
    }

    // Write the HTML with our CSP
    document.open();
    document.write(html);
    document.close();

    const head = document.head || document.getElementsByTagName("head")[0];
    const body = document.body || document.getElementsByTagName("body")[0];

    if (!head || !body) {
      throw new Error("Invalid HTML structure: missing head or body");
    }

    // Inject CSS as blob URLs
    cssTexts.forEach((css, index) => {
      if (!css) return;

      try {
        const href = createBlobURL(css, "text/css");
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute("data-nweb-css", index);
        head.appendChild(link);
        logger.debug(`Injected CSS ${index}`, { length: css.length });
      } catch (e) {
        logger.error(`Failed to inject CSS ${index}`, e);
      }
    });

    // Inject JS as blob URLs (works in MV3!)
    jsTexts.forEach((js, index) => {
      if (!js) return;

      try {
        const src = createBlobURL(js, "text/javascript");
        const script = document.createElement("script");
        script.type = "module";
        script.src = src;
        script.setAttribute("data-nweb-js", index);
        body.appendChild(script);
        logger.debug(`Injected JS ${index}`, { length: js.length });
      } catch (e) {
        logger.error(`Failed to inject JS ${index}`, e);
      }
    });

    logger.info("Bundle rendered successfully");
  } catch (e) {
    logger.error("Failed to render bundle", e);
    document.body.innerHTML = `
      <div style="padding: 40px; font-family: system-ui; color: #e45757;">
        <h1>Render Error</h1>
        <pre style="background: #f5f5f5; padding: 20px; border-radius: 8px; overflow: auto;">${
          e?.stack || e
        }</pre>
      </div>
    `;
  }
}

/**
 * Get bundle from URL parameters (for direct navigation)
 */
const params = new URLSearchParams(window.location.search);
const bundleParam = params.get("bundle");

if (bundleParam) {
  try {
    const bundle = JSON.parse(decodeURIComponent(bundleParam));
    renderBundle(bundle);
  } catch (e) {
    logger.error("Failed to parse bundle from URL", e);
    document.body.innerHTML = `
      <div style="padding: 40px; font-family: system-ui; color: #e45757;">
        <h1>Load Error</h1>
        <p>Failed to parse page data from URL</p>
        <pre style="background: #f5f5f5; padding: 20px; border-radius: 8px; overflow: auto;">${
          e?.stack || e
        }</pre>
      </div>
    `;
  }
}

/**
 * Render error page
 * @param {object} error - Error object with message and help
 */
function renderError(error) {
  const message = error.message || "An error occurred";
  const help = error.help || "Please try again later";

  document.body.innerHTML = `
    <div style="
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      color: #0a0a0a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
    ">
      <div style="
        text-align: center;
        max-width: 500px;
        background: #fafafa;
        padding: 48px 40px;
        border-radius: 12px;
        border: 1px solid #e8e8e8;
      ">
        <div style="
          width: 64px;
          height: 64px;
          margin: 0 auto 24px;
        ">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h1 style="
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 16px;
          letter-spacing: -0.02em;
          color: #0a0a0a;
        ">Failed to Load</h1>
        <div style="
          background: #ffffff;
          padding: 16px 20px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 14px;
          word-break: break-word;
          border: 1px solid #e8e8e8;
          color: #d32f2f;
          font-weight: 500;
        ">${message}</div>
        <div style="
          font-size: 14px;
          color: #666;
          line-height: 1.6;
        ">
          ${help}
        </div>
      </div>
    </div>
  `;
}

/**
 * Listen for messages from parent frame
 */
window.addEventListener("message", (ev) => {
  // Security: validate origin if needed
  // For now, we trust all messages since content.html is only loaded by our extension

  if (ev.data?.cmd === "renderBundle") {
    logger.debug("Received renderBundle message");
    renderBundle(ev.data.bundle || {});
  } else if (ev.data?.cmd === "renderError") {
    logger.debug("Received renderError message");
    renderError(ev.data.error || {});
  }
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  cleanupBlobURLs();
});

logger.info("Content renderer initialized");
