// Prefetch Nostr Web pages on hover for instant navigation
// This content script detects link hovers and fetches pages in background

import { contentLogger as logger } from "./shared/logger.js";

let prefetchTimer = null;
const HOVER_DELAY = 300; // ms - wait before prefetching
const prefetched = new Set();

// Check if URL is a potential Nostr Web site (will be verified by DNS check)
function mightBeNostrWeb(url) {
  try {
    const u = new URL(url);
    // Only http(s) links to external domains
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // Ignore current domain (regular browsing)
    if (u.hostname === window.location.hostname) return false;
    // Ignore common non-Nostr Web patterns
    if (u.hostname.match(/\.(google|facebook|twitter|youtube|github)\./))
      return false;
    return true;
  } catch {
    return false;
  }
}

// Prefetch a URL by asking service worker to cache it
async function prefetchURL(url) {
  if (prefetched.has(url)) return; // Already prefetched
  prefetched.add(url);

  try {
    // Tell service worker to prefetch this URL
    await chrome.runtime.sendMessage({
      type: "prefetch",
      url: url,
    });
    logger.debug("Prefetched", { url });
  } catch (e) {
    logger.warn("Prefetch failed", { url, error: e.message });
    prefetched.delete(url); // Allow retry
  }
}

// Track link hovers
document.addEventListener("mouseover", (e) => {
  const link = e.target.closest("a[href]");
  if (!link) return;

  const href = link.href;
  if (!mightBeNostrWeb(href)) return;

  // Start timer - only prefetch if hover persists
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    prefetchURL(href);
  }, HOVER_DELAY);
});

document.addEventListener("mouseout", (e) => {
  const link = e.target.closest("a[href]");
  if (!link) return;

  // Cancel prefetch if hover was brief
  clearTimeout(prefetchTimer);
});

// Prefetch on touchstart for mobile (no hover events)
document.addEventListener(
  "touchstart",
  (e) => {
    const link = e.target.closest("a[href]");
    if (!link) return;

    const href = link.href;
    if (!mightBeNostrWeb(href)) {
      return;
    }

    // Prefetch immediately on touch (no delay)
    prefetchURL(href);
  },
  { passive: true }
);

logger.info("Prefetch enabled");
