/**
 * Server Metrics Service
 *
 * Agentless metrics collection via TCP port check (all protocols)
 * and SSH command execution (SSH servers only).
 */

import * as net from 'net';
import { sshPool, SSHPoolConfig } from './ssh-pool';

// ============================================================================
// TYPES
// ============================================================================

export interface ServerMetrics {
    reachable: boolean;
    latencyMs?: number;
    cpu?: number;           // percentage 0–100
    cpuModel?: string;      // e.g. "Intel(R) Xeon(R) CPU E5-2690 v2 @ 3.00GHz"
    ram?: {
        usedBytes: number;
        totalBytes: number;
        percent: number;
        speedMhz?: number;  // e.g. 3200 (reported as MT/s ≈ MHz for DDR)
    };
    disk?: {
        usedBytes: number;
        totalBytes: number;
        percent: number;
    };
    network?: {
        rxBytes: number;
        txBytes: number;
    };
    error?: string;
}

// ============================================================================
// TCP REACHABILITY
// ============================================================================

export function checkReachability(
    host: string,
    port: number,
    timeoutMs = 5000
): Promise<{ reachable: boolean; latencyMs?: number }> {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        let settled = false;

        const done = (result: { reachable: boolean; latencyMs?: number }) => {
            if (!settled) {
                settled = true;
                socket.destroy();
                resolve(result);
            }
        };

        socket.setTimeout(timeoutMs);

        socket.connect(port, host, () => {
            done({ reachable: true, latencyMs: Date.now() - start });
        });

        socket.on('error', () => done({ reachable: false }));
        socket.on('timeout', () => done({ reachable: false }));
    });
}

// ============================================================================
// SSH METRICS
// ============================================================================

// One-shot bash command that collects all metrics.
// Output: 7 lines
//   line 1: total1 idle1          — CPU sample 1 (/proc/stat)
//   line 2: total2 idle2          — CPU sample 2 (0.3 s later)
//   line 3: memTotalB memAvailB   — bytes
//   line 4: diskTotalB diskUsedB  — bytes (root partition)
//   line 5: rxBytes txBytes       — cumulative (all interfaces)
//   line 6: CPU model name        — e.g. "Intel(R) Xeon(R) CPU E5-2690 v2 @ 3.00GHz"
//   line 7: RAM speed MT/s        — e.g. "3200" (may be empty if dmidecode unavailable)
const SSH_METRICS_CMD = [
    `awk 'NR==1{for(i=2;i<=NF;i++)t+=$i;print t,$5}' /proc/stat`,
    `sleep 0.3`,
    `awk 'NR==1{for(i=2;i<=NF;i++)t+=$i;print t,$5}' /proc/stat`,
    `awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print t*1024,a*1024}' /proc/meminfo`,
    `df -B1 / | awk 'NR==2{print $2,$3}'`,
    `awk 'NR>2{rx+=$2;tx+=$10}END{printf "%d %d\\n",rx,tx}' /proc/net/dev`,
    `printf '%s\\n' "$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^[[:space:]]*//')"`,
    `printf '%s\\n' "$(dmidecode -t memory 2>/dev/null | grep -i 'configured.*speed' | grep -vE 'Unknown|0 MT' | head -1 | grep -oE '[0-9]+' | head -1)"`,
].join('; ');

interface SSHConfig extends SSHPoolConfig {}

export function getSSHMetrics(
    config: SSHConfig,
    timeoutMs = 12000
): Promise<ServerMetrics> {
    return new Promise((resolve) => {
        let poolKey: string | undefined;
        let released = false;

        const done = (metrics: ServerMetrics) => {
            if (!released) {
                released = true;
                if (poolKey) sshPool.release(poolKey);
            }
            resolve(metrics);
        };

        sshPool
            .acquire(config)
            .then(({ client, key }) => {
                poolKey = key;

                const timer = setTimeout(() => {
                    done({ reachable: true, error: 'Metrics collection timed out' });
                }, timeoutMs);

                client.exec(SSH_METRICS_CMD, (err, stream) => {
                    if (err) {
                        clearTimeout(timer);
                        done({ reachable: true, error: 'Failed to execute metrics command' });
                        return;
                    }

                    let output = '';
                    stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
                    stream.stderr.on('data', () => { /* ignore */ });

                    stream.on('close', () => {
                        clearTimeout(timer);
                        try {
                            const lines = output.trim().split('\n');
                            if (lines.length < 5) {
                                done({ reachable: true, error: 'Incomplete metrics output' });
                                return;
                            }

                            const [total1, idle1] = lines[0].trim().split(/\s+/).map(Number);
                            const [total2, idle2] = lines[1].trim().split(/\s+/).map(Number);
                            const [memTotal, memAvail] = lines[2].trim().split(/\s+/).map(Number);
                            const [diskTotal, diskUsed] = lines[3].trim().split(/\s+/).map(Number);
                            const [rxBytes, txBytes] = lines[4].trim().split(/\s+/).map(Number);

                            // Optional hardware info (lines 5 and 6)
                            const cpuModel = lines[5]?.trim() || undefined;
                            const ramSpeedRaw = lines[6]?.trim();
                            const ramSpeedMhz = ramSpeedRaw ? (parseInt(ramSpeedRaw, 10) || undefined) : undefined;

                            const dtotal = total2 - total1;
                            const didle  = idle2 - idle1;
                            const cpu = dtotal > 0
                                ? Math.min(100, Math.max(0, Math.round(((dtotal - didle) / dtotal) * 100)))
                                : 0;

                            const ramUsed = memTotal - memAvail;

                            done({
                                reachable: true,
                                cpu,
                                cpuModel,
                                ram: {
                                    usedBytes:  ramUsed,
                                    totalBytes: memTotal,
                                    percent: memTotal > 0
                                        ? Math.round((ramUsed / memTotal) * 100)
                                        : 0,
                                    speedMhz: ramSpeedMhz,
                                },
                                disk: {
                                    usedBytes:  diskUsed,
                                    totalBytes: diskTotal,
                                    percent: diskTotal > 0
                                        ? Math.round((diskUsed / diskTotal) * 100)
                                        : 0,
                                },
                                network: { rxBytes, txBytes },
                            });
                        } catch {
                            done({ reachable: true, error: 'Failed to parse metrics output' });
                        }
                    });

                    stream.on('error', () => {
                        clearTimeout(timer);
                        done({ reachable: true, error: 'Stream error during metrics collection' });
                    });
                });
            })
            .catch((err) => {
                resolve({
                    reachable: true,
                    error: `SSH connect error: ${err instanceof Error ? err.message : String(err)}`,
                });
            });
    });
}