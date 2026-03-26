/**
 * Server Monitoring Service
 *
 * Runs periodic health checks for all enabled servers.
 * Tracks consecutive failures and fires alerts via alert.service.
 *
 * Called from instrumentation.ts on server startup via node-cron.
 */

import { prisma } from '@/lib/db';
import { checkReachability, getSSHMetrics } from './metrics.service';
import { sendServerDownAlert, sendServerUpAlert } from './alert.service';
import { decryptCredentials } from '@/lib/crypto/credentials';

// ============================================================================
// HEALTH CHECK RUNNER
// ============================================================================

/**
 * Run one health check pass for ALL servers that have monitoring enabled.
 * Called by the cron scheduler every minute.
 *
 * GATING: Only servers where the user has toggled monitoring ON
 * (enabled = true) are processed. Disabled servers are completely skipped —
 * no health records are stored and no alerts are sent.
 */
export async function runMonitoringPass(): Promise<void> {
    // Only process configs the user has explicitly enabled
    const configs = await prisma.serverMonitorConfig.findMany({
        where: { enabled: true },
        include: {
            server: {
                select: {
                    id: true,
                    host: true,
                    port: true,
                    protocol: true,
                    username: true,
                    password: true,
                    privateKey: true,
                    passphrase: true,
                },
            },
        },
    });

    if (configs.length === 0) return;

    const now = new Date();

    // Run checks in parallel (but cap concurrency to avoid hammering)
    const CONCURRENCY = 10;
    for (let i = 0; i < configs.length; i += CONCURRENCY) {
        const batch = configs.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map(cfg => checkServer(cfg, now)));
    }
}

interface MonitorConfig {
    id: string;
    serverId: string;
    userId: string;
    checkIntervalMinutes: number;
    failureThreshold: number;
    consecutiveFailures: number;
    alertSent: boolean;
    lastCheckedAt: Date | null;
    server: {
        id: string;
        host: string;
        port: number;
        protocol: string;
        username: string;
        password: string | null;
        privateKey: string | null;
        passphrase: string | null;
    };
}

async function checkServer(cfg: MonitorConfig, now: Date): Promise<void> {
    // Respect the configured interval — skip if not due yet
    if (cfg.lastCheckedAt) {
        const msSinceLastCheck = now.getTime() - cfg.lastCheckedAt.getTime();
        const msInterval = cfg.checkIntervalMinutes * 60 * 1000;
        if (msSinceLastCheck < msInterval) return;
    }

    let reachable = false;
    let latencyMs: number | undefined;
    let cpuPercent: number | null = null;
    let ramPercent: number | null = null;
    let diskPercent: number | null = null;

    try {
        const result = await checkReachability(cfg.server.host, cfg.server.port, 5000);
        reachable = result.reachable;
        latencyMs = result.latencyMs;
    } catch {
        reachable = false;
    }

    // Collect SSH metrics if server is reachable and is SSH protocol
    if (reachable && cfg.server.protocol === 'SSH') {
        try {
            // Decrypt credentials using system key (no master key in background job)
            const creds = decryptCredentials({
                host: cfg.server.host,
                username: cfg.server.username,
                password: cfg.server.password ?? undefined,
                privateKey: cfg.server.privateKey ?? undefined,
                passphrase: cfg.server.passphrase ?? undefined,
            });
            const metrics = await getSSHMetrics({
                host: creds.host,
                port: cfg.server.port,
                username: creds.username,
                password: creds.password,
                privateKey: creds.privateKey,
                passphrase: creds.passphrase,
            }, 10000);
            if (!metrics.error) {
                cpuPercent = metrics.cpu ?? null;
                ramPercent = metrics.ram?.percent ?? null;
                diskPercent = metrics.disk?.percent ?? null;
            }
        } catch {
            // SSH metrics are best-effort — don't fail the health check
        }
    }

    // Persist health record (keep last 100 per server)
    await prisma.serverHealthRecord.create({
        data: {
            serverId: cfg.serverId,
            reachable,
            latencyMs: latencyMs ?? null,
            cpuPercent,
            ramPercent,
            diskPercent,
            checkedAt: now,
        },
    });

    // Prune old records (keep last 100)
    const records = await prisma.serverHealthRecord.findMany({
        where: { serverId: cfg.serverId },
        orderBy: { checkedAt: 'desc' },
        select: { id: true },
    });
    if (records.length > 100) {
        const toDelete = records.slice(100).map(r => r.id);
        await prisma.serverHealthRecord.deleteMany({ where: { id: { in: toDelete } } });
    }

    const newFailures = reachable ? 0 : cfg.consecutiveFailures + 1;
    const isDown = newFailures >= cfg.failureThreshold;

    // Alert logic — only fires when monitoring is enabled (guaranteed by the
    // query above) and the alert channel settings chosen by the user.
    let alertSent = cfg.alertSent;

    if (isDown && !cfg.alertSent) {
        // Threshold reached for the first time → send down alert
        try {
            await sendServerDownAlert(cfg.serverId);
            alertSent = true;
        } catch (err) {
            console.error(`[Monitor] Failed to send down alert for server ${cfg.serverId}:`, err);
        }
    }

    if (reachable && cfg.alertSent) {
        // Server is back up after an alerted outage → send recovery alert
        try {
            await sendServerUpAlert(cfg.serverId);
            alertSent = false;
        } catch (err) {
            console.error(`[Monitor] Failed to send up alert for server ${cfg.serverId}:`, err);
        }
    }

    // Update the monitor config state
    await prisma.serverMonitorConfig.update({
        where: { id: cfg.id },
        data: {
            lastCheckedAt: now,
            lastStatus: reachable,
            consecutiveFailures: newFailures,
            alertSent,
        },
    });
}

// ============================================================================
// SINGLE SERVER CHECK (used by API)
// ============================================================================

export async function checkSingleServer(serverId: string): Promise<{
    reachable: boolean;
    latencyMs?: number;
}> {
    const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { host: true, port: true },
    });
    if (!server) return { reachable: false };
    return checkReachability(server.host, server.port, 5000);
}
