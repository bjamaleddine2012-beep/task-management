// Generate raster icons for every device class from the source SVG.
// Run with: node scripts/generate-icons.mjs
//
// Outputs (in public/):
//   icon-32.png        — favicon fallback
//   icon-180.png       — iOS apple-touch-icon (the size Safari wants)
//   icon-192.png       — Android home screen
//   icon-512.png       — Android splash screen
//   icon-maskable-192.png / icon-maskable-512.png — Android adaptive icons

import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PUBLIC = "public";
const srcSquare = readFileSync(join(PUBLIC, "icon-512.svg"));
const srcMaskable = readFileSync(join(PUBLIC, "icon-maskable.svg"));

const targets = [
  { src: srcSquare, name: "icon-32.png", size: 32 },
  { src: srcSquare, name: "icon-180.png", size: 180 },
  { src: srcSquare, name: "icon-192.png", size: 192 },
  { src: srcSquare, name: "icon-512.png", size: 512 },
  { src: srcMaskable, name: "icon-maskable-192.png", size: 192 },
  { src: srcMaskable, name: "icon-maskable-512.png", size: 512 },
];

for (const { src, name, size } of targets) {
  const out = await sharp(src, { density: 384 })
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
  writeFileSync(join(PUBLIC, name), out);
  console.log(`✓ ${name} (${out.length} bytes)`);
}

console.log("Done.");
