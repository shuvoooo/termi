# Termi Web Application Dockerfile
# Multi-stage build for production

# Stage 1: Dependencies
# Use Debian-based image so npm correctly installs glibc optional native binaries
# (lightningcss, @tailwindcss/oxide). These packages are absent from the lockfile's
# packages section because it was generated on macOS; npm install at the root level
# (not workspace-scoped) triggers proper cross-platform optional dep resolution.
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl openssh-client && rm -rf /var/lib/apt/lists/*
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

RUN apt-get update -y && apt-get install -y openssl

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=apps/web/prisma/schema.prisma

# Build-time arguments — passed via docker-compose build.args
ARG NEXT_PUBLIC_GATEWAY_URL
ARG NEXT_PUBLIC_APP_URL
ARG SESSION_SECRET=build-time-placeholder-not-used-in-runtime-x
ARG ENCRYPTION_KEY=build-time-placeholder-not-used-in-runtime-x
ARG GATEWAY_JWT_SECRET=build-time-placeholder-not-used-in-runtime

# Build application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# NEXT_PUBLIC_* vars are baked into the JS bundle — must be set at build time.
ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
# Server-side secrets required by env validation at build time only.
# Real values are injected at runtime via docker-compose environment.
ENV SESSION_SECRET=${SESSION_SECRET}
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENV GATEWAY_JWT_SECRET=${GATEWAY_JWT_SECRET}

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

# Set permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
