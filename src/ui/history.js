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
// DOM node for history grid:
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

    let grouped = groupHistory(stats.recentLoads, currentFilter);

    // Filter by search
    if (currentSearch) {
      const query = currentSearch.toLowerCase();
      grouped = grouped.filter(
        (item) =>
          (item.host && item.host.toLowerCase().includes(query)) ||
          (item.url && item.url.toLowerCase().includes(query))
      );
    }

    // Update stats
    totalVisits.textContent = grouped.reduce((acc, row) => acc + row.count, 0);
    const uniqueHosts = new Set(grouped.map((l) => l.host));
    uniqueSites.textContent = uniqueHosts.size;

    // Render history
    if (grouped.length === 0) {
      historyContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No results found</div>
          <div class="empty-text">Try a different search or filter</div>
        </div>
      `;
      return;
    }
    renderHistoryList(grouped);

    logger.info("History loaded", { count: grouped.length });
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
    <div class="history-time">${timeAgo}</div>
    <button class="history-delete" title="Delete from history">×</button>
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
    modal.show({
      title: "Coming Soon",
      message:
        "Delete single items coming soon! Use 'Clear All' to remove all history.",
      type: "info",
    });
  });

  return itemDiv;
}

function renderHistoryList(entries) {
  historyContainer.innerHTML = '<div class="list" id="historyList"></div>';
  const list = document.getElementById("historyList");
  for (const item of entries) {
    list.appendChild(createHistoryListItem(item));
  }
}

function createHistoryListItem(item) {
  const row = document.createElement("div");
  row.className = "list-item";
  const firstLetter = (item.host || "N")[0].toUpperCase();
  row.innerHTML = `
    <div class="favicon">${firstLetter}</div>
    <div class="list-info">
      <div class="list-title">${escapeHtml(item.host)}</div>
      <div class="list-url">${escapeHtml(item.url)}</div>
    </div>
    <div class="list-meta">${formatHistoryMeta(
      item.latestTimestamp,
      item.count
    )}</div>
    <button class="delete-btn" title="Delete history">×</button>
  `;
  row.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) return;
    const viewerUrl = browserAPI.runtime.getURL(
      `viewer.html?url=${encodeURIComponent(item.url)}`
    );
    browserAPI.tabs.create({ url: viewerUrl });
  });
  const deleteBtn = row.querySelector(".delete-btn");
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (
      confirm(
        `Delete ${item.count > 1 ? `${item.count} visits to` : "visit to"} "${
          item.host
        }${item.route}" on this day?\n\nThis cannot be undone.`
      )
    ) {
      try {
        const deleted = await performanceMonitor.deleteHistoryEntry(
          item.url,
          item.host,
          item.route,
          item.dayKey
        );
        logger.info("History entry deleted", {
          url: item.url,
          host: item.host,
          route: item.route,
          dayKey: item.dayKey,
          deleted,
        });
        // Reload history
        loadHistory();
      } catch (e) {
        logger.error("Failed to delete history entry", { error: e.message });
        modal.show({
          title: "Error",
          message: `Failed to delete: ${e.message}`,
          type: "error",
        });
      }
    }
  });
  return row;
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

function getStartOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStartOfWeek(ts) {
  const d = new Date(ts);
  const day = d.getDay(); // 0=Sun
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function groupHistory(rawArr, period = "all") {
  // rawArr is most recent first. We'll group by key: `${host}:${route}:${startOfDay}`
  const map = new Map();
  const now = Date.now();
  const todayStart = getStartOfDay(now);
  const weekStart = getStartOfWeek(now);

  for (const item of rawArr) {
    // Only group successful loads
    if (!item.success) continue;
    if (!item.startTime || isNaN(item.startTime) || item.startTime <= 0)
      continue;

    // Apply period filter
    let periodTest = true;
    if (period === "today") {
      // Check if startTime is on the same day as today
      periodTest = getStartOfDay(item.startTime) === todayStart;
    } else if (period === "week") {
      // Check if startTime is within this week
      periodTest = item.startTime >= weekStart;
    }

    if (!periodTest) continue;

    const dayKey = getStartOfDay(item.startTime);
    const key = `${item.host}:${item.route}:${dayKey}`;
    if (!map.has(key)) {
      map.set(key, {
        host: item.host,
        route: item.route,
        url: item.url,
        dayKey,
        latestTimestamp: item.startTime,
        count: 1,
      });
    } else {
      const entry = map.get(key);
      entry.count++;
      if (item.startTime > entry.latestTimestamp)
        entry.latestTimestamp = item.startTime;
    }
  }
  // most recent rows first
  return Array.from(map.values())
    .filter((row) => row.latestTimestamp && row.latestTimestamp > 0)
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

function formatHistoryMeta(ts, count) {
  if (!ts || isNaN(ts) || ts <= 0) return "Unknown date";
  const now = new Date();
  const d = new Date(ts);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  let datePart;
  if (d >= todayStart) datePart = "Today";
  else if (d >= yesterdayStart) datePart = "Yesterday";
  else
    datePart = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  let lead = count > 1 ? `${count} visits • ` : "";
  return lead + datePart + ", " + timePart;
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
  todayFilter.classList.add("active");
  weekFilter.classList.remove("active");
  allFilter.classList.remove("active");
  loadHistory();
});

weekFilter.addEventListener("click", () => {
  currentFilter = "week";
  weekFilter.classList.add("active");
  todayFilter.classList.remove("active");
  allFilter.classList.remove("active");
  loadHistory();
});

allFilter.addEventListener("click", () => {
  currentFilter = "all";
  allFilter.classList.add("active");
  todayFilter.classList.remove("active");
  weekFilter.classList.remove("active");
  loadHistory();
});

clearAll.addEventListener("click", async () => {
  modal.confirm({
    title: "Clear All History",
    message:
      "Clear all browsing history?<br><br>This will permanently remove all your browsing history.<br><br><strong>This cannot be undone.</strong>",
    confirmText: "Clear All",
    cancelText: "Cancel",
    onConfirm: async () => {
      try {
        await performanceMonitor.clearHistory();
        logger.info("History cleared");
        loadHistory();
      } catch (e) {
        logger.error("Failed to clear history", { error: e.message });
        modal.show({
          title: "Error",
          message: `Failed to clear history: ${e.message}`,
          type: "error",
        });
      }
    },
  });
});

// Initialize
loadHistory();

// Set default filter button style
allFilter.classList.add("active");
