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
const menuBtn = document.getElementById("menuBtn");
const progressBar = document.getElementById("progressBar");
const contentWrapper = document.getElementById("contentWrapper");
const tabsContainer = document.getElementById("tabsContainer");
const newTabBtn = document.getElementById("newTabBtn");
const menuDropdown = document.getElementById("menuDropdown");
const menuHome = document.getElementById("menuHome");
const menuHistory = document.getElementById("menuHistory");
const menuBookmarks = document.getElementById("menuBookmarks");
const menuSettings = document.getElementById("menuSettings");
const bookmarksDropdown = document.getElementById("bookmarksDropdown");
const bookmarksListDropdown = document.getElementById("bookmarksListDropdown");
const bookmarksSearchInput = document.getElementById("bookmarksSearchInput");
const closeBookmarksDropdown = document.getElementById("closeBookmarksDropdown");
const addBookmarkFromDropdownBtn = document.getElementById("addBookmarkFromDropdownBtn");
const manageBookmarksBtn = document.getElementById("manageBookmarksBtn");

/**
 * Tab class - Represents a single browser tab
 */
class Tab {
  constructor(id) {
    this.id = id;
    this.title = "New Tab";
    this.url = null;
    this.domain = null;
    this.route = null;
    this.sandboxFrame = null;
    this.sandboxReady = false;
    this.sandboxReadyResolve = null;
    this.navigationHistory = [];
    this.historyIndex = -1;
    this.element = null;
  }
}

/**
 * TabManager class - Manages all browser tabs
 */
class TabManager {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.nextTabId = 1;
  }

  createTab(url = null) {
    const tab = new Tab(this.nextTabId++);
    this.tabs.push(tab);
    this.createTabElement(tab);
    this.createTabContent(tab);
    
    if (url) {
      this.switchToTab(tab.id);
      loadSiteInTab(tab, url);
    } else {
      this.switchToTab(tab.id);
    }
    
    logger.info("Tab created", { id: tab.id, url });
    return tab;
  }

  createTabElement(tab) {
    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.dataset.tabId = tab.id;
    
    tabEl.innerHTML = `
      <span class="tab-title">${tab.title}</span>
      <button class="tab-close" title="Close tab">×</button>
    `;
    
    const closeBtn = tabEl.querySelector(".tab-close");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });
    
    tabEl.addEventListener("click", () => {
      this.switchToTab(tab.id);
    });
    
    tabsContainer.appendChild(tabEl);
    tab.element = tabEl;
  }

  createTabContent(tab) {
    // Create sandbox iframe for this tab
    const frame = document.createElement("iframe");
    frame.id = `sandbox-${tab.id}`;
    frame.src = "sandbox.html";
    frame.sandbox = "allow-scripts";
    frame.className = "content-frame hidden";
    frame.style.width = "100%";
    frame.style.height = "100%";
    
    contentWrapper.appendChild(frame);
    tab.sandboxFrame = frame;
    
    // Set up message listener for this tab's sandbox
    const messageHandler = (event) => {
      if (event.source !== frame.contentWindow) return;
      
      if (event.data?.cmd === "sandboxReady") {
        tab.sandboxReady = true;
        if (tab.sandboxReadyResolve) {
          tab.sandboxReadyResolve();
          tab.sandboxReadyResolve = null;
        }
        logger.info("Sandbox ready for tab", { tabId: tab.id });
      } else if (event.data?.cmd === "navigate") {
        if (tab.id === this.activeTabId && tab.domain) {
          const route = event.data.route;
          const fullPath = route === "/" ? tab.domain : `${tab.domain}${route}`;
          loadSiteInTab(tab, fullPath);
        }
      }
    };
    
    window.addEventListener("message", messageHandler);
  }

  switchToTab(tabId) {
    const tab = this.getTab(tabId);
    if (!tab) return;
    
    // Hide all tabs and frames
    this.tabs.forEach(t => {
      t.element?.classList.remove("active");
      t.sandboxFrame?.classList.add("hidden");
    });
    
    // Show selected tab
    tab.element?.classList.add("active");
    tab.sandboxFrame?.classList.remove("hidden");
    
    this.activeTabId = tabId;
    
    // Update UI
    urlInput.value = tab.url || "";
    updateNavigationButtons(tab);
    
    logger.info("Switched to tab", { tabId });
  }

  closeTab(tabId) {
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    const tab = this.tabs[tabIndex];
    
    // Remove DOM elements
    tab.element?.remove();
    tab.sandboxFrame?.remove();
    
    // Remove from array
    this.tabs.splice(tabIndex, 1);
    
    // If this was the active tab, switch to another
    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        // Switch to previous tab or first tab
        const newTab = this.tabs[Math.max(0, tabIndex - 1)];
        this.switchToTab(newTab.id);
      } else {
        // No tabs left, create a new one
        this.createTab();
      }
    }
    
    logger.info("Tab closed", { tabId });
  }

  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  getTab(tabId) {
    return this.tabs.find(t => t.id === tabId);
  }

  updateTabTitle(tabId, title) {
    const tab = this.getTab(tabId);
    if (!tab) return;
    
    tab.title = title || "New Tab";
    const titleEl = tab.element?.querySelector(".tab-title");
    if (titleEl) {
      titleEl.textContent = tab.title;
    }
  }
}

