/**
 * Settings Page Logic
 * Manages default website, cache clearing, and performance stats
 */

import { uiLogger as logger } from "./shared/logger.js";
import { performanceMonitor } from "./shared/performance.js";

const clearCache = document.getElementById("clearCache");
const defaultSiteInput = document.getElementById("defaultSiteInput");
const saveDefaultSite = document.getElementById("saveDefaultSite");
const toggleAdvanced = document.getElementById("toggleAdvanced");
const advancedSection = document.getElementById("advancedSection");
const performanceStats = document.getElementById("performanceStats");
const refreshPerformance = document.getElementById("refreshPerformance");

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

/**
 * Clear all caches
 */
clearCache.addEventListener("click", async () => {
  modal.confirm({
    title: "Clear Cache",
    message: "Clear all caches?<br><br>This will remove stored DNS records, events, and site indexes.",
    confirmText: "Clear Cache",
    cancelText: "Cancel",
    onConfirm: async () => {
      try {
        // Send message to service worker to clear caches
        const response = await chrome.runtime.sendMessage({
          type: "CLEAR_CACHE",
        });

        if (response.error) {
          modal.show({
            title: "Error",
            message: `Failed to clear cache: ${response.error}`,
            type: "error"
          });
        } else {
          clearCache.textContent = "Cache Cleared!";
          setTimeout(() => {
            clearCache.textContent = "Clear Cache";
          }, 2000);
        }
      } catch (err) {
        modal.show({
          title: "Error",
          message: `Failed to clear cache: ${err.message}`,
          type: "error"
        });
      }
    }
  });
});

/**
 * Load default website from storage
 */
async function loadDefaultWebsite() {
  try {
    const result = await chrome.storage.local.get(["nweb_default_site"]);
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
    await chrome.storage.local.set({ nweb_default_site: site });

    // Show success feedback
    const originalText = saveDefaultSite.textContent;
    saveDefaultSite.textContent = "Saved!";
    saveDefaultSite.disabled = true;

    setTimeout(() => {
      saveDefaultSite.textContent = originalText;
      saveDefaultSite.disabled = false;
    }, 2000);
  } catch (err) {
    modal.show({
      title: "Error",
      message: `Failed to save default website: ${err.message}`,
      type: "error"
    });
  }
});

/**
 * Load performance statistics
 */
async function loadPerformanceStats() {
  try {
    await performanceMonitor.init();

    const loadStats = await performanceMonitor.getLoadStats();
    const cacheStats = await performanceMonitor.getCacheStats();
    const relayStats = await performanceMonitor.getRelayStats();

    performanceStats.innerHTML = `
      <strong>Load Performance</strong><br>
      • Total loads: ${loadStats.totalLoads} (${
      loadStats.successfulLoads
    } successful, ${loadStats.failedLoads} failed)<br>
      • Average load time: ${loadStats.averageLoadTime}ms<br>
      • Median load time: ${loadStats.medianLoadTime}ms<br>
      ${
        loadStats.fastestLoad
          ? `• Fastest: ${loadStats.fastestLoad.time}ms<br>`
          : ""
      }
      ${
        loadStats.slowestLoad
          ? `• Slowest: ${loadStats.slowestLoad.time}ms<br>`
          : ""
      }
      <br>
      <strong>Cache Performance</strong><br>
      • Hit rate: ${cacheStats.hitRate}%<br>
      • Total requests: ${cacheStats.totalRequests} (${cacheStats.hits} hits, ${
      cacheStats.misses
    } misses)<br>
      <br>
      <strong>Relay Performance</strong><br>
      • Total queries: ${relayStats.totalQueries}<br>
      • Average query time: ${relayStats.averageQueryTime}ms<br>
      ${
        relayStats.relayPerformance.length > 0
          ? `• Best relay: ${relayStats.relayPerformance[0].url} (${Math.round(
              relayStats.relayPerformance[0].successRate
            )}% success)<br>`
          : ""
      }
    `;
  } catch (e) {
    logger.error("Failed to load performance stats", { error: e.message });
    performanceStats.textContent = "Failed to load performance data";
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

// Event listeners
toggleAdvanced.addEventListener("click", () => {
  const isHidden = advancedSection.style.display === "none";
  advancedSection.style.display = isHidden ? "block" : "none";
  toggleAdvanced.textContent = isHidden
    ? "Hide Advanced Options"
    : "Show Advanced Options";

  // Load performance stats when first opened
  if (isHidden) {
    loadPerformanceStats();
  }
});

refreshPerformance.addEventListener("click", loadPerformanceStats);

// Initialize UI
loadDefaultWebsite();
