/**
 * @fileoverview Nostr Web Browser UI
 * Production-grade viewer following MetaMask patterns
 */

import { CONFIG, ERROR_MESSAGES } from "./shared/constants.js";
import { uiLogger as logger } from "./shared/logger.js";
import { validateAndParseURL } from "./shared/validation.js";
import { normalizeError } from "./shared/errors.js";
import { bookmarks } from "./shared/bookmarks.js";
import { performanceMonitor } from "./shared/performance.js";

// DOM elements
const urlInput = document.getElementById("urlInput");
const goBtn = document.getElementById("goBtn");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const reloadBtn = document.getElementById("reloadBtn");
const bookmarkBtn = document.getElementById("bookmarkBtn");
const settingsBtn = document.getElementById("settingsBtn");
const statusEl = document.getElementById("status");
const frameContainer = document.getElementById("contentFrame");
const bookmarksDropdown = document.getElementById("bookmarksDropdown");
const bookmarksListDropdown = document.getElementById("bookmarksListDropdown");
const bookmarksSearchInput = document.getElementById("bookmarksSearchInput");
const closeBookmarksDropdown = document.getElementById("closeBookmarksDropdown");
const addBookmarkFromDropdownBtn = document.getElementById("addBookmarkFromDropdownBtn");
const manageBookmarksBtn = document.getElementById("manageBookmarksBtn");

// Sandboxed iframe reference
let sandboxFrame = null;
let sandboxReady = false;
let sandboxReadyResolve = null;

// Current site state
let currentDomain = null;
let currentRoute = null;

// Navigation state
const navigationHistory = [];
let historyIndex = -1;

// Set up message listener for sandbox ready event BEFORE creating iframe
window.addEventListener("message", (event) => {
  if (event.data?.cmd === "sandboxReady") {
    sandboxReady = true;
    if (sandboxReadyResolve) {
      sandboxReadyResolve();
      sandboxReadyResolve = null;
    }
    logger.info("Sandbox ready");
  } else if (event.data?.cmd === "navigate") {
    // Handle navigation request from sandboxed iframe
    const route = event.data.route;
    logger.info("Navigation requested", { route });

    if (currentDomain) {
      // Navigate to the new route on the same domain
      // loadSite expects "domain/route" format
      const fullPath =
        route === "/" ? currentDomain : `${currentDomain}${route}`;
      logger.debug("Navigating to route", {
        fullPath,
        domain: currentDomain,
        route,
      });
      loadSite(fullPath);
    } else {
      logger.warn("Navigation requested but currentDomain is not set");
    }
  }
});

/**
 * Assemble complete HTML document with inline CSS and JS
 * This HTML can have inline scripts because it renders in a sandboxed page!
 * @param {object} bundle - Bundle with html, css[], js[]
 * @returns {string} Complete HTML document
 */
function assembleHTML(bundle) {
  const startTime = performance.now();

  let html =
    bundle.html || "<!DOCTYPE html><html><head></head><body></body></html>";
  const cssTexts = Array.isArray(bundle.css) ? bundle.css : [];
  const jsTexts = Array.isArray(bundle.js) ? bundle.js : [];

  // DEBUG: Log what we received
  logger.debug("Assembling HTML", {
    htmlSize: html.length,
    cssCount: cssTexts.length,
    jsCount: jsTexts.length,
    cssSizes: cssTexts.map((css, i) => ({ index: i, size: css.length })),
  });

  // Remove all external script tags from HTML (they should be in the js[] bundle)
  // This is necessary because sandboxed iframes without allow-same-origin cannot load external resources
  // Optimize: Use a single regex that matches both self-closing and paired tags
  const scriptRemovalStart = performance.now();
  html = html.replace(
    /<script[^>]*\ssrc=["'][^"']*["'][^>]*>(?:<\/script>)?/gi,
    ""
  );
  logger.debug(
    `Script removal took ${performance.now() - scriptRemovalStart}ms`
  );

  // Build inline CSS
  const cssInline = cssTexts
    .map((css, i) => `<style data-nweb-css="${i}">${css}</style>`)
    .join("\n");

  // Build inline JS
  const jsInline = jsTexts
    .map((js, i) => `<script type="module" data-nweb-js="${i}">${js}</script>`)
    .join("\n");

  // Add navigation handler that will persist after document.write
  // Note: Firefox's sandbox.js will detect and skip if this already exists
  const navHandler = `
    <script data-nweb-nav>
    (function() {
      // Navigation handler for internal links
      document.addEventListener("click", (e) => {
        const link = e.target.closest("a");
        if (!link) return;

        const href = link.getAttribute("href");
        if (!href) return;

        // Check if it's an internal link
        if (
          href.startsWith("http://") ||
          href.startsWith("https://") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("#")
        ) {
          return;
        }

        e.preventDefault();

        // Extract route
        let route = href;
        if (route.endsWith(".html")) {
          route = route.replace(/\\.html$/, "");
        }
        if (!route.startsWith("/")) {
          route = "/" + route;
        }
        if (route === "/index") {
          route = "/";
        }

        // Internal navigation detected
        window.parent.postMessage({ cmd: "navigate", route: route }, "*");
      }, true);
      
      // Navigation handler loaded - set flag for Firefox sandbox
      window._nwebNavHandlerLoaded = true;
    })();
    </script>
  `;

  // Inject CSS into <head>
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${cssInline}\n</head>`);
  } else if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n${cssInline}`);
  }

  // Inject JS and navigation handler into <body>
  if (html.includes("</body>")) {
    html = html.replace("</body>", `${jsInline}\n${navHandler}\n</body>`);
  } else if (html.includes("<body>")) {
    html = html.replace("<body>", `<body>\n${jsInline}\n${navHandler}`);
  }

  const totalTime = performance.now() - startTime;
  logger.debug(`assembleHTML completed in ${totalTime.toFixed(2)}ms`);

  return html;
}

