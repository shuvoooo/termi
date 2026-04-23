#!/usr/bin/env bash
# scripts/electron-build.sh
# Full build pipeline for the Termi Electron desktop app.
#
# Usage:
#   bash scripts/electron-build.sh          # all platforms (requires cross-build env)
#   bash scripts/electron-build.sh --mac    # macOS only
#   bash scripts/electron-build.sh --win    # Windows only
#   bash scripts/electron-build.sh --linux  # Linux only

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET_FLAG="${1:-}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Termi — Electron Build            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── 1. Install dependencies ─────────────────────────────────────────────────
echo "▶ Installing dependencies…"
npm install --workspaces --if-present

# ─── 2. Build Next.js (standalone output) ────────────────────────────────────
echo ""
echo "▶ Building Next.js (standalone)…"
npm run build --workspace=apps/web

# Copy static assets into the standalone directory
echo "  Copying static assets…"
mkdir -p apps/web/.next/standalone/.next
cp -r apps/web/.next/static  apps/web/.next/standalone/.next/static
cp -r apps/web/public        apps/web/.next/standalone/public

# ─── 3. Build Gateway ────────────────────────────────────────────────────────
echo ""
echo "▶ Building Gateway…"
npm run build --workspace=apps/gateway

# ─── 4. Create empty SQLite database template ────────────────────────────────
echo ""
echo "▶ Creating empty SQLite database template…"
TEMPLATE_DB="$ROOT/apps/electron/resources/empty.db"
(
  cd "$ROOT/apps/web"
  DATABASE_URL="file:$TEMPLATE_DB" \
      npx prisma db push \
          --accept-data-loss
)
echo "  Template created: $TEMPLATE_DB"

# ─── 5. Compile Electron TypeScript ──────────────────────────────────────────
echo ""
echo "▶ Compiling Electron main process…"
npm run build --workspace=apps/electron

# ─── 6. Generate Prisma client for the SQLite schema ─────────────────────────
echo ""
echo "▶ Generating Prisma client (SQLite)…"
(
  cd "$ROOT/apps/web"
  npx prisma generate
)

# ─── 7. Package with electron-builder ────────────────────────────────────────
echo ""
echo "▶ Packaging with electron-builder…"
cd apps/electron

case "$TARGET_FLAG" in
    --mac)   npm run dist:mac   ;;
    --win)   npm run dist:win   ;;
    --linux) npm run dist:linux ;;
    *)       npm run dist       ;;
esac

echo ""
echo "✅  Build complete. Distributables are in apps/electron/release/"
