# Termi Web Application Dockerfile
# Multi-stage build for production

# Stage 1: Dependencies
# Use Debian-based image so npm correctly installs glibc optional native binaries
# (lightningcss, @tailwindcss/oxide). These packages are absent from the lockfile's
# packages section because it was generated on macOS; npm install at the root level
# (not workspace-scoped) triggers proper cross-platform optional dep resolution.
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy ALL workspace package.json files so npm can resolve the full workspace graph
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY apps/gateway/package.json ./apps/gateway/

# Install deps. Then explicitly install the correct linux native packages that are absent
# from the lockfile (generated on macOS); npm never adds them automatically.
# Detects CPU arch at build time so the same Dockerfile works on both x64 and arm64.
RUN npm install && \
    LCSS_VER=$(node -p "require('./node_modules/lightningcss/package.json').version") && \
    OXIDE_VER=$(node -p "require('./node_modules/@tailwindcss/oxide/package.json').version") && \
    ARCH=$(node -p "process.arch === 'arm64' ? 'arm64' : 'x64'") && \
    npm install --no-save \
      "lightningcss-linux-${ARCH}-gnu@${LCSS_VER}" \
      "@tailwindcss/oxide-linux-${ARCH}-gnu@${OXIDE_VER}"

# Stage 2: Builder
FROM node:20-slim AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=apps/web/prisma/schema.prisma

# Build application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy secrets required by env validation at build time (page data collection).
# These are NOT used at runtime — real secrets are injected via docker-compose env vars.
ENV SESSION_SECRET=build-time-placeholder-not-used-in-runtime-x
ENV ENCRYPTION_KEY=build-time-placeholder-not-used-in-runtime-x
ENV GATEWAY_JWT_SECRET=build-time-placeholder-not-used-in-runtime

RUN npm run build --workspace=apps/web

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/prisma ./apps/web/prisma

# Copy Prisma CLI so the entrypoint can run `prisma migrate deploy`
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

# Copy entrypoint script
COPY --from=builder /app/apps/web/docker-entrypoint.sh ./docker-entrypoint.sh

# Set permissions
RUN chown -R nextjs:nodejs /app \
 && chmod +x /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/docker-entrypoint.sh"]