/**
 * Update UI status message
 * @param {string} text - Status message
 * @param {boolean} isError - Whether this is an error message
 */
function setStatus(text, isError = false) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (isError ? " err" : "");

  if (text && !isError) {
    setTimeout(() => setStatus(""), CONFIG.STATUS_TIMEOUT);
  }
}

/**
 * Update navigation button states based on history
 */
function updateNavigationButtons() {
  backBtn.disabled = historyIndex <= 0;
  forwardBtn.disabled =
    historyIndex < 0 || historyIndex >= navigationHistory.length - 1;
  reloadBtn.disabled = historyIndex < 0;
}

/**
 * Update bookmark button state based on current page
 */
async function updateBookmarkButton() {
  if (!currentDomain) {
    bookmarkBtn.disabled = true;
    bookmarkBtn.querySelector("use").setAttribute("href", "#icon-bookmark");
    bookmarkBtn.title = "Bookmarks";
    return;
  }

  const currentUrl = `${currentDomain}${currentRoute}`;
  const isBookmarked = await bookmarks.has(currentUrl);

  bookmarkBtn.disabled = false;
  bookmarkBtn.title = "Bookmarks";
  
  if (isBookmarked) {
    bookmarkBtn.querySelector("use").setAttribute("href", "#icon-bookmark-filled");
    bookmarkBtn.style.color = "#ff9500"; // Orange color for bookmarked
  } else {
    bookmarkBtn.querySelector("use").setAttribute("href", "#icon-bookmark");
    bookmarkBtn.style.color = "";
  }
}

/**
 * Show bookmarks dropdown when clicking bookmark icon
 */
async function showBookmarksPanel() {
  await showBookmarksDropdown();
}

/**
 * Show bookmarks dropdown
 */
async function showBookmarksDropdown() {
  bookmarksDropdown.classList.add("show");
  await loadBookmarksDropdown();
  bookmarksSearchInput.value = "";
  bookmarksSearchInput.focus();
}

/**
 * Hide bookmarks dropdown
 */
function hideBookmarksDropdown() {
  bookmarksDropdown.classList.remove("show");
}

/**
 * Load bookmarks into dropdown
 */
