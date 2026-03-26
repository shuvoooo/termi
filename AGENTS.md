# Termi – Agent Guide

## Architecture Overview

Termi is an **npm workspaces monorepo** with two independently deployable services:

| App | Package | Port | Role |
|-----|---------|------|------|
| `apps/web` | `@termi/web` | 3000 | Next.js 15 App Router PWA + REST API + Prisma ORM |
| `apps/gateway` | `@termi/gateway` | 8080 | WebSocket gateway – proxies SSH/SCP/RDP/VNC |

A third component, **guacd** (Apache Guacamole daemon), must run separately on port 4822 for RDP/VNC:
```bash
docker run -d -p 4822:4822 --name termi-guacd guacamole/guacd:1.5.4
```

## Developer Workflows

```bash
# Install all workspaces
npm install

# Run both services concurrently (recommended)
npm run dev:all          # web on :3000, gateway on :8080

# Database (run from repo root)
npm run db:generate      # regenerate Prisma client after schema changes
npm run db:migrate       # create + apply a new migration
npm run db:push          # push schema without migrations (dev only)
npm run db:seed          # seed with prisma/seed.ts
npm run db:studio        # Prisma Studio UI

# Tests
npm run test             # vitest (web app)
npm run test:e2e         # Playwright

# Build
npm run build            # builds both apps sequentially
```

**Required env vars** – generate with `openssl rand -base64 32`:
- `DATABASE_URL`, `SESSION_SECRET` (≥32 chars), `ENCRYPTION_KEY`, `GATEWAY_JWT_SECRET`, `NEXT_PUBLIC_GATEWAY_URL`

## Connection Flow (Critical Path)

1. Browser calls `POST /api/connection/token` → web server decrypts stored credentials and issues a **5-minute JWE token** (A256GCM, key = SHA-256 of `GATEWAY_JWT_SECRET`).
2. Browser opens `ws://gateway:8080/connect?token=<jwe>&protocol=<ssh|scp|rdp|vnc>&serverId=<id>`.
3. Gateway validates the JWE (same key), routes to `SSHHandler`, `SCPHandler`, or `GuacamoleHandler`.
4. For RDP/VNC, `GuacamoleHandler` connects to guacd on port 4822 using the Guacamole protocol, then forwards raw Guacamole frames to the browser.
5. The browser-side bridge (`GatewayTunnel.ts`) wraps `guacamole-common-js` because the gateway sends JSON control frames *first* (e.g. `{"type":"connected"}`) then switches to raw Guacamole framing – `Guacamole.WebSocketTunnel` cannot handle this mixed protocol directly.

## Key Project Conventions

### Prisma Client – Non-standard Output
Prisma generates its client to `apps/web/src/app/generated/prisma` (see `prisma/schema.prisma`). Always import from:
```typescript
import { PrismaClient } from '@/app/generated/prisma/client';
// or enums:
import { Protocol } from '@/app/generated/prisma/client';
```
After schema changes, run `npm run db:generate` before building.

### API Route Pattern
Every `route.ts` uses helpers from `@/lib/api`:
```typescript
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
const schema = z.object({ ... });
const validation = await validateBody(request, schema);
if ('error' in validation) return validation.error;
```

### Credential Encryption
All `host`, `username`, `password`, `privateKey`, `passphrase`, `notes` fields on the `Server` model are **AES-256-GCM encrypted** before storage. Use `encryptCredentials` / `decryptCredentials` from `@/lib/crypto` and never write plaintext to those fields. The optional user master key adds a second encryption layer via PBKDF2 key derivation.

### SSRF Protection
Any API route that accepts a user-supplied host **must** call `validateHost()`:
```typescript
import { validateHost } from '@/lib/security/ssrf';
const result = await validateHost(host);
if (!result.valid) return errorResponse(result.error!, 400);
```

### Gateway – Pure ESM
`apps/gateway` uses `"type": "module"`. All local imports must include the `.js` extension even for TypeScript source files (e.g. `import { SSHHandler } from './handlers/ssh.js'`).

### Security Headers / CSP
`apps/web/src/proxy.ts` is the Next.js middleware that applies CSP and all security headers. It exports `middleware` (the required Next.js name) and `config` with a `matcher`. Nonces are generated per-request and forwarded via the `x-nonce` request header to server components.

### Native Modules / Bundling
`ssh2` (used by `metrics.service.ts` and `sftp.service.ts`) has native addons (`cpu-features`, `sshcrypto`). It is listed in `next.config.mjs → serverExternalPackages` so Next.js/Turbopack does not try to bundle it.

## Key Files Reference

| Purpose | Path |
|---------|------|
| Gateway entry point | `apps/gateway/src/index.ts` |
| JWE token issue/validate | `apps/web/src/app/api/connection/token/route.ts`, `apps/gateway/src/auth/token.ts` |
| Credential crypto | `apps/web/src/lib/crypto/crypto.ts`, `credentials.ts` |
| Session management | `apps/web/src/lib/auth/session.ts` (iron-session, 7-day TTL) |
| Multi-tab sessions UI | `apps/web/src/app/dashboard/sessions-context.tsx` (persisted to `sessionStorage`) |
| Guacamole bridge | `apps/web/src/components/terminal/GatewayTunnel.ts` |
| SFTP file operations | `apps/web/src/lib/services/sftp.service.ts` (stateless – opens/closes per call) |
| DB singleton | `apps/web/src/lib/db/prisma.ts` (PrismaPg adapter with pg Pool) |

