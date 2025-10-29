/**
 * @fileoverview Bookmarks management for Nostr Web sites
 * Stores bookmarks in browser storage and optionally syncs with Nostr
 */

import { swLogger as logger } from "./logger.js";

/**
 * @typedef {Object} Bookmark
 * @property {string} url - Full URL (host + route)
 * @property {string} host - Site hostname
 * @property {string} route - Route path
 * @property {string} title - Page title
 * @property {string} [favicon] - Favicon URL or data URI
 * @property {number} createdAt - Timestamp when bookmarked
 * @property {number} [lastVisited] - Last visit timestamp
 * @property {string[]} [tags] - User-defined tags
 * @property {string} [notes] - User notes
 * @property {string} [pubkey] - Site publisher pubkey
 */

/**
 * @class BookmarkManager
 * Manages browser bookmarks with local storage and optional Nostr sync
 */
export class BookmarkManager {
  constructor() {
    this.storageKey = "nweb_bookmarks";
    this.bookmarks = [];
    this.loaded = false;
  }

  /**
   * Initialize the bookmark manager by loading from storage
   * @returns {Promise<void>}
   */
  async init() {
    if (this.loaded) return;

    try {
      const browserAPI = typeof browser !== "undefined" ? browser : chrome;
      const result = await new Promise((resolve, reject) => {
        browserAPI.storage.local.get([this.storageKey], (data) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve(data);
          }
        });
      });

