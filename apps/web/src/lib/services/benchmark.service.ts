/**
 * Server Benchmark Service
 *
 * Agentless hardware benchmarking via SSH using only built-in Linux tools:
 *   - lscpu / /proc/meminfo / df    → hardware info
 *   - openssl speed sha256          → CPU throughput (python3 fallback)
 *   - dd to /dev/shm                → RAM bandwidth (tmpfs = physical RAM)
 *   - dd to /tmp (conv=fdatasync)   → disk sequential read/write
 *
 * No installation required on the target server.
 */

import { Client, ConnectConfig } from 'ssh2';

// ============================================================================
// TYPES
// ============================================================================

export interface BenchmarkHardwareInfo {
    cpuModel: string;
    cpuCores: number;
    cpuThreads: number;
    cpuFreqMhz: number | null;
    arch: string;
    ramTotalBytes: number;
    diskTotalBytes: number;
    diskUsedBytes: number;
    os: string;
}

export interface BenchmarkResults {
    hardware: BenchmarkHardwareInfo;
    /** CPU SHA-256 hashing throughput */
    cpu: { sha256MBps: number } | null;
    /** RAM bandwidth via /dev/shm (tmpfs backed by physical RAM) */
    ram: { writeMBps: number; readMBps: number } | null;
    /** Disk sequential I/O via /tmp with forced fsync */
    disk: { writeMBps: number; readMBps: number } | null;
    durationMs: number;
    error?: string;
}

export type BenchmarkPhase =
    | 'connecting'
    | 'hardware'
    | 'cpu'
    | 'ram_write'
    | 'ram_read'
    | 'disk_write'
    | 'disk_read'
    | 'done'
    | 'error';

export interface BenchmarkProgress {
    phase: BenchmarkPhase;
    message: string;
    /** Partial results accumulated so far — client merges these. */
    results?: Partial<BenchmarkResults>;
}

interface SSHConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

// ============================================================================
// PARSERS
// ============================================================================

/** Parse dd output: "... copied, 1.23 s, 773 MB/s" → MB/s */
function parseDdMBps(output: string): number | null {
    const m = output.match(/copied,\s*[\d.]+\s*s,\s*([\d.]+)\s*(GB|MB|kB|B)\/s/);
    if (!m) return null;
    const v = parseFloat(m[1]);
    switch (m[2]) {
        case 'GB': return v * 1024;
        case 'MB': return v;
        case 'kB': return v / 1024;
        default:   return v / (1024 * 1024);
    }
}

/** Parse openssl speed output for sha256 row → MB/s (uses last/largest block size) */
function parseOpensslSha256MBps(output: string): number | null {
    for (const line of output.split('\n')) {
        const t = line.trim();
        if (t.startsWith('sha256')) {
            const parts = t.split(/\s+/);
            const last = parts[parts.length - 1];
            const kb = parseFloat(last.replace(/k$/i, ''));
            if (!isNaN(kb) && kb > 0) return kb / 1024; // kB/s → MB/s
        }
    }
    return null;
}

/** Parse the combined hardware info block (sections separated by "|||") */
function parseHardwareInfo(output: string): BenchmarkHardwareInfo {
    const [lscpuRaw = '', memRaw = '', diskRaw = '', osRaw = ''] = output.split('|||');

    // lscpu key→value
    const lscpu: Record<string, string> = {};
    for (const line of lscpuRaw.split('\n')) {
        const i = line.indexOf(':');
        if (i > 0) lscpu[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }

    const cpuModel    = lscpu['Model name'] || lscpu['CPU'] || 'Unknown';
    const sockets     = parseInt(lscpu['Socket(s)'] || '1') || 1;
    const coresPerSoc = parseInt(lscpu['Core(s) per socket'] || '1') || 1;
    const threadsPerC = parseInt(lscpu['Thread(s) per core'] || '1') || 1;
    const freqStr     = lscpu['CPU max MHz'] || lscpu['CPU MHz'] || '';
    const cpuFreqMhz  = freqStr ? (Math.round(parseFloat(freqStr)) || null) : null;
    const arch        = lscpu['Architecture'] || 'unknown';

    // MemTotal: 16384000 kB
    const memMatch    = memRaw.match(/MemTotal:\s*(\d+)\s*kB/i);
    const ramTotalBytes = memMatch ? parseInt(memMatch[1]) * 1024 : 0;

    // df -B1: "<total> <used>"
    const diskParts   = diskRaw.trim().split(/\s+/);
    const diskTotalBytes = parseInt(diskParts[0]) || 0;
    const diskUsedBytes  = parseInt(diskParts[1]) || 0;

    const os = osRaw.trim().replace(/^"|"$/g, '') || 'Unknown';

    return {
        cpuModel,
        cpuCores:   sockets * coresPerSoc,
        cpuThreads: sockets * coresPerSoc * threadsPerC,
        cpuFreqMhz,
        arch,
        ramTotalBytes,
        diskTotalBytes,
        diskUsedBytes,
        os,
    };
}

// ============================================================================
// SSH HELPERS
// ============================================================================

function buildConnectConfig(config: SSHConfig): ConnectConfig {
    const c: ConnectConfig = {
        host:         config.host,
        port:         config.port,
        username:     config.username,
        readyTimeout: 15000,
    };
    if (config.privateKey?.trim()) {
        c.privateKey = config.privateKey;
        if (config.passphrase?.trim()) c.passphrase = config.passphrase;
    }
    if (config.password?.trim()) {
        c.password     = config.password;
        c.tryKeyboard  = true;
    }
    return c;
}

function execSSH(client: Client, cmd: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Command timed out')),
            timeoutMs
        );
        client.exec(cmd, (err, stream) => {
            if (err) { clearTimeout(timer); return reject(err); }
            let out = '';
            stream.on('data', (c: Buffer) => { out += c.toString(); });
            // dd writes its stats to stderr
            stream.stderr.on('data', (c: Buffer) => { out += c.toString(); });
            stream.on('close', () => { clearTimeout(timer); resolve(out); });
        });
    });
}

