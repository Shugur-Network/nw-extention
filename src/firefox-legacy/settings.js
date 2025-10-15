/**
 * Settings Page Logic
 * Manages default website and cache clearing
 */

// Browser API polyfill for cross-browser compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

import { uiLogger as logger } from "./shared/logger.js";

const clearCache = document.getElementById("clearCache");
const defaultSiteInput = document.getElementById("defaultSiteInput");
const saveDefaultSite = document.getElementById("saveDefaultSite");

/**
 * Clear all caches
 */
clearCache.addEventListener("click", async () => {
  if (
    !confirm(
      "Clear all caches? This will remove stored DNS records, events, and site indexes.\n\nYour settings (default website, log level) will be preserved."
    )
  ) {
    return;
  }

  try {
    // Send message to service worker to clear caches
    const response = await browserAPI.runtime.sendMessage({
      method: "clearCache",
    });

    if (response.error) {
      alert(`Failed to clear cache: ${response.error}`);
    } else {
      clearCache.textContent = "Cache Cleared!";
      setTimeout(() => {
        clearCache.textContent = "Clear Cache";
      }, 2000);
    }
  } catch (err) {
    alert(`Failed to clear cache: ${err.message}`);
  }
});

/**
 * Load default website from storage
 */
async function loadDefaultWebsite() {
  try {
    const result = await browserAPI.storage.local.get(["nweb_default_site"]);
    if (result.nweb_default_site) {
      defaultSiteInput.value = result.nweb_default_site;
    }
  } catch (err) {
    logger.error("Failed to load default website", { error: err.message });
  }
}

/**
 * Save default website
 */
saveDefaultSite.addEventListener("click", async () => {
  const site = defaultSiteInput.value.trim();

  // Validate input
  if (site && !/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(site)) {
    alert(
      "Please enter a valid domain (e.g., example.com)\nNo http://, no paths, just the domain."
    );
    return;
  }

  try {
    // Save to storage
    await browserAPI.storage.local.set({ nweb_default_site: site });

    // Show success feedback
    const originalText = saveDefaultSite.textContent;
    saveDefaultSite.textContent = "Saved!";
    saveDefaultSite.disabled = true;

    setTimeout(() => {
      saveDefaultSite.textContent = originalText;
      saveDefaultSite.disabled = false;
    }, 2000);
  } catch (err) {
    alert(`Failed to save default website: ${err.message}`);
  }
});

// Initialize UI
loadDefaultWebsite();