      this.bookmarks = result[this.storageKey] || [];
      this.loaded = true;
      logger.info("Bookmarks loaded", { count: this.bookmarks.length });
    } catch (e) {
      logger.error("Failed to load bookmarks", { error: e.message });
      this.bookmarks = [];
      this.loaded = true;
    }
  }

  /**
   * Save bookmarks to browser storage
   * @returns {Promise<void>}
   * @private
   */
  async _save() {
    try {
      const browserAPI = typeof browser !== "undefined" ? browser : chrome;
      await new Promise((resolve, reject) => {
        browserAPI.storage.local.set(
          { [this.storageKey]: this.bookmarks },
          () => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
            } else {
              resolve();
            }
          }
        );
      });
      logger.debug("Bookmarks saved", { count: this.bookmarks.length });
    } catch (e) {
      logger.error("Failed to save bookmarks", { error: e.message });
      throw e;
    }
  }

  /**
   * Add a new bookmark
   * @param {Bookmark} bookmark - Bookmark to add
   * @returns {Promise<boolean>} True if added, false if already exists
   */
  async add(bookmark) {
    await this.init();

    // Check if bookmark already exists
    const exists = this.bookmarks.some((b) => b.url === bookmark.url);
    if (exists) {
      logger.debug("Bookmark already exists", { url: bookmark.url });
      return false;
    }

    // Add created timestamp if not provided
    if (!bookmark.createdAt) {
      bookmark.createdAt = Date.now();
    }

    // Add to bookmarks
    this.bookmarks.unshift(bookmark); // Add to beginning
    await this._save();

    logger.info("Bookmark added", {
      url: bookmark.url,
      title: bookmark.title,
    });

    return true;
  }

  /**
   * Remove a bookmark by URL
   * @param {string} url - Full URL to remove
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  async remove(url) {
    await this.init();

    const index = this.bookmarks.findIndex((b) => b.url === url);
    if (index === -1) {
      logger.debug("Bookmark not found", { url });
      return false;
    }

    this.bookmarks.splice(index, 1);
    await this._save();

    logger.info("Bookmark removed", { url });
    return true;
  }

  /**
   * Check if a URL is bookmarked
   * @param {string} url - Full URL to check
   * @returns {Promise<boolean>}
   */
  async has(url) {
    await this.init();
    return this.bookmarks.some((b) => b.url === url);
  }

  /**
   * Get a bookmark by URL
   * @param {string} url - Full URL to get
   * @returns {Promise<Bookmark|null>}
   */
  async get(url) {
    await this.init();
    return this.bookmarks.find((b) => b.url === url) || null;
  }

  /**
   * Get all bookmarks
   * @param {Object} [options] - Filter options
   * @param {string} [options.tag] - Filter by tag
   * @param {string} [options.search] - Search in title/url/notes
   * @param {string} [options.sortBy] - Sort by field (createdAt, lastVisited, title)
   * @param {boolean} [options.ascending] - Sort ascending (default: descending)
   * @returns {Promise<Bookmark[]>}
   */
  async getAll(options = {}) {
    await this.init();

    let results = [...this.bookmarks];

    // Filter by tag
    if (options.tag) {
      results = results.filter(
        (b) => b.tags && b.tags.includes(options.tag)
      );
    }

    // Filter by search query
    if (options.search) {
      const query = options.search.toLowerCase();
      results = results.filter((b) => {
        return (
          b.title?.toLowerCase().includes(query) ||
          b.url?.toLowerCase().includes(query) ||
          b.host?.toLowerCase().includes(query) ||
          b.notes?.toLowerCase().includes(query)
        );
      });
    }

    // Sort results
    const sortBy = options.sortBy || "createdAt";
    const ascending = options.ascending || false;

    results.sort((a, b) => {
      let aVal = a[sortBy] || 0;
      let bVal = b[sortBy] || 0;

      // Handle string sorting
      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        return ascending
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Handle numeric sorting
      return ascending ? aVal - bVal : bVal - aVal;
    });

    return results;
  }

  /**
   * Update a bookmark
   * @param {string} url - URL of bookmark to update
   * @param {Partial<Bookmark>} updates - Fields to update
   * @returns {Promise<boolean>} True if updated, false if not found
   */
  async update(url, updates) {
    await this.init();

    const index = this.bookmarks.findIndex((b) => b.url === url);
    if (index === -1) {
      logger.debug("Bookmark not found for update", { url });
      return false;
    }

    // Merge updates (don't allow changing URL)
    delete updates.url;
    this.bookmarks[index] = {
      ...this.bookmarks[index],
      ...updates,
    };

    await this._save();

    logger.info("Bookmark updated", { url });
    return true;
  }

  /**
   * Update last visited timestamp
   * @param {string} url - URL to update
   * @returns {Promise<void>}
   */
  async updateLastVisited(url) {
    await this.update(url, { lastVisited: Date.now() });
  }

  /**
   * Add a tag to a bookmark
   * @param {string} url - URL of bookmark
   * @param {string} tag - Tag to add
   * @returns {Promise<boolean>}
   */
  async addTag(url, tag) {
    await this.init();

    const bookmark = await this.get(url);
    if (!bookmark) return false;

    const tags = bookmark.tags || [];
    if (!tags.includes(tag)) {
      tags.push(tag);
      await this.update(url, { tags });
    }

    return true;
  }

  /**
   * Remove a tag from a bookmark
   * @param {string} url - URL of bookmark
   * @param {string} tag - Tag to remove
   * @returns {Promise<boolean>}
   */
  async removeTag(url, tag) {
    await this.init();

    const bookmark = await this.get(url);
    if (!bookmark || !bookmark.tags) return false;

    const tags = bookmark.tags.filter((t) => t !== tag);
    await this.update(url, { tags });

    return true;
  }

  /**
   * Get all unique tags across bookmarks
   * @returns {Promise<string[]>}
   */
  async getAllTags() {
    await this.init();

    const tagSet = new Set();
    for (const bookmark of this.bookmarks) {
      if (bookmark.tags) {
        bookmark.tags.forEach((tag) => tagSet.add(tag));
      }
    }

    return Array.from(tagSet).sort();
  }

  /**
   * Clear all bookmarks
   * @returns {Promise<void>}
   */
  async clear() {
    this.bookmarks = [];
    await this._save();
    logger.info("All bookmarks cleared");
  }

  /**
   * Export bookmarks as JSON
   * @returns {Promise<string>}
   */
  async export() {
    await this.init();
    return JSON.stringify(this.bookmarks, null, 2);
  }

  /**
   * Import bookmarks from JSON
   * @param {string} jsonString - JSON string of bookmarks
   * @param {boolean} [merge=true] - Merge with existing or replace
   * @returns {Promise<number>} Number of bookmarks imported
   */
  async import(jsonString, merge = true) {
    await this.init();

    try {
      const imported = JSON.parse(jsonString);

      if (!Array.isArray(imported)) {
        throw new Error("Invalid bookmark format: expected array");
      }

      if (merge) {
        // Merge: add new bookmarks, skip duplicates
        let added = 0;
        for (const bookmark of imported) {
          const exists = this.bookmarks.some((b) => b.url === bookmark.url);
          if (!exists) {
            this.bookmarks.push(bookmark);
            added++;
          }
        }
        logger.info("Bookmarks merged", { added, total: this.bookmarks.length });
        await this._save();
        return added;
      } else {
        // Replace all bookmarks
        this.bookmarks = imported;
        await this._save();
        logger.info("Bookmarks replaced", { count: this.bookmarks.length });
        return imported.length;
      }
    } catch (e) {
      logger.error("Failed to import bookmarks", { error: e.message });
      throw new Error(`Import failed: ${e.message}`);
    }
  }

  /**
   * Get bookmark statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    await this.init();

    const stats = {
      total: this.bookmarks.length,
      tagged: this.bookmarks.filter((b) => b.tags && b.tags.length > 0).length,
      withNotes: this.bookmarks.filter((b) => b.notes && b.notes.length > 0)
        .length,
      tags: (await this.getAllTags()).length,
      oldestBookmark: null,
      newestBookmark: null,
      mostVisited: null,
    };

    if (this.bookmarks.length > 0) {
      // Find oldest and newest
      let oldest = this.bookmarks[0];
      let newest = this.bookmarks[0];

      for (const bookmark of this.bookmarks) {
        if (bookmark.createdAt < oldest.createdAt) oldest = bookmark;
        if (bookmark.createdAt > newest.createdAt) newest = bookmark;
      }

      stats.oldestBookmark = {
        url: oldest.url,
        title: oldest.title,
        createdAt: oldest.createdAt,
      };
      stats.newestBookmark = {
        url: newest.url,
        title: newest.title,
        createdAt: newest.createdAt,
      };

      // Find most visited
      const mostVisited = this.bookmarks.reduce((prev, current) => {
        return (current.lastVisited || 0) > (prev.lastVisited || 0)
          ? current
          : prev;
      });

      if (mostVisited.lastVisited) {
        stats.mostVisited = {
          url: mostVisited.url,
          title: mostVisited.title,
          lastVisited: mostVisited.lastVisited,
        };
      }
    }

    return stats;
  }
}

// Export singleton instance
export const bookmarks = new BookmarkManager();

