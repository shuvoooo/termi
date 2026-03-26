#!/bin/sh
# Termi Web — Docker entrypoint
# Runs Prisma migrations against the external database, then starts the Next.js server.
set -e

echo "Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy --schema=apps/web/prisma/schema.prisma

echo "Starting server..."
exec node apps/web/server.js