async function loadBookmarksDropdown(searchQuery = "") {
  try {
    await bookmarks.init();
    
    const allBookmarks = await bookmarks.getAll({
      sortBy: "createdAt",
      ascending: false,
      search: searchQuery,
    });

    if (allBookmarks.length === 0) {
      bookmarksListDropdown.innerHTML = `
        <div class="bookmark-empty">
          <div>${searchQuery ? "No results found" : "No bookmarks yet"}</div>
        </div>
      `;
      return;
    }

    bookmarksListDropdown.innerHTML = "";

    for (const bookmark of allBookmarks) {
      const item = document.createElement("div");
      item.className = "bookmark-item-dropdown";
      
      const firstLetter = (bookmark.title || bookmark.host || "N")[0].toUpperCase();
      
      item.innerHTML = `
        <div class="bookmark-item-favicon">${bookmark.favicon ? `<img src="${bookmark.favicon}" width="24" height="24" style="border-radius: 6px;">` : firstLetter}</div>
        <div class="bookmark-item-info">
          <div class="bookmark-item-title">${escapeHtml(bookmark.title || bookmark.host)}</div>
          <div class="bookmark-item-url">${escapeHtml(bookmark.host)}${escapeHtml(bookmark.route || "")}</div>
        </div>
      `;

      item.addEventListener("click", () => {
        loadSite(bookmark.url);
        hideBookmarksDropdown();
      });

      bookmarksListDropdown.appendChild(item);
    }
  } catch (e) {
    logger.error("Failed to load bookmarks dropdown", { error: e.message });
    bookmarksListDropdown.innerHTML = `
      <div class="bookmark-empty">
        <div>Failed to load</div>
      </div>
    `;
  }
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get user-friendly error message
 * @param {Error} error
 * @returns {{message: string, help: string}}
 */
function getUserFriendlyError(error) {
  const msg = error.message || String(error);

  // DNS/Bootstrap errors
  if (
    msg.includes("DNS") ||
    msg.includes("_nweb") ||
    msg.includes("TXT record") ||
    error.code === "DNS_ERROR"
  ) {
    return {
      message: "Domain not configured for Nostr Web",
      help: "This domain doesn't have a _nweb DNS TXT record set up.",
    };
  }

  // Site not published errors
  if (msg.includes("Site index") && msg.includes("not found")) {
    return {
      message: "Site not published",
      help: "This site hasn't been published to Nostr yet, or the relays are offline.",
    };
  }

  // Page/route not found errors
  if (
    (msg.includes("Page manifest") && msg.includes("not found")) ||
    msg.includes("404: Page not found")
  ) {
    const routeMatch = msg.match(/route "([^"]+)"/);
    const route = routeMatch ? routeMatch[1] : "this route";
    return {
      message: `Page not found: ${route}`,
      help: msg.includes("Available routes:")
        ? msg.substring(msg.indexOf("Available routes:"))
        : "Try visiting the home page (/) instead.",
    };
  }

  // Asset fetching errors
  if (msg.includes("Failed to fetch") && msg.includes("asset")) {
    return {
      message: "Site assets unavailable",
      help: "Some site files couldn't be loaded from the relays. They may have been deleted or the relays are offline.",
    };
  }

  // Security/SRI errors
  if (msg.includes("Security:") || msg.includes("SRI")) {
    return {
      message: "Security verification failed",
      help: "This site failed security checks. The content may have been tampered with.",
    };
  }

  // Relay connection errors
  if (msg.includes("relay") || error.code === "RELAY_ERROR") {
    return {
      message: "Unable to connect to Nostr relays",
      help: "The Nostr relays for this site appear to be unreachable.",
    };
  }

  // Generic manifest errors
  if (msg.includes("manifest") || error.code === "MANIFEST_ERROR") {
    return {
      message: "Site configuration not found",
      help: "The site's manifest could not be found on the relays.",
    };
  }

  // Timeout errors
  if (msg.includes("timeout") || error.code === "TIMEOUT_ERROR") {
    return {
      message: "Request timed out",
      help: "The request took too long. The relays may be slow or unreachable.",
    };
  }

  // Validation errors
  if (error.code === "VALIDATION_ERROR") {
    return {
      message: "Invalid input",
      help: msg,
    };
  }

  // Generic fallback
  return {
    message: "Failed to load page",
    help: msg,
  };
}

/**
 * Initialize sandboxed iframe for rendering
 */
function initSandbox() {
  sandboxFrame = document.createElement("iframe");
  sandboxFrame.id = "sandboxFrame";
  sandboxFrame.src = chrome.runtime.getURL("sandbox.html");
  // Note: allow-same-origin is removed for security (prevents sandbox escape)
  // The content can still communicate via postMessage
  sandboxFrame.sandbox = "allow-scripts allow-forms allow-popups allow-modals";
  sandboxFrame.style.cssText =
    "width: 100%; height: 100%; border: none; display: block;";

  frameContainer.innerHTML = ""; // Clear placeholder
  frameContainer.appendChild(sandboxFrame);

  logger.info("Sandbox iframe created");
}

/**
 * Wait for sandbox to be ready
 * @returns {Promise<void>}
 */
function waitForSandbox() {
  return new Promise((resolve) => {
    if (sandboxReady) {
      resolve();
      return;
    }

    // Store resolve function for the global message listener
    sandboxReadyResolve = resolve;
  });
}

