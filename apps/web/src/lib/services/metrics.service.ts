/**
 * Server Metrics Service
 *
 * Agentless metrics collection via TCP port check (all protocols)
 * and SSH command execution (SSH servers only).
 */

import * as net from 'net';
import { Client, ConnectConfig } from 'ssh2';

// ============================================================================
// TYPES
// ============================================================================

export interface ServerMetrics {
    reachable: boolean;
    latencyMs?: number;
    cpu?: number;       // percentage 0–100
    ram?: {
        usedBytes: number;
        totalBytes: number;
        percent: number;
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

        socket.setTimeout(timeoutMs);

        socket.connect(port, host, () => {
            const latencyMs = Date.now() - start;
            socket.destroy();
            resolve({ reachable: true, latencyMs });
        });

        socket.on('error', () => {
            socket.destroy();
            resolve({ reachable: false });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ reachable: false });
        });
    });
}

// ============================================================================
// SSH METRICS
// ============================================================================

// One-shot bash command that collects all metrics.
// Output: 5 lines
//   line 1: total1 idle1      — CPU sample 1 (/proc/stat)
//   line 2: total2 idle2      — CPU sample 2 (0.3 s later)
//   line 3: memTotalB memAvailB — bytes
//   line 4: diskTotalB diskUsedB — bytes (root partition)
//   line 5: rxBytes txBytes   — cumulative (all interfaces)
const SSH_METRICS_CMD = [
    `awk 'NR==1{for(i=2;i<=NF;i++)t+=$i;print t,$5}' /proc/stat`,
    `sleep 0.3`,
    `awk 'NR==1{for(i=2;i<=NF;i++)t+=$i;print t,$5}' /proc/stat`,
    `awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print t*1024,a*1024}' /proc/meminfo`,
    `df -B1 / | awk 'NR==2{print $2,$3}'`,
    `awk 'NR>2{rx+=$2;tx+=$10}END{printf "%d %d\\n",rx,tx}' /proc/net/dev`,
].join('; ');

interface SSHConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

export function getSSHMetrics(
    config: SSHConfig,
    timeoutMs = 12000
): Promise<ServerMetrics> {
    return new Promise((resolve) => {
        const client = new Client();
        let settled = false;

        const done = (metrics: ServerMetrics) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                client.end();
                resolve(metrics);
            }
        };

        const timer = setTimeout(() => {
            done({ reachable: true, error: 'Metrics collection timed out' });
        }, timeoutMs);

        client.on('ready', () => {
            client.exec(SSH_METRICS_CMD, (err, stream) => {
                if (err) {
                    done({ reachable: true, error: 'Failed to execute metrics command' });
                    return;
                }

                let output = '';
                stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
                stream.stderr.on('data', () => { /* ignore */ });

                stream.on('close', () => {
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

                        const dtotal = total2 - total1;
                        const didle = idle2 - idle1;
                        const cpu = dtotal > 0
                            ? Math.min(100, Math.max(0, Math.round(((dtotal - didle) / dtotal) * 100)))
                            : 0;

                        const ramUsed = memTotal - memAvail;

                        done({
                            reachable: true,
                            cpu,
                            ram: {
                                usedBytes: ramUsed,
                                totalBytes: memTotal,
                                percent: memTotal > 0
                                    ? Math.round((ramUsed / memTotal) * 100)
                                    : 0,
                            },
                            disk: {
                                usedBytes: diskUsed,
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
            });
        });

        client.on('error', (err) => {
            done({ reachable: true, error: `SSH error: ${err.message}` });
        });

        const connectConfig: ConnectConfig = {
            host: config.host,
            port: config.port,
            username: config.username,
            readyTimeout: timeoutMs,
        };

        if (config.privateKey) {
            connectConfig.privateKey = config.privateKey;
            if (config.passphrase) connectConfig.passphrase = config.passphrase;
        } else if (config.password) {
            connectConfig.password = config.password;
        }

        client.connect(connectConfig);
    });
}