// ============================================================================
// MAIN BENCHMARK RUNNER
// ============================================================================

const EMPTY_HARDWARE: BenchmarkHardwareInfo = {
    cpuModel: 'Unknown', cpuCores: 0, cpuThreads: 0,
    cpuFreqMhz: null, arch: 'unknown',
    ramTotalBytes: 0, diskTotalBytes: 0, diskUsedBytes: 0, os: 'Unknown',
};

export async function runBenchmark(
    config: SSHConfig,
    onProgress: (p: BenchmarkProgress) => void
): Promise<BenchmarkResults> {
    const startMs  = Date.now();
    const partial: Partial<BenchmarkResults> = {};

    return new Promise((resolve) => {
        const client = new Client();

        if (config.password) {
            client.on('keyboard-interactive', (_n, _i, _l, _p, finish) => {
                finish([config.password!]);
            });
        }

        const finish = (extra: Partial<BenchmarkResults> = {}) => {
            try { client.end(); } catch { /* ignore */ }
            resolve({
                hardware:    partial.hardware ?? EMPTY_HARDWARE,
                cpu:         partial.cpu  ?? null,
                ram:         partial.ram  ?? null,
                disk:        partial.disk ?? null,
                durationMs:  Date.now() - startMs,
                ...extra,
            });
        };

        client.on('error', (err) => {
            onProgress({ phase: 'error', message: `SSH error: ${err.message}` });
            finish({ error: err.message });
        });

        client.on('ready', async () => {
            try {
                // ── 1. Hardware info (fast) ───────────────────────────────
                onProgress({ phase: 'hardware', message: 'Collecting hardware information…' });

                const hwCmd = [
                    'lscpu 2>/dev/null',
                    'echo "|||"',
                    'grep "^MemTotal" /proc/meminfo 2>/dev/null',
                    'echo "|||"',
                    `df -B1 / 2>/dev/null | awk 'NR==2{print $2,$3}'`,
                    'echo "|||"',
                    `(grep "^PRETTY_NAME" /etc/os-release 2>/dev/null | cut -d= -f2) || uname -sr`,
                ].join('; ');

                const hwOut = await execSSH(client, hwCmd, 15000);
                partial.hardware = parseHardwareInfo(hwOut);
                onProgress({
                    phase:   'hardware',
                    message: 'Hardware info collected',
                    results: { hardware: partial.hardware },
                });

                // ── 2. CPU benchmark (~3 s) ───────────────────────────────
                onProgress({ phase: 'cpu', message: 'Running CPU benchmark (~3s)…' });

                let sha256MBps: number | null = null;

                // Primary: openssl speed (virtually universal)
                const cpuOut = await execSSH(
                    client,
                    'openssl speed -seconds 2 sha256 2>&1',
                    15000
                );
                sha256MBps = parseOpensslSha256MBps(cpuOut);

                // Fallback: python3 SHA-256 compute loop
                if (!sha256MBps) {
                    const pyOut = await execSSH(
                        client,
                        `python3 -c "import time,hashlib; d=b'x'*65536; t=time.time(); [hashlib.sha256(d).digest() for _ in range(500)]; e=time.time()-t; print(f'{65536*500/1024/1024/e:.1f}')" 2>/dev/null`,
                        15000
                    );
                    const pyVal = parseFloat(pyOut.trim());
                    if (!isNaN(pyVal) && pyVal > 0) sha256MBps = pyVal;
                }

                if (sha256MBps) {
                    partial.cpu = { sha256MBps: Math.round(sha256MBps) };
                    onProgress({
                        phase:   'cpu',
                        message: `CPU SHA-256: ${Math.round(sha256MBps)} MB/s`,
                        results: { cpu: partial.cpu },
                    });
                } else {
                    onProgress({ phase: 'cpu', message: 'CPU benchmark unavailable' });
                }

                // ── 3. RAM write (256 MB → /dev/shm, which is tmpfs = real RAM) ──
                onProgress({ phase: 'ram_write', message: 'Benchmarking RAM write speed (256 MB)…' });

                const ramWriteOut = await execSSH(
                    client,
                    'dd if=/dev/zero of=/dev/shm/.termi_bench bs=1M count=256 conv=fsync 2>&1',
                    90000
                );
                const ramWriteMBps = parseDdMBps(ramWriteOut);
                onProgress({
                    phase:   'ram_write',
                    message: ramWriteMBps
                        ? `RAM write: ${Math.round(ramWriteMBps)} MB/s`
                        : 'RAM write complete',
                });

                // ── 4. RAM read (256 MB from /dev/shm) ───────────────────
                onProgress({ phase: 'ram_read', message: 'Benchmarking RAM read speed (256 MB)…' });

                const ramReadOut = await execSSH(
                    client,
                    'dd if=/dev/shm/.termi_bench of=/dev/null bs=1M 2>&1; rm -f /dev/shm/.termi_bench',
                    90000
                );
                const ramReadMBps = parseDdMBps(ramReadOut);

                if (ramWriteMBps || ramReadMBps) {
                    partial.ram = {
                        writeMBps: Math.round(ramWriteMBps ?? 0),
                        readMBps:  Math.round(ramReadMBps ?? 0),
                    };
                    onProgress({
                        phase:   'ram_read',
                        message: ramReadMBps
                            ? `RAM read: ${Math.round(ramReadMBps)} MB/s`
                            : 'RAM read complete',
                        results: { ram: partial.ram },
                    });
                } else {
                    onProgress({ phase: 'ram_read', message: '/dev/shm unavailable — RAM test skipped' });
                }

                // ── 5. Disk write (256 MB → /tmp with forced sync) ────────
                onProgress({ phase: 'disk_write', message: 'Benchmarking disk write speed (256 MB)…' });

                const diskWriteOut = await execSSH(
                    client,
                    'dd if=/dev/zero of=/tmp/.termi_bench bs=1M count=256 conv=fdatasync 2>&1',
                    180000
                );
                const diskWriteMBps = parseDdMBps(diskWriteOut);
                onProgress({
                    phase:   'disk_write',
                    message: diskWriteMBps
                        ? `Disk write: ${Math.round(diskWriteMBps)} MB/s`
                        : 'Disk write complete',
                });

                // ── 6. Disk read (256 MB from /tmp) ──────────────────────
                onProgress({ phase: 'disk_read', message: 'Benchmarking disk read speed (256 MB)…' });

                const diskReadOut = await execSSH(
                    client,
                    // Drop caches if root, then read; clean up either way
                    `(sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null; true); dd if=/tmp/.termi_bench of=/dev/null bs=1M 2>&1; rm -f /tmp/.termi_bench`,
                    180000
                );
                const diskReadMBps = parseDdMBps(diskReadOut);

                if (diskWriteMBps || diskReadMBps) {
                    partial.disk = {
                        writeMBps: Math.round(diskWriteMBps ?? 0),
                        readMBps:  Math.round(diskReadMBps ?? 0),
                    };
                    onProgress({
                        phase:   'disk_read',
                        message: diskReadMBps
                            ? `Disk read: ${Math.round(diskReadMBps)} MB/s`
                            : 'Disk read complete',
                        results: { disk: partial.disk },
                    });
                } else {
                    onProgress({ phase: 'disk_read', message: 'Disk test complete' });
                }

                // ── Done ─────────────────────────────────────────────────
                onProgress({
                    phase:   'done',
                    message: 'Benchmark complete',
                    results: partial,
                });
                finish();

            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // Best-effort cleanup
                try {
                    await execSSH(client, 'rm -f /dev/shm/.termi_bench /tmp/.termi_bench', 5000);
                } catch { /* ignore */ }
                onProgress({ phase: 'error', message: msg });
                finish({ error: msg });
            }
        });

        onProgress({ phase: 'connecting', message: 'Connecting via SSH…' });
        try {
            client.connect(buildConnectConfig(config));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            onProgress({ phase: 'error', message: msg });
            finish({ error: msg });
        }
    });
}
