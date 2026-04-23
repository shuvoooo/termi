#!/usr/bin/env node
// CJS script — run with: node scripts/generate-electron-icons.cjs
// Requires: sharp (root node_modules), macOS sips+iconutil (for ICNS)

const sharp       = require('sharp');
const fs          = require('fs');
const path        = require('path');
const { execSync } = require('child_process');

const OUT = path.join(__dirname, '../apps/electron/buildfiles');
fs.mkdirSync(OUT, { recursive: true });

// ── SVG source ────────────────────────────────────────────────────────────────
const SVG = Buffer.from(`<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0a0a1a"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
    <linearGradient id="glow" x1="0.5" y1="0" x2="0.5" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#6366f1" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </linearGradient>
    <filter id="dropshadow">
      <feDropShadow dx="0" dy="10" stdDeviation="30" flood-color="#6366f1" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Rounded square background -->
  <rect width="1024" height="1024" rx="220" ry="220" fill="url(#bg)"/>

  <!-- Soft glow -->
  <ellipse cx="512" cy="440" rx="440" ry="300" fill="url(#glow)"/>

  <!-- Terminal card -->
  <rect x="88" y="208" width="848" height="576" rx="30" ry="30"
        fill="#0d0d22" filter="url(#dropshadow)"/>

  <!-- Title bar -->
  <rect x="88" y="208" width="848" height="64" rx="30" ry="30" fill="#161632"/>
  <rect x="88"  y="242" width="848" height="30"              fill="#161632"/>

  <!-- Traffic lights -->
  <circle cx="148" cy="240" r="14" fill="#ff5f57"/>
  <circle cx="196" cy="240" r="14" fill="#febc2e"/>
  <circle cx="244" cy="240" r="14" fill="#28c840"/>

  <!-- Bar title -->
  <text x="512" y="248" text-anchor="middle" dominant-baseline="middle"
        font-family="system-ui,-apple-system,sans-serif"
        font-size="24" fill="#3d3d6b" letter-spacing="0.5">termi</text>

  <!-- Prompt chevron -->
  <text x="136" y="426"
        font-family="'Courier New',Courier,monospace"
        font-size="116" font-weight="700" fill="url(#acc)">&#x276F;</text>

  <!-- "termi" word -->
  <text x="268" y="426"
        font-family="'Courier New',Courier,monospace"
        font-size="116" font-weight="700" fill="#e2e8f0">termi</text>

  <!-- Cursor -->
  <rect x="136" y="460" width="68" height="16" rx="4" fill="url(#acc)" opacity="0.9"/>

  <!-- Second prompt (muted) -->
  <text x="136" y="584"
        font-family="'Courier New',Courier,monospace"
        font-size="62" fill="#2e2e5a">&#x276F; ssh root@192.168.1.1</text>
</svg>`);

async function makePng(size, dest) {
    await sharp(SVG).resize(size, size).png().toFile(dest);
}

async function main() {
    // ── 1. Master 1024×1024 PNG ───────────────────────────────────────────────
    const master = path.join(OUT, 'icon.png');
    await makePng(1024, master);
    console.log('✓ icon.png (1024×1024)');

    // ── 2. macOS ICNS via iconutil ────────────────────────────────────────────
    const iconset = path.join(OUT, 'icon.iconset');
    fs.mkdirSync(iconset, { recursive: true });

    const macSizes = [
        ['icon_16x16.png',      16 ],
        ['icon_16x16@2x.png',   32 ],
        ['icon_32x32.png',      32 ],
        ['icon_32x32@2x.png',   64 ],
        ['icon_128x128.png',    128],
        ['icon_128x128@2x.png', 256],
        ['icon_256x256.png',    256],
        ['icon_256x256@2x.png', 512],
        ['icon_512x512.png',    512],
        ['icon_512x512@2x.png', 1024],
    ];

    for (const [name, size] of macSizes) {
        await makePng(size, path.join(iconset, name));
    }

    execSync(`iconutil -c icns "${iconset}" -o "${path.join(OUT, 'icon.icns')}"`, { stdio: 'inherit' });
    fs.rmSync(iconset, { recursive: true });
    console.log('✓ icon.icns');

    // ── 3. Windows ICO (multi-resolution PNG-in-ICO) ──────────────────────────
    const icoSizes = [16, 32, 48, 64, 128, 256];
    const bufs = await Promise.all(
        icoSizes.map(async (s) => sharp(SVG).resize(s, s).png().toBuffer())
    );

    const dirSize  = 6 + 16 * bufs.length;
    let   dataOffset = dirSize;
    const totalSize  = bufs.reduce((a, b) => a + b.length, dirSize);
    const ico = Buffer.alloc(totalSize);

    ico.writeUInt16LE(0, 0);            // reserved
    ico.writeUInt16LE(1, 2);            // type: ICO
    ico.writeUInt16LE(bufs.length, 4);

    bufs.forEach((buf, i) => {
        const s    = icoSizes[i];
        const base = 6 + i * 16;
        ico.writeUInt8(s >= 256 ? 0 : s, base);
        ico.writeUInt8(s >= 256 ? 0 : s, base + 1);
        ico.writeUInt8(0,  base + 2);
        ico.writeUInt8(0,  base + 3);
        ico.writeUInt16LE(1,  base + 4);
        ico.writeUInt16LE(32, base + 6);
        ico.writeUInt32LE(buf.length,  base + 8);
        ico.writeUInt32LE(dataOffset,  base + 12);
        dataOffset += buf.length;
    });

    let pos = dirSize;
    bufs.forEach((buf) => { buf.copy(ico, pos); pos += buf.length; });
    fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);
    console.log('✓ icon.ico');

    console.log('\n✅  All Electron icons generated in apps/electron/buildfiles/');
}

main().catch((err) => { console.error(err); process.exit(1); });
