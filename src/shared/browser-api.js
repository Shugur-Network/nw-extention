/**
 * @fileoverview Browser API abstraction layer
 * Provides unified interface for Chrome and Firefox extension APIs
 */

/**
 * Get the appropriate browser API object
 * Firefox uses `browser` (Promise-based), Chrome uses `chrome` (callback-based)
 * @returns {Object} Browser API object
 */
function getBrowserAPI() {
  // Firefox has native `browser` API with Promises
  if (typeof browser !== "undefined") {
    return browser;
  }
  // Chrome uses `chrome` API with callbacks
  if (typeof chrome !== "undefined") {
    return chrome;
  }
  throw new Error("No browser API available");
}

// Export the browser API
export const browserAPI = getBrowserAPI();

/**
 * Check if running in Chrome
 * @returns {boolean} True if Chrome
 */
export function isChrome() {
  return typeof chrome !== "undefined" && typeof browser === "undefined";
}

/**
 * Check if running in Firefox
 * @returns {boolean} True if Firefox
 */
export function isFirefox() {
  return typeof browser !== "undefined";
}

/**
 * Get browser name
 * @returns {string} "chrome" or "firefox"
 */
export function getBrowserName() {
  return isFirefox() ? "firefox" : "chrome";
}

/**
 * Get extension manifest
 * @returns {Object} Manifest object
 */
export function getManifest() {
  return browserAPI.runtime.getManifest();
}

/**
 * Get extension version
 * @returns {string} Version string
 */
export function getVersion() {
  return getManifest().version;
}

/**
 * Get runtime URL for extension resource
 * @param {string} path - Resource path
 * @returns {string} Full URL
 */
export function getRuntimeURL(path) {
  return browserAPI.runtime.getURL(path);
}

/**
 * Send message to runtime
 * Works with both Chrome (callback) and Firefox (Promise)
 * @param {Object} message - Message to send
 * @returns {Promise<any>} Response
 */
export async function sendMessage(message) {
  if (isFirefox()) {
    // Firefox returns Promise
    return await browserAPI.runtime.sendMessage(message);
  } else {
    // Chrome uses callbacks, wrap in Promise
    return new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage(message, (response) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

/**
 * Get from storage
 * Works with both Chrome and Firefox
 * @param {string|string[]|Object} keys - Keys to get
 * @returns {Promise<Object>} Storage data
 */
export async function storageGet(keys) {
  if (isFirefox()) {
    return await browserAPI.storage.local.get(keys);
  } else {
    return new Promise((resolve) => {
      browserAPI.storage.local.get(keys, resolve);
    });
  }
}

/**
 * Set in storage
 * Works with both Chrome and Firefox
 * @param {Object} items - Items to set
 * @returns {Promise<void>}
 */
export async function storageSet(items) {
  if (isFirefox()) {
    return await browserAPI.storage.local.set(items);
  } else {
    return new Promise((resolve) => {
      browserAPI.storage.local.set(items, resolve);
    });
  }
}

/**
 * Clear storage
 * Works with both Chrome and Firefox
 * @returns {Promise<void>}
 */
export async function storageClear() {
  if (isFirefox()) {
    return await browserAPI.storage.local.clear();
  } else {
    return new Promise((resolve) => {
      browserAPI.storage.local.clear(resolve);
    });
  }
}

/**
 * Create or update tab
 * @param {Object} options - Tab options
 * @returns {Promise<Object>} Tab object
 */
export async function createTab(options) {
  if (isFirefox()) {
    return await browserAPI.tabs.create(options);
  } else {
    return new Promise((resolve) => {
      browserAPI.tabs.create(options, resolve);
    });
  }
}

/**
 * Update tab
 * @param {number} tabId - Tab ID
 * @param {Object} updateProperties - Properties to update
 * @returns {Promise<Object>} Tab object
 */
export async function updateTab(tabId, updateProperties) {
  if (isFirefox()) {
    return await browserAPI.tabs.update(tabId, updateProperties);
  } else {
    return new Promise((resolve) => {
      browserAPI.tabs.update(tabId, updateProperties, resolve);
    });
  }
}

/**
 * Add message listener
 * Handles both Chrome and Firefox message formats
 * @param {Function} callback - Callback function
 */
export function addMessageListener(callback) {
  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Call callback and check if it returns a Promise
    const result = callback(message, sender, sendResponse);

    // If callback returns a Promise, handle it properly
    if (result instanceof Promise) {
      result
        .then((response) => {
          if (isChrome()) {
            sendResponse(response);
          }
        })
        .catch((error) => {
          if (isChrome()) {
            sendResponse({ error: error.message });
          }
        });

      // Return true to indicate async response for Chrome
      return true;
    }

    // If callback explicitly returns true, it will handle response async
    return result === true;
  });
}

/**
 * Add install listener
 * @param {Function} callback - Callback function
 */
export function addInstallListener(callback) {
  browserAPI.runtime.onInstalled.addListener(callback);
}

/**
 * Add navigation listener
 * @param {Function} callback - Callback function
 * @param {Object} filter - Navigation filter
 */
export function addNavigationListener(callback, filter) {
  browserAPI.webNavigation.onBeforeNavigate.addListener(callback, filter);
}

/**
 * Get browser-specific features
 * @returns {Object} Feature availability
 */
export function getFeatures() {
  return {
    browser: getBrowserName(),
    offscreenAPI: isChrome() && !!browserAPI.offscreen,
    tabsAPI: !!browserAPI.tabs,
    storageAPI: !!browserAPI.storage,
    webNavigationAPI: !!browserAPI.webNavigation,
    alarmsAPI: !!browserAPI.alarms,
  };
}

