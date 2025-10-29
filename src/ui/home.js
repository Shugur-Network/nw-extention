/**
 * @fileoverview Home page for Nostr Web Browser
 * Simple navigation and shortcuts to recently visited sites
 */

import { uiLogger as logger } from "./shared/logger.js";
import { performanceMonitor } from "./shared/performance.js";

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// DOM elements
const searchInput = document.getElementById("searchInput");
const recentSites = document.getElementById("recentSites");
const recentSection = document.getElementById("recentSection");

/**
 * Load recent sites from history
 */
async function loadRecentSites() {
  try {
    await performanceMonitor.init();
    const stats = await performanceMonitor.getLoadStats();

    if (!stats.recentLoads || stats.recentLoads.length === 0) {
      recentSection.style.display = "none";
      return;
    }

    // Get unique sites from recent loads (limit to 6 for clean layout)
    const uniqueSites = [];
    const seen = new Set();

    for (const load of stats.recentLoads) {
      if (!seen.has(load.host)) {
        seen.add(load.host);
        uniqueSites.push(load);
      }
      if (uniqueSites.length >= 6) break;
    }

    if (uniqueSites.length === 0) {
      recentSection.style.display = "none";
      return;
    }

    recentSites.innerHTML = "";
    for (const site of uniqueSites) {
      const card = createSiteCard(site);
      recentSites.appendChild(card);
    }

    logger.info("Recent sites loaded", { count: uniqueSites.length });
  } catch (e) {
    logger.error("Failed to load recent sites", { error: e.message });
    recentSection.style.display = "none";
  }
}

/**
 * Create a site card element
 */
function createSiteCard(site) {
  const card = document.createElement("div");
  card.className = "site-card";

  const firstLetter = (site.host || "N")[0].toUpperCase();

  card.innerHTML = `
    <div class="site-icon">${firstLetter}</div>
    <div class="site-title">${escapeHtml(site.host)}</div>
  `;

  card.addEventListener("click", () => {
    const viewerUrl = browserAPI.runtime.getURL(
      `viewer.html?url=${encodeURIComponent(site.host)}`
    );
    window.location.href = viewerUrl;
  });

  return card;
}

/**
 * Handle search input
 */
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (query) {
      const viewerUrl = browserAPI.runtime.getURL(
        `viewer.html?url=${encodeURIComponent(query)}`
      );
      window.location.href = viewerUrl;
    }
  }
});

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
loadRecentSites();

