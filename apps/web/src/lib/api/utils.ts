/**
 * API Utilities and Response Helpers
 */

import { NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    errors?: Record<string, string[]>;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function successResponse<T>(data: T, status: number = 200) {
    return NextResponse.json<ApiResponse<T>>(
        { success: true, data },
        { status }
    );
}

export function errorResponse(error: string, status: number = 400) {
    return NextResponse.json<ApiResponse>(
        { success: false, error },
        { status }
    );
}

export function validationErrorResponse(errors: Record<string, string[]>) {
    return NextResponse.json<ApiResponse>(
        { success: false, error: 'Validation failed', errors },
        { status: 400 }
    );
}

export function unauthorizedResponse(message: string = 'Unauthorized') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 401 }
    );
}

export function forbiddenResponse(message: string = 'Forbidden') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 403 }
    );
}

export function notFoundResponse(message: string = 'Not found') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 404 }
    );
}

export function serverErrorResponse(message: string = 'Internal server error') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 500 }
    );
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate request body against a Zod schema
 */
export async function validateBody<T>(
    request: Request,
    schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
    try {
        const body = await request.json();
        const data = schema.parse(body);
        return { data };
    } catch (e) {
        if (e instanceof ZodError) {
            const errors: Record<string, string[]> = {};
            for (const issue of e.issues) {
                const path = issue.path.join('.');
                if (!errors[path]) {
                    errors[path] = [];
                }
                errors[path].push(issue.message);
            }
            return { error: validationErrorResponse(errors) };
        }
        return { error: errorResponse('Invalid JSON body') };
    }
}

// ============================================================================
// REQUEST HELPERS
// ============================================================================

/**
 * Get client IP address from request.
 *
 * Priority order:
 * 1. cf-connecting-ip  — set by Cloudflare; cannot be spoofed by end-users.
 * 2. x-real-ip         — set by a single trusted reverse proxy (nginx/caddy).
 * 3. x-forwarded-for   — only trusted when TRUSTED_PROXY=true is set, because
 *                        the header is user-controllable in direct deployments.
 *
 * Without a reverse proxy, none of these headers are set and the connection
 * address would need to come from the runtime (not available in Next.js edge).
 * We fall back to 'unknown' which is safe — rate limits will bucket to a
 * single shared key, providing conservative protection rather than bypassing.
 */
export function getClientIP(request: Request): string {
    // Cloudflare — always authoritative when present
    const cfIP = request.headers.get('cf-connecting-ip');
    if (cfIP) return cfIP.trim();

    // Single-proxy real IP (nginx `proxy_set_header X-Real-IP $remote_addr`)
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP.trim();

    // X-Forwarded-For — only trust if explicitly configured (behind a trusted proxy)
    if (process.env.TRUSTED_PROXY === 'true') {
        const forwardedFor = request.headers.get('x-forwarded-for');
        if (forwardedFor) {
            // Take the last untrusted IP (rightmost entry added by our proxy)
            const ips = forwardedFor.split(',').map((s) => s.trim());
            return ips[ips.length - 1] || 'unknown';
        }
    }

    return 'unknown';
}

/**
 * Get device info from User-Agent
 */
export function getDeviceInfo(request: Request): string {
    return request.headers.get('user-agent') || 'Unknown Device';
}
