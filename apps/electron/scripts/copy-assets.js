#!/usr/bin/env node
/**
 * Copy static assets to dist/ after TypeScript compilation.
 * Cross-platform alternative to shell cp commands.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function cp(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

// Resolve root node_modules (workspace-hoisted packages)
const nm = path.join(ROOT, '..', '..', 'node_modules');

// ── HTML assets ──────────────────────────────────────────────────────────────
cp(path.join(ROOT, 'src', 'mode-selector.html'),  path.join(ROOT, 'dist', 'mode-selector.html'));
cp(path.join(ROOT, 'src', 'local-terminal.html'), path.join(ROOT, 'dist', 'local-terminal.html'));

// ── Vendor: xterm ─────────────────────────────────────────────────────────────
const vendor = path.join(ROOT, 'dist', 'vendor');
cp(path.join(nm, '@xterm', 'xterm',     'lib', 'xterm.js'),     path.join(vendor, 'xterm.js'));
cp(path.join(nm, '@xterm', 'xterm',     'css', 'xterm.css'),    path.join(vendor, 'xterm.css'));
cp(path.join(nm, '@xterm', 'addon-fit', 'lib', 'addon-fit.js'), path.join(vendor, 'addon-fit.js'));

console.log('✓ Assets copied to dist/');
