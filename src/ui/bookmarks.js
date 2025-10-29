/**
 * @fileoverview Bookmarks page - Full bookmarks management
 */

import { bookmarks } from "./shared/bookmarks.js";
import { uiLogger as logger } from "./shared/logger.js";

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// DOM elements
const searchInput = document.getElementById("searchInput");
const sortByDate = document.getElementById("sortByDate");
const sortByTitle = document.getElementById("sortByTitle");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const clearAll = document.getElementById("clearAll");
const bookmarksContainer = document.getElementById("bookmarksContainer");
const totalBookmarks = document.getElementById("totalBookmarks");
const totalTags = document.getElementById("totalTags");

let currentSort = "createdAt";
let currentSearch = "";

/**
 * Load and display bookmarks
 */
async function loadBookmarks() {
  try {
    await bookmarks.init();

    // Get stats
    const stats = await bookmarks.getStats();
    totalBookmarks.textContent = stats.total;
    totalTags.textContent = stats.tags;

    // Get bookmarks with current filters
    const allBookmarks = await bookmarks.getAll({
      sortBy: currentSort,
      ascending: currentSort === "title",
      search: currentSearch,
    });

    if (allBookmarks.length === 0) {
      if (currentSearch) {
        bookmarksContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-title">No results found</div>
            <div class="empty-text">
              Try a different search term
            </div>
          </div>
        `;
      } else {
        bookmarksContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-title">No bookmarks yet</div>
            <div class="empty-text">
              Visit a Nostr Web site and click the bookmark button<br>
              to save it for quick access later.
            </div>
          </div>
        `;
      }
      return;
    }

    // Render bookmarks grid
    bookmarksContainer.innerHTML = `<div class="bookmarks-grid" id="bookmarksGrid"></div>`;
    const grid = document.getElementById("bookmarksGrid");

    for (const bookmark of allBookmarks) {
      const card = createBookmarkCard(bookmark);
      grid.appendChild(card);
    }

    logger.info("Bookmarks loaded", { count: allBookmarks.length });
  } catch (e) {
    logger.error("Failed to load bookmarks", { error: e.message });
    bookmarksContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Failed to load bookmarks</div>
        <div class="empty-text">${escapeHtml(e.message)}</div>
      </div>
    `;
  }
}

/**
 * Create a bookmark card element
 */
function createBookmarkCard(bookmark) {
  const card = document.createElement("div");
  card.className = "bookmark-card";

  // Get first letter for favicon fallback
  const firstLetter = (bookmark.title || bookmark.host || "N")[0].toUpperCase();

  // Format dates
  const createdDate = new Date(bookmark.createdAt).toLocaleDateString();
  const lastVisited = bookmark.lastVisited
    ? new Date(bookmark.lastVisited).toLocaleDateString()
    : "Never";

  card.innerHTML = `
    <button class="bookmark-delete" title="Delete bookmark">×</button>
    <div class="bookmark-header">
      <div class="bookmark-favicon">${
        bookmark.favicon
          ? `<img src="${bookmark.favicon}" width="40" height="40" style="border-radius: 8px;">`
          : firstLetter
      }</div>
      <div class="bookmark-info">
        <div class="bookmark-title">${escapeHtml(
          bookmark.title || bookmark.host
        )}</div>
        <div class="bookmark-url">${escapeHtml(bookmark.host)}${escapeHtml(
    bookmark.route || ""
  )}</div>
      </div>
    </div>
    <div class="bookmark-meta">
      Added: ${createdDate} · Last visited: ${lastVisited}
    </div>
  `;

  // Click to open
  card.addEventListener("click", (e) => {
    // Don't open if clicking delete button
    if (e.target.classList.contains("bookmark-delete")) return;

    const viewerUrl = browserAPI.runtime.getURL(
      `viewer.html?url=${encodeURIComponent(bookmark.url)}`
    );
    browserAPI.tabs.create({ url: viewerUrl });
  });

  // Delete button
  const deleteBtn = card.querySelector(".bookmark-delete");
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (
      confirm(
        `Delete bookmark for "${bookmark.title || bookmark.host}"?\n\nThis cannot be undone.`
      )
    ) {
      await bookmarks.remove(bookmark.url);
      logger.info("Bookmark deleted", { url: bookmark.url });
      loadBookmarks();
    }
  });

  return card;
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
  loadBookmarks();
});

sortByDate.addEventListener("click", () => {
  currentSort = "createdAt";
  sortByDate.style.background = "#0a0a0a";
  sortByDate.style.color = "#ffffff";
  sortByTitle.style.background = "";
  sortByTitle.style.color = "";
  loadBookmarks();
});

sortByTitle.addEventListener("click", () => {
  currentSort = "title";
  sortByTitle.style.background = "#0a0a0a";
  sortByTitle.style.color = "#ffffff";
  sortByDate.style.background = "";
  sortByDate.style.color = "";
  loadBookmarks();
});

exportBtn.addEventListener("click", async () => {
  try {
    const data = await bookmarks.export();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    a.href = url;
    a.download = `nostr-web-bookmarks-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logger.info("Bookmarks exported");
  } catch (e) {
    logger.error("Failed to export bookmarks", { error: e.message });
    alert(`Failed to export bookmarks: ${e.message}`);
  }
});

importBtn.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const result = await bookmarks.import(text);
    logger.info("Bookmarks imported", result);
    alert(
      `Import successful!\n\n` +
        `Added: ${result.added}\n` +
        `Skipped (duplicates): ${result.skipped}\n` +
        `Total bookmarks: ${result.total}`
    );
    loadBookmarks();
  } catch (e) {
    logger.error("Failed to import bookmarks", { error: e.message });
    alert(`Import failed: ${e.message}`);
  } finally {
    // Reset file input so the same file can be imported again
    importFile.value = "";
  }
});

clearAll.addEventListener("click", async () => {
  const stats = await bookmarks.getStats();
  if (stats.total === 0) {
    alert("No bookmarks to clear.");
    return;
  }

  if (
    confirm(
      `Delete ALL ${stats.total} bookmarks?\n\nThis will permanently remove all your saved bookmarks.\n\nThis cannot be undone.`
    )
  ) {
    await bookmarks.clear();
    logger.info("All bookmarks cleared");
    loadBookmarks();
  }
});

// Initialize
loadBookmarks();

// Set default sort button style
sortByDate.style.background = "#0a0a0a";
sortByDate.style.color = "#ffffff";

