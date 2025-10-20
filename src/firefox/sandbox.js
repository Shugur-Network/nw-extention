/**
 * Sandboxed page message handler for rendering Nostr Web content
 * Firefox requires external scripts (no CSP exemption like Chrome)
 */

// Store our message handler in a closure
const handleMessage = (event) => {
  // Security: Validate origin is our extension
  const validOrigins = [
    event.origin.startsWith("moz-extension://"),
    event.origin.startsWith("chrome-extension://"),
  ];

  if (!validOrigins.some((v) => v)) {
    console.warn("Ignoring message from invalid origin:", event.origin);
    return;
  }

  const { cmd, html } = event.data;

  if (cmd === "render") {
    console.log(
      `📥 Sandbox received render command, HTML length: ${html?.length || 0}`
    );

    try {
      // ⚠️ SECURITY NOTE: document.write() is intentional here
      // This sandbox page is isolated from the extension and can only render
      // content that has been verified (author signature + SRI) by background.js
      document.open();
      document.write(html); // Firefox AMO Warning: This is the intended rendering method for sandboxed content
      document.close();

      // Re-attach THIS message listener after document.write
      window.addEventListener("message", handleMessage);

      // Now attach the navigation handler to the NEW document
      attachNavigationHandler();

      // Notify parent that rendering succeeded
      window.parent.postMessage({ cmd: "renderSuccess" }, "*");
    } catch (error) {
      console.error("Render error:", error);

      // ⚠️ SECURITY NOTE: innerHTML is intentional here for error display only
      // This is a sandboxed, isolated page showing static error content
      // Show error
      document.body.innerHTML = `
        <div style="padding: 40px; font-family: system-ui; color: #e45757;">
          <h1>Render Error</h1>
          <pre style="background: #f5f5f5; padding: 20px; border-radius: 8px; overflow: auto; color: #333;">${
            error.stack || error
          }</pre>
        </div>
      `;

      // Notify parent of error
      window.parent.postMessage(
        {
          cmd: "renderError",
          error: error.message,
        },
        "*"
      );
    }
  }
};

// Navigation handler - attaches to document AFTER render
function attachNavigationHandler() {
  console.log("[Nostr Web] Attaching navigation handler...");

  document.addEventListener(
    "click",
    (e) => {
      const link = e.target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      console.log("[Nostr Web] Link clicked:", href);

      // Allow external links and anchors
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#")
      ) {
        console.log("[Nostr Web] External/anchor link, allowing");
        return;
      }

      // Internal link - prevent navigation and notify parent
      e.preventDefault();
      e.stopPropagation();

      // Extract route
      let route = href;
      if (route.endsWith(".html")) {
        route = route.replace(/\.html$/, "");
      }
      if (!route.startsWith("/")) {
        route = "/" + route;
      }
      if (route === "/index") {
        route = "/";
      }

      console.log("[Nostr Web] Internal navigation to:", route);

      // Notify parent viewer to load the new route
      window.parent.postMessage({ cmd: "navigate", route: route }, "*");
    },
    true
  ); // Use capture phase

  console.log("[Nostr Web] Navigation handler attached");
}

// Attach message listener
window.addEventListener("message", handleMessage);

// Signal ready
window.parent.postMessage({ cmd: "sandboxReady" }, "*");
