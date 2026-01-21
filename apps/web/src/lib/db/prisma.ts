/**
 * Term Database Client
 * 
 * Singleton Prisma client instance with proper configuration
 * for both development and production environments.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prevent multiple Prisma Client instances in development
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

// Create PostgreSQL connection pool
const pool = globalForPrisma.pool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
});

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
}

// Create Prisma adapter
const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;
