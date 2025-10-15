#!/usr/bin/env node

/**
 * Validate cross-browser extension structure
 * Checks built distributions in dist/chrome and dist/firefox
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

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

function validateDistribution(target) {
  log(`\n📦 Validating ${target} distribution`, "blue");
  
  const distDir = path.join(rootDir, "dist", target);
  
  if (!fs.existsSync(distDir)) {
    warn(`dist/${target}/ directory not found. Run: npm run build:${target}`);
    return false;
  }
  
  let allChecks = true;
  
  // 1. Check manifest.json
  info("\nChecking manifest.json...");
  const manifestPath = path.join(distDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    check(false, "manifest.json exists");
    return false;
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
    const iconPath = path.join(distDir, "icons", `icon${size}.png`);
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
    "viewer.html",
    "viewer.js",
    "popup.html",
    "popup.js",
    "settings.html",
    "settings.js",
    "sandbox.html",
    "renderer.html",
    "renderer.js",
    "LICENSE",
    "PRIVACY.md",
  ];
  
  // Chrome-specific files
  if (target === "chrome") {
    requiredFiles.push("sw.js", "offscreen.html", "offscreen.js");
  }
  
  // Firefox-specific files
  if (target === "firefox") {
    requiredFiles.push("background.js", "sandbox.js");
  }
  
  for (const file of requiredFiles) {
    const filePath = path.join(distDir, file);
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
    const filePath = path.join(distDir, file);
    allChecks &= check(fs.existsSync(filePath), `${file} exists`);
  }
  
  // 5. Check SVG assets
  info("\nChecking SVG assets...");
  const svgFiles = ["logo.svg", "icons.svg"];
  for (const file of svgFiles) {
    const filePath = path.join(distDir, file);
    allChecks &= check(fs.existsSync(filePath), `${file} exists`);
  }
  
  // 6. Check manifest permissions
  info("\nChecking manifest permissions...");
  const requiredPermissions = ["storage", "webNavigation"];
  if (target === "chrome") {
    requiredPermissions.push("offscreen");
  }
  
  for (const perm of requiredPermissions) {
    const hasPerm = manifest.permissions?.includes(perm);
    allChecks &= check(hasPerm, `Permission: ${perm}`);
  }
  
  const hasHostPerms = manifest.host_permissions?.length > 0;
  allChecks &= check(
    hasHostPerms,
    `Host permissions: ${manifest.host_permissions?.[0] || "none"}`
  );
  
  // 7. Check background configuration
  info("\nChecking background configuration...");
  if (target === "chrome") {
    const hasSW = manifest.background?.service_worker === "sw.js";
    allChecks &= check(hasSW, "Service worker configured: sw.js");
  } else if (target === "firefox") {
    const hasScripts = manifest.background?.scripts?.includes("background.js");
    allChecks &= check(hasScripts, "Background script configured: background.js");
  }
  
  // 8. Check sandbox pages (Chrome only - Firefox uses different approach)
  info("\nChecking sandbox configuration...");
  if (target === "chrome") {
    const hasSandbox = manifest.sandbox?.pages?.includes("sandbox.html");
    allChecks &= check(hasSandbox, "Sandbox page configured: sandbox.html");
  } else {
    // Firefox uses web_accessible_resources instead of sandbox pages
    const hasSandboxResource = manifest.web_accessible_resources?.[0]?.resources?.includes("sandbox.html");
    allChecks &= check(hasSandboxResource, "Sandbox resource configured: sandbox.html");
  }
  
  return allChecks;
}

// Main validation
log("\n🔍 Validating Nostr Web Cross-Browser Extension\n", "blue");

let allChecks = true;

// Validate source structure
info("Checking source structure...");
const srcDirs = ["src/shared", "src/ui", "src/chrome", "src/firefox"];
for (const dir of srcDirs) {
  const dirPath = path.join(rootDir, dir);
  allChecks &= check(fs.existsSync(dirPath), `${dir}/ exists`);
}

// Validate distributions
const chromeValid = validateDistribution("chrome");
const firefoxValid = validateDistribution("firefox");

allChecks &= chromeValid && firefoxValid;

// Summary
log("\n" + "=".repeat(50), "blue");
if (allChecks) {
  log("\n✅ All checks passed! Extensions ready to load.\n", "green");
  log("Next steps:", "blue");
  log("\n📦 Chrome:");
  log("1. Open chrome://extensions");
  log('2. Enable "Developer mode" (toggle in top-right)');
  log('3. Click "Load unpacked"');
  log(`4. Select: ${path.join(rootDir, "dist/chrome")}`);
  
  log("\n🦊 Firefox:");
  log("1. Open about:debugging#/runtime/this-firefox");
  log('2. Click "Load Temporary Add-on"');
  log(`3. Select any file from: ${path.join(rootDir, "dist/firefox")}`);
  
  log("");
  process.exit(0);
} else {
  log("\n❌ Some checks failed. Fix issues before loading.\n", "red");
  if (!chromeValid || !firefoxValid) {
    warn("Run 'npm run build' to generate distributions.\n");
  }
  process.exit(1);
}