/**
 * Load a Nostr Web site
 * @param {string} input - URL input
 * @param {boolean} pushHistory - Whether to add to history
 */
async function loadSite(input, pushHistory = true) {
  let target;

  // Validate and parse URL
  try {
    target = validateAndParseURL(input);
  } catch (e) {
    logger.warn("URL validation failed", e);
    const friendlyError = getUserFriendlyError(e);
    setStatus(`✗ ${friendlyError.message}`, true);
    return;
  }

  logger.info("Loading site", target);
  setStatus("Loading…");

  // Start performance tracking
  const loadStartTime = performance.now();

  try {
    // Request content from service worker
    const response = await chrome.runtime.sendMessage({
      cmd: "nw.load",
      host: target.host,
      route: target.route,
    });

    if (!response?.ok) {
      throw new Error(response?.error || ERROR_MESSAGES.LOAD_FAILED);
    }

    logger.info("Content loaded from service worker");

    // Ensure sandbox is ready
    await waitForSandbox();

    // Assemble full HTML with inline scripts (works in sandbox!)
    const fullHTML = assembleHTML(response.result.doc);

    logger.debug("HTML assembled for rendering", {
      host: target.host,
      route: target.route,
      htmlLength: fullHTML.length,
      preview: fullHTML.substring(0, 200),
    });

    // Send to sandboxed iframe - inline scripts will work!
    sandboxFrame.contentWindow.postMessage(
      {
        cmd: "render",
        html: fullHTML,
      },
      "*"
    );

    logger.debug("Render command sent to sandbox", {
      host: target.host,
      route: target.route,
    });

    // Update current site state
    currentDomain = target.host;
    currentRoute = target.route;

    // Update navigation history
    if (pushHistory) {
      // Remove forward history when navigating to new page
      navigationHistory.splice(historyIndex + 1);
      navigationHistory.push({ host: target.host, route: target.route });

      // Limit history size
      if (navigationHistory.length > CONFIG.MAX_HISTORY_SIZE) {
        navigationHistory.shift();
        historyIndex--;
      }

      historyIndex = navigationHistory.length - 1;
    }

    // Update UI
    urlInput.value = `${target.host}${target.route}`;
    setStatus(`✓ Loaded ${target.host}${target.route}`);
    updateNavigationButtons();
    await updateBookmarkButton();

    // Record successful load performance
    const loadEndTime = performance.now();
    const totalTime = loadEndTime - loadStartTime;
    await performanceMonitor.recordLoad({
      url: `${target.host}${target.route}`,
      host: target.host,
      route: target.route,
      startTime: loadStartTime,
      endTime: loadEndTime,
      totalTime: totalTime,
      success: true,
    });

    logger.info("Site loaded successfully", {
      historyIndex,
      historyLength: navigationHistory.length,
      loadTime: Math.round(totalTime) + "ms",
    });
  } catch (e) {
    logger.error("Failed to load site", e);
    const normalized = normalizeError(e);
    const friendlyError = getUserFriendlyError(normalized);
    setStatus(`✗ ${friendlyError.message}`, true);

    // Show error in sandbox iframe
    if (sandboxFrame) {
      const errorHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #ffffff;
              color: #0a0a0a;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              margin: 0;
              padding: 20px;
            }
            .error-container {
              text-align: center;
              max-width: 500px;
              background: #fafafa;
              padding: 48px 40px;
              border-radius: 12px;
              border: 1px solid #e8e8e8;
            }
            .error-icon {
              width: 64px;
              height: 64px;
              margin: 0 auto 24px;
            }
            .error-icon svg {
              width: 100%;
              height: 100%;
            }
            h1 {
              font-size: 20px;
              font-weight: 600;
              margin-bottom: 16px;
              letter-spacing: -0.02em;
              color: #0a0a0a;
            }
            .error-message {
              background: #ffffff;
              padding: 16px 20px;
              border-radius: 8px;
              margin: 20px 0;
              font-size: 14px;
              word-break: break-word;
              border: 1px solid #e8e8e8;
              color: #d32f2f;
              font-weight: 500;
            }
            .error-help {
              font-size: 14px;
              color: #666;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <div class="error-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <h1>Failed to Load</h1>
            <div class="error-message">${friendlyError.message}</div>
            <div class="error-help">${friendlyError.help}</div>
          </div>
        </body>
        </html>
      `;

      sandboxFrame.contentWindow.postMessage(
        { cmd: "render", html: errorHTML },
        "*"
      );
    }

    // Record failed load performance
    const loadEndTime = performance.now();
    const totalTime = loadEndTime - loadStartTime;
    await performanceMonitor.recordLoad({
      url: `${target.host}${target.route}`,
      host: target.host,
      route: target.route,
      startTime: loadStartTime,
      endTime: loadEndTime,
      totalTime: totalTime,
      success: false,
      error: e.message,
    });

    updateNavigationButtons();
  }
}

/**
 * Navigate relative to current position in history
 * @param {number} delta - -1 for back, +1 for forward
 */
function navigateRelative(delta) {
  const newIndex = historyIndex + delta;

  if (newIndex < 0 || newIndex >= navigationHistory.length) {
    logger.warn("Navigation out of bounds", {
      newIndex,
      historyLength: navigationHistory.length,
    });
    return;
  }

  historyIndex = newIndex;
  const entry = navigationHistory[historyIndex];
  urlInput.value = `${entry.host}${entry.route}`;
  loadSite(urlInput.value, false);
}

/**
 * Reload current page
 */
function reload() {
  if (historyIndex < 0) {
    logger.warn("No page to reload");
    return;
  }

  const entry = navigationHistory[historyIndex];
  logger.info("Reloading page", entry);
  loadSite(`${entry.host}${entry.route}`, false);
}

// Event listeners
goBtn.addEventListener("click", () => {
  const input = urlInput.value.trim();
  if (input) {
    loadSite(input);
  }
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = urlInput.value.trim();
    if (input) {
      loadSite(input);
    }
  }
});

backBtn.addEventListener("click", () => navigateRelative(-1));
forwardBtn.addEventListener("click", () => navigateRelative(1));
reloadBtn.addEventListener("click", reload);

// Bookmark button - show bookmarks dropdown
bookmarkBtn.addEventListener("click", showBookmarksPanel);

// Bookmarks dropdown
closeBookmarksDropdown.addEventListener("click", hideBookmarksDropdown);
bookmarksSearchInput.addEventListener("input", (e) => {
  loadBookmarksDropdown(e.target.value);
});

// Add bookmark button in dropdown
addBookmarkFromDropdownBtn.addEventListener("click", async () => {
  if (!currentDomain) {
    alert("Please load a page first before bookmarking.");
    return;
  }

  const currentUrl = `${currentDomain}${currentRoute}`;
  const isBookmarked = await bookmarks.has(currentUrl);

  if (isBookmarked) {
    alert("This page is already bookmarked!");
    return;
  }

  try {
    const bookmark = {
      url: currentUrl,
      host: currentDomain,
      route: currentRoute,
      title: document.title || currentDomain,
      createdAt: Date.now(),
      lastVisited: Date.now(),
    };
    
    await bookmarks.add(bookmark);
    setStatus(`✓ Bookmarked`);
    logger.info("Bookmark added from dropdown", { url: currentUrl });
    
    // Update button state and reload dropdown
    await updateBookmarkButton();
    await loadBookmarksDropdown();
  } catch (e) {
    logger.error("Failed to add bookmark", e);
    alert(`Failed to add bookmark: ${e.message}`);
  }
});

manageBookmarksBtn.addEventListener("click", () => {
  const bookmarksUrl = chrome.runtime.getURL("bookmarks.html");
  chrome.tabs.create({ url: bookmarksUrl });
  hideBookmarksDropdown();
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!bookmarksDropdown.contains(e.target) && e.target !== bookmarkBtn && !bookmarkBtn.contains(e.target)) {
    hideBookmarksDropdown();
  }
});

// Settings button
settingsBtn.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("settings.html");
});

// Initialize sandbox iframe
initSandbox();

// Initialize
updateNavigationButtons();

// Handle deep linking via URL parameter or default website
const urlParam = new URLSearchParams(window.location.search).get("url");
if (urlParam) {
  logger.info("Loading from URL parameter", { url: urlParam });
  urlInput.value = urlParam;
  loadSite(urlParam);
} else {
  // Check for default website setting
  chrome.storage.local.get(["nweb_default_site"], (result) => {
    if (result.nweb_default_site) {
      logger.info("Loading default website", {
        site: result.nweb_default_site,
      });
      urlInput.value = result.nweb_default_site;
      loadSite(result.nweb_default_site);
    } else {
      urlInput.focus();
    }
  });
}

logger.info("Viewer initialized");