// Global tab manager
const tabManager = new TabManager();

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
 * Show loading progress bar
 */
function showLoading() {
  progressBar.classList.add("loading");
}

/**
 * Hide loading progress bar
 */
function hideLoading() {
  progressBar.classList.remove("loading");
}

/**
 * Add loading spinner to tab
 * @param {Tab} tab - The tab to add spinner to
 */
function showTabLoading(tab) {
  if (!tab || !tab.element) return;
  
  const titleEl = tab.element.querySelector(".tab-title");
  if (!titleEl) return;
  
  // Check if spinner already exists
  if (tab.element.querySelector(".tab-spinner")) return;
  
  const spinner = document.createElement("div");
  spinner.className = "tab-spinner";
  titleEl.parentElement.insertBefore(spinner, titleEl);
}

/**
 * Remove loading spinner from tab
 * @param {Tab} tab - The tab to remove spinner from
 */
function hideTabLoading(tab) {
  if (!tab || !tab.element) return;
  
  const spinner = tab.element.querySelector(".tab-spinner");
  if (spinner) {
    spinner.remove();
  }
}

/**
 * Update navigation button states based on history
 */
function updateNavigationButtons(tab) {
  if (!tab) {
    backBtn.disabled = true;
    forwardBtn.disabled = true;
    reloadBtn.disabled = true;
    bookmarkBtn.disabled = true;
    return;
  }
  backBtn.disabled = tab.historyIndex <= 0;
  forwardBtn.disabled =
    tab.historyIndex < 0 || tab.historyIndex >= tab.navigationHistory.length - 1;
  reloadBtn.disabled = tab.historyIndex < 0;
  bookmarkBtn.disabled = !tab.url;
  
  // Update bookmark button appearance based on whether page is bookmarked
  updateBookmarkButton(tab);
}

/**
 * Update bookmark button appearance
 */
async function updateBookmarkButton(tab) {
  if (!tab || !tab.url) {
    bookmarkBtn.querySelector("use").setAttribute("href", "#icon-bookmark");
    return;
  }
  
  const isBookmarked = await bookmarks.has(tab.url);
  if (isBookmarked) {
    bookmarkBtn.querySelector("use").setAttribute("href", "#icon-bookmark-filled");
    bookmarkBtn.title = "Remove bookmark";
  } else {
    bookmarkBtn.querySelector("use").setAttribute("href", "#icon-bookmark");
    bookmarkBtn.title = "Bookmark this page";
  }
}

/**
 * Show menu dropdown
 */
function showMenu() {
  menuDropdown.classList.add("show");
}

/**
 * Hide menu dropdown
 */
