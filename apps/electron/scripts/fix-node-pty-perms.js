#!/usr/bin/env node
/**
 * node-pty ships spawn-helper without the executable bit set on some platforms.
 * This script fixes that after npm install.
 */

const fs   = require('fs');
const path = require('path');

// Walk up to workspace root node_modules
const nm = path.join(__dirname, '..', '..', '..', 'node_modules');
const prebuilds = path.join(nm, 'node-pty', 'prebuilds');

if (!fs.existsSync(prebuilds)) {
    // Nothing to fix (Windows or not installed yet)
    process.exit(0);
}

let fixed = 0;
for (const entry of fs.readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, entry, 'spawn-helper');
    if (fs.existsSync(helper)) {
        try {
            fs.chmodSync(helper, 0o755);
            fixed++;
        } catch (e) {
            // Non-fatal; might already be correct or no permission
        }
    }
}

if (fixed > 0) {
    console.log(`[postinstall] Fixed node-pty spawn-helper permissions (${fixed} files)`);
}
