#!/usr/bin/env node

/**
 * Validate extension structure before loading in Chrome
 * Checks for all required files and manifest configuration
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(message, color = "reset") {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function check(condition, message) {
  if (condition) {
    log(`✅ ${message}`, "green");
    return true;
  } else {
    log(`❌ ${message}`, "red");
    return false;
  }
}

function warn(message) {
  log(`⚠️  ${message}`, "yellow");
}

function info(message) {
  log(`ℹ️  ${message}`, "blue");
}

log("\n🔍 Validating Nostr Web Extension Structure\n", "blue");

let allChecks = true;

// 1. Check manifest.json
info("Checking manifest.json...");
const manifestPath = path.join(__dirname, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  check(false, "manifest.json exists");
  allChecks = false;
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
check(true, "manifest.json exists and is valid JSON");
check(manifest.manifest_version === 3, "Manifest version is 3");
check(!!manifest.name, `Extension name: "${manifest.name}"`);
check(!!manifest.version, `Extension version: ${manifest.version}`);

// 2. Check icons
info("\nChecking icons...");
const iconSizes = [16, 48, 128];
for (const size of iconSizes) {
  const iconPath = path.join(__dirname, "icons", `icon${size}.png`);
  const exists = fs.existsSync(iconPath);
  allChecks &= check(exists, `icons/icon${size}.png exists`);

  if (exists) {
    const stats = fs.statSync(iconPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    info(`  └─ Size: ${sizeKB} KB`);
  }
}

// 3. Check required extension files
info("\nChecking required files...");
const requiredFiles = [
  "sw.js",
  "offscreen.html",
  "offscreen.js",
  "viewer.html",
  "viewer.js",
  "popup.html",
  "popup.js",
  "settings.html",
  "settings.js",
  "sandbox.html",
  "renderer.html",
  "renderer.js",
];

for (const file of requiredFiles) {
  const filePath = path.join(__dirname, file);
  allChecks &= check(fs.existsSync(filePath), `${file} exists`);
}

// 4. Check shared modules
info("\nChecking shared modules...");
const sharedFiles = [
  "shared/constants.js",
  "shared/errors.js",
  "shared/logger.js",
  "shared/validation.js",
  "shared/analytics.js",
];

for (const file of sharedFiles) {
  const filePath = path.join(__dirname, file);
  allChecks &= check(fs.existsSync(filePath), `${file} exists`);
}

// 5. Check manifest permissions
info("\nChecking manifest permissions...");
const requiredPermissions = ["storage", "offscreen", "webNavigation"];
for (const perm of requiredPermissions) {
  const hasPerm = manifest.permissions?.includes(perm);
  allChecks &= check(hasPerm, `Permission: ${perm}`);
}

const hasHostPerms = manifest.host_permissions?.length > 0;
allChecks &= check(
  hasHostPerms,
  `Host permissions: ${manifest.host_permissions?.[0] || "none"}`
);

// 6. Check background service worker
info("\nChecking background configuration...");
const hasSW = manifest.background?.service_worker === "sw.js";
allChecks &= check(hasSW, "Service worker configured: sw.js");

// 7. Check sandbox pages
info("\nChecking sandbox configuration...");
const hasSandbox = manifest.sandbox?.pages?.includes("sandbox.html");
allChecks &= check(hasSandbox, "Sandbox page configured: sandbox.html");

// 8. Summary
log("\n" + "=".repeat(50), "blue");
if (allChecks) {
  log("\n✅ All checks passed! Extension ready to load.\n", "green");
  log("Next steps:", "blue");
  log("1. Open Chrome and go to chrome://extensions");
  log('2. Enable "Developer mode" (toggle in top-right)');
  log('3. Click "Load unpacked"');
  log("4. Select this directory: " + __dirname);
  log("5. The extension should load without errors!\n");
  process.exit(0);
} else {
  log("\n❌ Some checks failed. Fix issues before loading.\n", "red");
  process.exit(1);
}
