/**
 * @fileoverview History page - Full browsing history management
 */

import { performanceMonitor } from "./shared/performance.js";
import { uiLogger as logger } from "./shared/logger.js";

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// DOM elements
const searchInput = document.getElementById("searchInput");
const todayFilter = document.getElementById("todayFilter");
const weekFilter = document.getElementById("weekFilter");
const allFilter = document.getElementById("allFilter");
const clearAll = document.getElementById("clearAll");
const historyContainer = document.getElementById("historyContainer");
const totalVisits = document.getElementById("totalVisits");
const uniqueSites = document.getElementById("uniqueSites");

let currentFilter = "all";
let currentSearch = "";

/**
 * Load and display history
 */
async function loadHistory() {
  try {
    await performanceMonitor.init();
    const stats = await performanceMonitor.getLoadStats();

    if (!stats.recentLoads || stats.recentLoads.length === 0) {
      historyContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No history yet</div>
          <div class="empty-text">
            Sites you visit will appear here
          </div>
        </div>
      `;
      totalVisits.textContent = "0";
      uniqueSites.textContent = "0";
      return;
    }

    // Filter by time
    let filteredHistory = [...stats.recentLoads];
    const now = Date.now();

    if (currentFilter === "today") {
      const todayStart = new Date().setHours(0, 0, 0, 0);
      filteredHistory = filteredHistory.filter(
        (item) => item.startTime >= todayStart
      );
    } else if (currentFilter === "week") {
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      filteredHistory = filteredHistory.filter(
        (item) => item.startTime >= weekAgo
      );
    }

    // Filter by search
    if (currentSearch) {
      const query = currentSearch.toLowerCase();
      filteredHistory = filteredHistory.filter(
        (item) =>
          (item.host && item.host.toLowerCase().includes(query)) ||
          (item.url && item.url.toLowerCase().includes(query))
      );
    }

    // Update stats
    totalVisits.textContent = stats.totalLoads;
    const uniqueHosts = new Set(stats.recentLoads.map((l) => l.host));
    uniqueSites.textContent = uniqueHosts.size;

    // Render history
    if (filteredHistory.length === 0) {
      historyContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No results found</div>
          <div class="empty-text">Try a different search or filter</div>
        </div>
      `;
      return;
    }

    historyContainer.innerHTML = '<div class="history-list" id="historyList"></div>';
    const list = document.getElementById("historyList");

    for (const item of filteredHistory) {
      const historyItem = createHistoryItem(item);
      list.appendChild(historyItem);
    }

    logger.info("History loaded", { count: filteredHistory.length });
  } catch (e) {
    logger.error("Failed to load history", { error: e.message });
    historyContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Failed to load history</div>
        <div class="empty-text">${escapeHtml(e.message)}</div>
      </div>
    `;
  }
}

/**
 * Create a history item element
 */
function createHistoryItem(item) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "history-item";

  const firstLetter = (item.host || "N")[0].toUpperCase();
  const timeAgo = getTimeAgo(item.startTime);

  itemDiv.innerHTML = `
    <div class="history-icon">${firstLetter}</div>
    <div class="history-info">
      <div class="history-title">${escapeHtml(item.host || item.url)}</div>
      <div class="history-url">${escapeHtml(item.url || item.host)}</div>
    </div>
    <div class="history-meta">${timeAgo}</div>
    <button class="history-delete" title="Delete from history">Delete</button>
  `;

  // Click to open
  itemDiv.addEventListener("click", (e) => {
    if (e.target.classList.contains("history-delete")) return;

    const viewerUrl = browserAPI.runtime.getURL(
      `viewer.html?url=${encodeURIComponent(item.url || item.host)}`
    );
    browserAPI.tabs.create({ url: viewerUrl });
  });

  // Delete button
  const deleteBtn = itemDiv.querySelector(".history-delete");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Note: We don't have delete functionality in performanceMonitor yet
    alert("Delete single items coming soon! Use 'Clear All' to remove all history.");
  });

  return itemDiv;
}

/**
 * Get time ago string
 */
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
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
searchInput.addEventListener("input", (e) => {
  currentSearch = e.target.value.trim();
  loadHistory();
});

todayFilter.addEventListener("click", () => {
  currentFilter = "today";
  todayFilter.style.background = "#0a0a0a";
  todayFilter.style.color = "#ffffff";
  weekFilter.style.background = "";
  weekFilter.style.color = "";
  allFilter.style.background = "";
  allFilter.style.color = "";
  loadHistory();
});

weekFilter.addEventListener("click", () => {
  currentFilter = "week";
  weekFilter.style.background = "#0a0a0a";
  weekFilter.style.color = "#ffffff";
  todayFilter.style.background = "";
  todayFilter.style.color = "";
  allFilter.style.background = "";
  allFilter.style.color = "";
  loadHistory();
});

allFilter.addEventListener("click", () => {
  currentFilter = "all";
  allFilter.style.background = "#0a0a0a";
  allFilter.style.color = "#ffffff";
  todayFilter.style.background = "";
  todayFilter.style.color = "";
  weekFilter.style.background = "";
  weekFilter.style.color = "";
  loadHistory();
});

clearAll.addEventListener("click", async () => {
  if (
    !confirm(
      "Clear all browsing history?\n\nThis will permanently remove all your browsing history.\n\nThis cannot be undone."
    )
  ) {
    return;
  }

  try {
    await performanceMonitor.clearHistory();
    logger.info("History cleared");
    loadHistory();
  } catch (e) {
    logger.error("Failed to clear history", { error: e.message });
    alert(`Failed to clear history: ${e.message}`);
  }
});

// Initialize
loadHistory();

// Set default filter button style
allFilter.style.background = "#0a0a0a";
allFilter.style.color = "#ffffff";

