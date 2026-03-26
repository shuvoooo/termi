/**
 * In-Memory Rate Limiter
 *
 * Sliding-window rate limiter for protecting auth endpoints.
 * For multi-instance deployments, swap the Map for a Redis-backed store.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number; // epoch ms
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store.entries()) {
            if (entry.resetAt < now) {
                store.delete(key);
            }
        }
    }, 5 * 60 * 1000);
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number; // epoch ms
}

/**
 * Check and update the rate limit for a key.
 *
 * @param key      - Unique identifier (e.g., "login:127.0.0.1")
 * @param limit    - Maximum number of requests in the window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(
    key: string,
    limit: number,
    windowMs: number
): RateLimitResult {
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs };
        store.set(key, entry);
    }

    entry.count++;

    return {
        allowed: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        resetAt: entry.resetAt,
    };
}

// ============================================================================
// PRE-CONFIGURED LIMITERS
// ============================================================================

/** 10 login attempts per 15 minutes per IP */
export function loginRateLimit(ip: string): RateLimitResult {
    return rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
}

/** 5 register attempts per hour per IP */
export function registerRateLimit(ip: string): RateLimitResult {
    return rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
}

/** 5 verify-2FA attempts per 5 minutes per IP */
export function verify2FARateLimit(ip: string): RateLimitResult {
    return rateLimit(`verify2fa:${ip}`, 5, 5 * 60 * 1000);
}

/** 3 email OTP send requests per 10 minutes per user */
export function emailOtpRateLimit(userId: string): RateLimitResult {
    return rateLimit(`emailotp:${userId}`, 3, 10 * 60 * 1000);
}

/** 3 credential reveal attempts per 5 minutes per user */
export function credentialRevealRateLimit(userId: string): RateLimitResult {
    return rateLimit(`reveal:${userId}`, 3, 5 * 60 * 1000);
}

