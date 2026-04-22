/**
 * Term Database Client
 *
 * Singleton Prisma client instance for SQLite (Electron offline mode).
 * The DATABASE_URL env var must be a file: URL, e.g. file:/path/to/termi.db
 */

import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@/app/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
    const url = process.env.DATABASE_URL ?? 'file:./termi.db';
    const adapter = new PrismaLibSql({ url });
    return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;