function hideMenu() {
  menuDropdown.classList.remove("show");
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
/**
 * Wait for a tab's sandbox to be ready
 * @param {Tab} tab - The tab to wait for
 * @returns {Promise<void>}
 */
function waitForTabSandbox(tab) {
  return new Promise((resolve) => {
    if (tab.sandboxReady) {
      resolve();
      return;
    }
    // Store resolve function for the tab's message listener
    tab.sandboxReadyResolve = resolve;
  });
}

/**
 * Load a Nostr Web site into a specific tab
 * @param {Tab} tab - The tab to load into
 * @param {string} input - URL input
 * @param {boolean} pushHistory - Whether to add to history
 */
async function loadSiteInTab(tab, input, pushHistory = true) {
  let target;

  // Validate and parse URL
  try {
    target = validateAndParseURL(input);
  } catch (e) {
    logger.warn("URL validation failed", e);
    return;
  }

  logger.info("Loading site in tab", { tabId: tab.id, ...target });
  
  // Show loading indicators
  showLoading();
  showTabLoading(tab);

  // Start performance tracking
  const loadStartTime = Date.now(); // Absolute timestamp for history
  const perfStartTime = performance.now(); // Relative time for duration

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

    // Ensure tab's sandbox is ready
    await waitForTabSandbox(tab);

    // Assemble full HTML with inline scripts (works in sandbox!)
    const fullHTML = assembleHTML(response.result.doc);

    logger.debug("HTML assembled for rendering", {
      tabId: tab.id,
      host: target.host,
      route: target.route,
      htmlLength: fullHTML.length,
      preview: fullHTML.substring(0, 200),
    });

    // Send to tab's sandboxed iframe - inline scripts will work!
    tab.sandboxFrame.contentWindow.postMessage(
      {
        cmd: "render",
        html: fullHTML,
      },
      "*"
    );

    logger.debug("Render command sent to sandbox", {
      tabId: tab.id,
      host: target.host,
      route: target.route,
    });

    // Update tab state
    tab.domain = target.host;
    tab.route = target.route;
    tab.url = `${target.host}${target.route}`;
    
    // Extract title from HTML (simple extraction)
    const titleMatch = fullHTML.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : target.host;
    tabManager.updateTabTitle(tab.id, title);

    // Update navigation history for this tab
    if (pushHistory) {
      // Remove forward history when navigating to new page
      tab.navigationHistory.splice(tab.historyIndex + 1);
      tab.navigationHistory.push({ host: target.host, route: target.route });

      // Limit history size
      if (tab.navigationHistory.length > CONFIG.MAX_HISTORY_SIZE) {
        tab.navigationHistory.shift();
        tab.historyIndex--;
      }

      tab.historyIndex = tab.navigationHistory.length - 1;
    }

    // Hide loading indicators
    hideLoading();
    hideTabLoading(tab);
    
    // Update UI if this is the active tab
    if (tab.id === tabManager.activeTabId) {
      urlInput.value = tab.url;
      updateNavigationButtons(tab);
    }

    // Record successful load performance
    const loadEndTime = Date.now(); // Absolute timestamp
    const perfEndTime = performance.now(); // Relative time
    const totalTime = perfEndTime - perfStartTime; // Duration in ms
    await performanceMonitor.recordLoad({
      url: tab.url,
      host: target.host,
      route: target.route,
      startTime: loadStartTime,
      endTime: loadEndTime,
      totalTime: totalTime,
      success: true,
    });

    logger.info("Site loaded successfully", {
      tabId: tab.id,
      historyIndex: tab.historyIndex,
      historyLength: tab.navigationHistory.length,
      loadTime: Math.round(totalTime) + "ms",
    });
  } catch (e) {
    logger.error("Failed to load site", e);
    
    // Hide loading indicators
    hideLoading();
    hideTabLoading(tab);
    
    const normalized = normalizeError(e);
    const friendlyError = getUserFriendlyError(normalized);

    // Show error in sandbox iframe
    if (tab.sandboxFrame && tab.sandboxReady) {
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

      tab.sandboxFrame.contentWindow.postMessage(
        { cmd: "render", html: errorHTML },
        "*"
      );
    }

    // Record failed load performance
    const loadEndTime = Date.now(); // Absolute timestamp
    const perfEndTime = performance.now(); // Relative time
    const totalTime = perfEndTime - perfStartTime; // Duration in ms
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
  const tab = tabManager.getActiveTab();
  if (!tab) return;

  const newIndex = tab.historyIndex + delta;

  if (newIndex < 0 || newIndex >= tab.navigationHistory.length) {
    logger.warn("Navigation out of bounds", {
      newIndex,
      historyLength: tab.navigationHistory.length,
    });
    return;
  }

  tab.historyIndex = newIndex;
  const entry = tab.navigationHistory[tab.historyIndex];
  urlInput.value = `${entry.host}${entry.route}`;
  loadSiteInTab(tab, urlInput.value, false);
}

/**
 * Reload current page
 */
function reload() {
  const tab = tabManager.getActiveTab();
  if (!tab || tab.historyIndex < 0) {
    logger.warn("No page to reload");
    return;
  }

  const entry = tab.navigationHistory[tab.historyIndex];
  logger.info("Reloading page", entry);
  loadSiteInTab(tab, `${entry.host}${entry.route}`, false);
}

// Event listeners
goBtn.addEventListener("click", () => {
  const input = urlInput.value.trim();
  if (input) {
    const tab = tabManager.getActiveTab();
    if (tab) {
      loadSiteInTab(tab, input);
    }
  }
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = urlInput.value.trim();
    if (input) {
      const tab = tabManager.getActiveTab();
      if (tab) {
        loadSiteInTab(tab, input);
      }
    }
  }
});

backBtn.addEventListener("click", () => navigateRelative(-1));
forwardBtn.addEventListener("click", () => navigateRelative(1));
reloadBtn.addEventListener("click", reload);

