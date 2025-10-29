/**
 * @fileoverview HTML page templates for loading and error states
 * Shared between Chrome and Firefox service workers
 */

/**
 * Create a beautiful loading page
 * @param {string} host - Hostname being loaded
 * @param {string} route - Route path being loaded
 * @returns {string} HTML page content
 */
export function createLoadingPage(host, route) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Loading ${host}${route}... | Nostr Web</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0a0a0a;
    }
    .container {
      text-align: center;
      max-width: 500px;
      padding: 40px;
    }
    .logo {
      font-size: 48px;
      margin-bottom: 20px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.05); opacity: 1; }
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .host {
      font-size: 15px;
      font-weight: 400;
      margin-bottom: 30px;
      color: #666;
    }
    .loader {
      width: 48px;
      height: 48px;
      border: 3px solid #f0f0f0;
      border-top-color: #0a0a0a;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      font-size: 14px;
      opacity: 0.8;
      margin-top: 20px;
    }
    .steps {
      margin-top: 30px;
      text-align: left;
      display: inline-block;
    }
    .step {
      padding: 10px 0;
      opacity: 0.6;
      font-size: 14px;
    }
    .step.active {
      opacity: 1;
      font-weight: 500;
    }
    .step::before {
      content: "⏳ ";
    }
    .step.active::before {
      content: "⚡ ";
      animation: flash 0.5s ease-in-out infinite;
    }
    @keyframes flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🌐</div>
    <h1>Loading Nostr Web</h1>
    <div class="host">${escapeHtml(host)}${escapeHtml(route)}</div>
    <div class="loader"></div>
    <div class="status">Fetching from decentralized relays...</div>
    <div class="steps">
      <div class="step active">✓ DNS resolved</div>
      <div class="step active">⚡ Connecting to relays</div>
      <div class="step">Fetching events</div>
      <div class="step">Assembling page</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Create a beautiful error page
 * @param {string} host - Hostname that failed
 * @param {string} route - Route path that failed
 * @param {string} errorMsg - Error message to display
 * @returns {string} HTML page content
 */
export function createErrorPage(host, route, errorMsg) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error Loading ${host} | Nostr Web</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0a0a0a;
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 500px;
      background: #fafafa;
      padding: 48px 40px;
      border-radius: 12px;
      border: 1px solid #e8e8e8;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
    }
    .icon svg {
      width: 100%;
      height: 100%;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .host {
      font-size: 14px;
      font-weight: 400;
      margin-bottom: 20px;
      color: #666;
    }
    .error {
      background: #ffffff;
      padding: 16px 20px;
      border-radius: 8px;
      margin: 20px 0;
      font-size: 14px;
      word-break: break-word;
      border: 1px solid #e8e8e8;
      color: #d32f2f;
      font-weight: 500;
    }
    .help {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
    }
    .buttons {
      margin-top: 24px;
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    button {
      padding: 10px 20px;
      background: #0a0a0a;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
      letter-spacing: -0.01em;
    }
    button:hover {
      opacity: 0.9;
    }
    button.secondary {
      background: #ffffff;
      color: #0a0a0a;
      border: 1px solid #e8e8e8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    </div>
    <h1>Failed to Load</h1>
    <div class="host">${escapeHtml(host)}${escapeHtml(route)}</div>
    <div class="error">${escapeHtml(errorMsg)}</div>
    <div class="help">
      This could mean:<br>
      • The site events are not published to the relays<br>
      • The relays are unreachable<br>
      • The DNS record is misconfigured
    </div>
    <div class="buttons">
      <button onclick="location.reload()">Retry</button>
      <button class="secondary" onclick="history.back()">Go Back</button>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 * @private
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

