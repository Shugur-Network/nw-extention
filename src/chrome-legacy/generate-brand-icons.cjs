/**
 * Generate brand icons with logo design
 * Creates 16x16, 48x48, and 128x128 PNG icons with the brand logo shape
 */

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

const SIZES = [16, 48, 128];
const OUTPUT_DIR = path.join(__dirname, "icons");

// Brand colors
const LOGO_COLOR = "#1A1A1A";
const BG_COLOR = "#FFFFFF";

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Draw simplified brand logo shape
 */
function drawLogoShape(ctx, size) {
  const padding = size * 0.1;
  const width = size - padding * 2;
  const height = size - padding * 2;
  
  ctx.fillStyle = LOGO_COLOR;
  
  // Top rounded bar (similar to logo top shape)
  const topHeight = height * 0.35;
  const radius = topHeight * 0.4;
  
  ctx.beginPath();
  ctx.roundRect(padding, padding, width, topHeight, radius);
  ctx.fill();
  
  // Bottom rounded bar (similar to logo bottom shape)
  const bottomY = padding + height * 0.55;
  const bottomHeight = height * 0.45;
  
  ctx.beginPath();
  ctx.roundRect(padding, bottomY, width, bottomHeight, radius);
  ctx.fill();
}

/**
 * Generate icon at specified size
 */
function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, size, size);

  // Draw logo shape
  drawLogoShape(ctx, size);

  // Save to file
  const outputPath = path.join(OUTPUT_DIR, `icon${size}.png`);
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputPath, buffer);

  console.log(`✓ Generated ${outputPath}`);
}

/**
 * Generate all icon sizes
 */
function generateAllIcons() {
  console.log("Generating brand icons...\n");

  try {
    for (const size of SIZES) {
      generateIcon(size);
    }

    console.log("\n✅ All brand icons generated successfully!");
    console.log("\nBrand icons created:");
    console.log("  - icon16.png  (16×16) - Toolbar icon");
    console.log("  - icon48.png  (48×48) - Extension management");
    console.log("  - icon128.png (128×128) - Web store listing");
    console.log("\nColors:");
    console.log(`  - Logo: ${LOGO_COLOR}`);
    console.log(`  - Background: ${BG_COLOR}`);
  } catch (err) {
    console.error("❌ Error generating icons:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run
generateAllIcons();
