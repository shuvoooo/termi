#!/usr/bin/env node
/**
 * Generates all PWA icons from the SVG source.
 * Run: node scripts/generate-icons.js
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'apps/web/public');
const iconsDir = join(publicDir, 'icons');

mkdirSync(iconsDir, { recursive: true });

const svgSource = readFileSync(join(iconsDir, 'source.svg'));

// SVG with full-bleed background for maskable icons (no safe-zone padding)
const maskableSvg = Buffer.from(`<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0f172a"/>
  <path d="M 136 192 L 252 256 L 136 320" stroke="#0ea5e9" stroke-width="44" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <rect x="278" y="232" width="100" height="48" rx="8" fill="#0ea5e9"/>
</svg>`);

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

async function generate() {
    console.log('Generating PWA icons...');

    // Standard icons (with rounded corners, transparent outside)
    for (const size of sizes) {
        await sharp(svgSource)
            .resize(size, size)
            .png()
            .toFile(join(iconsDir, `icon-${size}x${size}.png`));
        console.log(`  ✓ icon-${size}x${size}.png`);
    }

    // Maskable icons (full-bleed, no transparent edges)
    for (const size of [192, 512]) {
        await sharp(maskableSvg)
            .resize(size, size)
            .png()
            .toFile(join(iconsDir, `icon-${size}x${size}-maskable.png`));
        console.log(`  ✓ icon-${size}x${size}-maskable.png`);
    }

    // Apple touch icon (180x180, no transparency)
    await sharp(maskableSvg)
        .resize(180, 180)
        .png()
        .toFile(join(iconsDir, 'apple-touch-icon.png'));
    console.log('  ✓ apple-touch-icon.png');

    // Shortcut icon (add-server)
    await sharp(svgSource)
        .resize(96, 96)
        .png()
        .toFile(join(iconsDir, 'add-server.png'));
    console.log('  ✓ add-server.png');

    // Favicon (32x32 PNG — served as /favicon.ico via Next.js)
    await sharp(svgSource)
        .resize(32, 32)
        .png()
        .toFile(join(publicDir, 'favicon.png'));
    console.log('  ✓ favicon.png');

    // Also generate a 16x16 and 32x32 combined into favicon.ico via raw ICO writing
    // For simplicity, copy 32x32 PNG as favicon.ico (browsers accept PNG in .ico)
    await sharp(svgSource)
        .resize(32, 32)
        .png()
        .toFile(join(publicDir, 'favicon.ico'));
    console.log('  ✓ favicon.ico');

    console.log('\nAll icons generated successfully!');
}

generate().catch((err) => {
    console.error('Icon generation failed:', err);
    process.exit(1);
});
