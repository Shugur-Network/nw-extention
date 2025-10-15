// Runs inside the sandboxed iframe.
// Receives a bundle { html, css[], js[], csp? } and renders it.
// No inline execution; JS/CSS loaded via blob: URLs.

function makeBlobURL(text, mime) {
  return URL.createObjectURL(new Blob([text], { type: mime }));
}
function injectCSP(csp) {
  // Replace current CSP with the effective page CSP (must include blob: for script/style).
  const metas = document.querySelectorAll(
    'meta[http-equiv="Content-Security-Policy"]'
  );
  metas.forEach((m) => m.remove());
  const m = document.createElement("meta");
  m.setAttribute("http-equiv", "Content-Security-Policy");
  m.setAttribute("content", csp);
  document.head.prepend(m);
}
function renderBundle(bundle) {
  // Handle both old format (object with html/css/js) and new format
  let html =
    bundle.html || "<!doctype html><html><head></head><body></body></html>";
  const cssTexts = Array.isArray(bundle.css) ? bundle.css : [];
  const jsTexts = Array.isArray(bundle.js) ? bundle.js : [];
  const csp = bundle.csp;

  // Build the CSP that allows blob: URLs
  const effectiveCSP =
    csp && typeof csp === "string"
      ? csp
      : "default-src 'self'; img-src 'self' data: https:; script-src 'self' blob:; style-src 'self' 'unsafe-inline' blob:; connect-src 'self' https: wss:;";

  // Inject CSP meta tag into HTML before rendering
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${effectiveCSP}">`;

  // Insert CSP meta tag at the beginning of <head>
  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>${cspMeta}`);
  } else if (html.includes("<head ")) {
    html = html.replace(/<head\s/, `<head>${cspMeta}<head `);
  } else {
    // No head tag, add one
    html = html.replace("<html>", `<html><head>${cspMeta}</head>`);
  }

  // Write the HTML with CSP included
  document.open();
  document.write(html);
  document.close();

  const head = document.head || document.getElementsByTagName("head")[0];
  const body = document.body || document.getElementsByTagName("body")[0];

  // Attach CSS as blob URLs
  for (const css of cssTexts) {
    if (!css) continue;
    const href = makeBlobURL(css, "text/css");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    head.appendChild(link);
  }

  // Attach JS as module blob URLs
  for (const js of jsTexts) {
    if (!js) continue;
    const src = makeBlobURL(js, "text/javascript");
    const s = document.createElement("script");
    s.type = "module";
    s.src = src;
    body.appendChild(s);
  }

  // Intercept clicks on internal links to handle navigation
  document.addEventListener(
    "click",
    (e) => {
      const link = e.target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      // Check if it's an internal link (relative path or same-domain)
      // Skip external links (http://, https://, mailto:, etc.)
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#")
      ) {
        return; // Let these navigate normally
      }

      // This is an internal navigation - prevent default and notify parent
      e.preventDefault();

      // Extract the route from the href
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

      // Send navigation request to parent
      window.parent.postMessage({ cmd: "navigate", route: route }, "*");
    },
    true
  ); // Use capture phase to catch all clicks
}

// Listen for bundle from parent
window.addEventListener("message", (ev) => {
  if (ev.data?.cmd === "renderBundle") {
    try {
      renderBundle(ev.data.bundle || {});
    } catch (e) {
      document.body.innerHTML =
        "<pre style='white-space:pre-wrap;word-break:break-word'></pre>";
      document.querySelector("pre").textContent =
        "Render error: " + (e?.stack || e);
    }
  }
});
