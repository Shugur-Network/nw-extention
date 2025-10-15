#!/usr/bin/env node

/**
 * Build script for cross-browser extension
 * Generates dist/chrome and dist/firefox from unified source
 *
 * Usage:
 *   node scripts/build.js chrome
 *   node scripts/build.js firefox
 *   node scripts/build.js all
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const target = process.argv[2] || "all";

// Ensure dist directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Copy file or directory recursively
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    ensureDir(dest);
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Build for a specific browser target
function buildTarget(browser) {
  console.log(`\n🔨 Building for ${browser}...`);

  const distDir = path.join(rootDir, "dist", browser);

  // Clean dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  ensureDir(distDir);

  // Copy shared modules
  console.log("  📦 Copying shared modules...");
  copyRecursive(
    path.join(rootDir, "src", "shared"),
    path.join(distDir, "shared")
  );

  // Copy UI files
  console.log("  🎨 Copying UI files...");
  const uiFiles = [
    "popup.html",
    "popup.js",
    "viewer.html",
    "viewer.js",
    "settings.html",
    "settings.js",
    "sandbox.html",
    "renderer.html",
    "renderer.js",
    "content.html",
  ];

  for (const file of uiFiles) {
    const srcPath = path.join(rootDir, "src", "ui", file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(distDir, file));
    }
  }

  // Copy platform-specific files
  console.log(`  🔧 Copying ${browser}-specific files...`);
  const platformDir = path.join(rootDir, "src", browser);
  const platformFiles = fs.readdirSync(platformDir);

  for (const file of platformFiles) {
    const srcPath = path.join(platformDir, file);
    if (fs.statSync(srcPath).isFile() && file !== `manifest.${browser}.json`) {
      fs.copyFileSync(srcPath, path.join(distDir, file));
    }
  }

  // Copy and process manifest
  console.log("  📋 Processing manifest...");
  const manifestSrc = path.join(platformDir, `manifest.${browser}.json`);
  const manifestDest = path.join(distDir, "manifest.json");
  fs.copyFileSync(manifestSrc, manifestDest);

  // Copy public assets
  console.log("  🖼️  Copying public assets...");
  copyRecursive(path.join(rootDir, "public"), distDir);

  // Copy LICENSE and PRIVACY.md
  console.log("  📄 Copying LICENSE and PRIVACY.md...");
  fs.copyFileSync(path.join(rootDir, "LICENSE"), path.join(distDir, "LICENSE"));
  fs.copyFileSync(
    path.join(rootDir, "PRIVACY.md"),
    path.join(distDir, "PRIVACY.md")
  );

  console.log(`✅ ${browser} build complete: dist/${browser}/`);
}

// Main
if (target === "all") {
  buildTarget("chrome");
  buildTarget("firefox");
} else if (target === "chrome" || target === "firefox") {
  buildTarget(target);
} else {
  console.error("❌ Invalid target. Use: chrome, firefox, or all");
  process.exit(1);
}

console.log("\n✨ Build complete!");