// Bookmark button
bookmarkBtn.addEventListener("click", async () => {
  const tab = tabManager.getActiveTab();
  if (!tab || !tab.domain) {
    alert("Please load a page first before bookmarking.");
    return;
  }

  const currentUrl = tab.url;
  const isBookmarked = await bookmarks.has(currentUrl);

  if (isBookmarked) {
    // Remove bookmark
    if (confirm(`Remove bookmark for "${tab.title || tab.domain}"?`)) {
      try {
        await bookmarks.remove(currentUrl);
        logger.info("Bookmark removed", { url: currentUrl });
        await updateBookmarkButton(tab);
      } catch (e) {
        logger.error("Failed to remove bookmark", e);
        alert(`Failed to remove bookmark: ${e.message}`);
      }
    }
  } else {
    // Add bookmark
    try {
      const bookmark = {
        url: currentUrl,
        host: tab.domain,
        route: tab.route,
        title: tab.title || tab.domain,
        createdAt: Date.now(),
        lastVisited: Date.now(),
      };
      
      await bookmarks.add(bookmark);
      logger.info("Bookmark added", { url: currentUrl });
      await updateBookmarkButton(tab);
    } catch (e) {
      logger.error("Failed to add bookmark", e);
      alert(`Failed to add bookmark: ${e.message}`);
    }
  }
});

// Menu button
menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (menuDropdown.classList.contains("show")) {
    hideMenu();
  } else {
    hideBookmarksDropdown();
    showMenu();
  }
});

// Menu items
menuHome.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("home.html");
  hideMenu();
});

menuHistory.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("history.html");
  hideMenu();
});

menuBookmarks.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("bookmarks.html");
  hideMenu();
});

menuSettings.addEventListener("click", () => {
  window.location.href = chrome.runtime.getURL("settings.html");
  hideMenu();
});

// Bookmarks dropdown
closeBookmarksDropdown.addEventListener("click", hideBookmarksDropdown);
bookmarksSearchInput.addEventListener("input", (e) => {
  loadBookmarksDropdown(e.target.value);
});

// Add bookmark button in dropdown
addBookmarkFromDropdownBtn.addEventListener("click", async () => {
  const tab = tabManager.getActiveTab();
  if (!tab || !tab.domain) {
    alert("Please load a page first before bookmarking.");
    return;
  }

  const currentUrl = tab.url;
  const isBookmarked = await bookmarks.has(currentUrl);

  if (isBookmarked) {
    alert("This page is already bookmarked!");
    return;
  }

  try {
    const bookmark = {
      url: currentUrl,
      host: tab.domain,
      route: tab.route,
      title: tab.title || tab.domain,
      createdAt: Date.now(),
      lastVisited: Date.now(),
    };
    
    await bookmarks.add(bookmark);
    logger.info("Bookmark added from dropdown", { url: currentUrl });
    
    // Reload dropdown to show the new bookmark
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

// Close dropdowns when clicking outside
document.addEventListener("click", (e) => {
  // Close menu dropdown
  if (!menuDropdown.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
    hideMenu();
  }
  
  // Close bookmarks dropdown
  if (!bookmarksDropdown.contains(e.target)) {
    hideBookmarksDropdown();
  }
});

// New tab button
newTabBtn.addEventListener("click", () => {
  tabManager.createTab();
  urlInput.focus();
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd+T - New tab
  if ((e.ctrlKey || e.metaKey) && e.key === "t") {
    e.preventDefault();
    tabManager.createTab();
    urlInput.focus();
  }
  
  // Ctrl/Cmd+W - Close tab
  if ((e.ctrlKey || e.metaKey) && e.key === "w") {
    e.preventDefault();
    const tab = tabManager.getActiveTab();
    if (tab) {
      tabManager.closeTab(tab.id);
    }
  }
  
  // Ctrl+Tab - Next tab
  if (e.ctrlKey && e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    const currentIndex = tabManager.tabs.findIndex(t => t.id === tabManager.activeTabId);
    if (currentIndex >= 0 && currentIndex < tabManager.tabs.length - 1) {
      tabManager.switchToTab(tabManager.tabs[currentIndex + 1].id);
    } else if (currentIndex === tabManager.tabs.length - 1) {
      // Wrap to first tab
      tabManager.switchToTab(tabManager.tabs[0].id);
    }
  }
  
  // Ctrl+Shift+Tab - Previous tab
  if (e.ctrlKey && e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    const currentIndex = tabManager.tabs.findIndex(t => t.id === tabManager.activeTabId);
    if (currentIndex > 0) {
      tabManager.switchToTab(tabManager.tabs[currentIndex - 1].id);
    } else if (currentIndex === 0) {
      // Wrap to last tab
      tabManager.switchToTab(tabManager.tabs[tabManager.tabs.length - 1].id);
    }
  }
});

// Initialize - Create first tab
const urlParam = new URLSearchParams(window.location.search).get("url");
if (urlParam) {
  logger.info("Loading from URL parameter", { url: urlParam });
  tabManager.createTab(urlParam);
} else {
  // Check for default website setting
  chrome.storage.local.get(["nweb_default_site"], (result) => {
    if (result.nweb_default_site) {
      logger.info("Loading default website", {
        site: result.nweb_default_site,
      });
      tabManager.createTab(result.nweb_default_site);
    } else {
      // Create empty tab
      tabManager.createTab();
      urlInput.focus();
    }
  });
}

logger.info("Viewer initialized");
