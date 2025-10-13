#!/usr/bin/env node

/**
 * Generate placeholder icons for the Nostr Web Extension
 * Creates simple purple icons with "NW" text
 */

import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [16, 48, 128];
const iconDir = path.join(__dirname, "icons");

// Ensure icons directory exists
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background - Purple gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#6b46c1");
  gradient.addColorStop(1, "#5a3aa0");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Rounded corners
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "#000";
  const radius = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // Text - "NW"
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Font size scales with icon size
  const fontSize = Math.floor(size * 0.45);
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  ctx.fillText("NW", size / 2, size / 2);

  // Add subtle border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.stroke();

  return canvas;
}

console.log("🎨 Generating placeholder icons...\n");

for (const size of sizes) {
  const canvas = generateIcon(size);
  const buffer = canvas.toBuffer("image/png");
  const filePath = path.join(iconDir, `icon${size}.png`);

  fs.writeFileSync(filePath, buffer);
  console.log(`✅ Created: icons/icon${size}.png (${size}x${size})`);
}

console.log("\n✨ All icons generated successfully!");
console.log(
  "\n📝 Note: These are placeholder icons. For production, consider:"
);
console.log("   - Using a professional designer");
console.log("   - Tools like Figma, Sketch, or Illustrator");
console.log("   - Online generators like https://realfavicongenerator.net/");
