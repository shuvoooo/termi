/**
 * Server Benchmark Service
 *
 * Agentless hardware benchmarking via SSH using only built-in Linux tools:
 *   - lscpu / /proc/meminfo / df       → hardware info (CPU MHz, cores, threads, etc.)
 *   - openssl speed sha256             → CPU single-core SHA-256 throughput
 *   - python3 threading + hashlib      → CPU multi-core SHA-256 throughput
 *   - dd to /dev/shm                   → RAM bandwidth (tmpfs = physical RAM)
 *   - dd to /tmp (conv=fdatasync)      → disk sequential read/write
 *   - ping 1.1.1.1                     → network latency
 *   - python3 loopback socket          → OS kernel socket bandwidth
 *
 * No software installation required on the target server.
 */

import { Client, ConnectConfig } from 'ssh2';

// ============================================================================
// TYPES
// ============================================================================

export interface BenchmarkHardwareInfo {
    cpuModel: string;
    cpuCores: number;
    cpuThreads: number;
    cpuFreqMhz: number | null;      // boost / max frequency
    cpuBaseFreqMhz: number | null;  // base / min frequency
    arch: string;
    ramTotalBytes: number;
    diskTotalBytes: number;
    diskUsedBytes: number;
    os: string;
}

export interface BenchmarkCpuResult {
    singleCoreMBps: number;  // SHA-256 throughput, one thread
    multiCoreMBps: number;   // SHA-256 throughput, all threads combined
    score: number;           // 0–1000
}

export interface BenchmarkRamResult {
    writeMBps: number;
    readMBps: number;
    score: number;
}

export interface BenchmarkDiskResult {
    writeMBps: number;
    readMBps: number;
    score: number;
}

export interface BenchmarkNetworkResult {
    pingMs: number | null;        // avg RTT to 1.1.1.1
    loopbackMBps: number | null;  // OS loopback socket throughput
    score: number;                // 0–1000
}

export interface BenchmarkScores {
    cpu: number;
    ram: number;
    disk: number;
    network: number;
    overall: number;
}

export interface BenchmarkResults {
    hardware: BenchmarkHardwareInfo;
    cpu: BenchmarkCpuResult | null;
    ram: BenchmarkRamResult | null;
    disk: BenchmarkDiskResult | null;
    network: BenchmarkNetworkResult | null;
    scores: BenchmarkScores | null;
    durationMs: number;
    error?: string;
}

export type BenchmarkPhase =
    | 'connecting'
    | 'hardware'
    | 'cpu_single'
    | 'cpu_multi'
    | 'ram_write'
    | 'ram_read'
    | 'disk_write'
    | 'disk_read'
    | 'network'
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
// PYTHON SCRIPTS (base64-encoded to avoid all shell quoting issues)
// ============================================================================

/**
 * Encodes a Python script as base64 and returns a shell command that
 * decodes and runs it. Works on any POSIX shell without quoting headaches.
 */
function pyCmd(code: string): string {
    const b64 = Buffer.from(code.trim()).toString('base64');
    return `echo '${b64}' | base64 -d | python3 2>/dev/null`;
}

const PY_CPU_SINGLE = `
import time, hashlib
d = b'A' * 65536
t = time.time()
c = 0
while time.time() - t < 3:
    hashlib.sha256(d).digest()
    c += 1
print(f'{c * 65536 / 1024 / 1024 / 3:.1f}')
`;

const PY_CPU_MULTI = `
import time, hashlib, os
from concurrent.futures import ThreadPoolExecutor

def bench(_):
    d = b'A' * 65536
    t = time.time()
    c = 0
    while time.time() - t < 3:
        hashlib.sha256(d).digest()
        c += 1
    return c * 65536

n = os.cpu_count() or 1
with ThreadPoolExecutor(max_workers=n) as ex:
    total = sum(ex.map(bench, range(n)))
print(f'{total / 1024 / 1024 / 3:.1f}')
`;

const PY_LOOPBACK = `
import socket, time, threading

def srv(sv):
    conn, _ = sv.accept()
    while conn.recv(65536):
        pass
    sv.close()

port = 49921
sv = socket.socket()
sv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sv.bind(('127.0.0.1', port))
sv.listen(1)
t = threading.Thread(target=srv, args=(sv,), daemon=True)
t.start()
time.sleep(0.05)
c = socket.socket()
c.connect(('127.0.0.1', port))
data = b'X' * 65536
t0 = time.time()
for _ in range(512):
    c.sendall(data)
c.close()
elapsed = time.time() - t0
t.join(2)
print(f'{65536 * 512 / 1024 / 1024 / elapsed:.0f}')
`;

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

/**
 * Parse openssl speed sha256 output — sums ALL sha256 lines so that
 * `openssl speed -multi N sha256` aggregate throughput is captured correctly.
 * Single-core output (1 line) returns the same as before.
 */
function parseOpensslSha256MBps(output: string): number | null {
    let total = 0;
    let count = 0;
    for (const line of output.split('\n')) {
        const t = line.trim();
        if (t.startsWith('sha256')) {
            const parts = t.split(/\s+/);
            const last = parts[parts.length - 1];
            const kb = parseFloat(last.replace(/k$/i, ''));
            if (!isNaN(kb) && kb > 0) {
                total += kb;
                count++;
            }
        }
    }
    return count > 0 ? total / 1024 : null; // kB/s → MB/s
}

/** Parse avg RTT from Linux/BSD ping output */
function parsePingMs(output: string): number | null {
    const m = output.match(/(?:rtt|round-trip)[^=]*=\s*[\d.]+\/([\d.]+)\//);
    return m ? parseFloat(m[1]) : null;
}

/** Parse the combined hardware info block (sections separated by "|||") */
function parseHardwareInfo(output: string): BenchmarkHardwareInfo {
    const [lscpuRaw = '', memRaw = '', diskRaw = '', osRaw = ''] = output.split('|||');

    const lscpu: Record<string, string> = {};
    for (const line of lscpuRaw.split('\n')) {
        const i = line.indexOf(':');
        if (i > 0) lscpu[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }

    const cpuModel       = lscpu['Model name'] || lscpu['CPU'] || 'Unknown';
    const sockets        = parseInt(lscpu['Socket(s)'] || '1') || 1;
    const coresPerSoc    = parseInt(lscpu['Core(s) per socket'] || '1') || 1;
    const threadsPerCore = parseInt(lscpu['Thread(s) per core'] || '1') || 1;
    const maxFreqStr     = lscpu['CPU max MHz'] || lscpu['CPU MHz'] || '';
    const baseFreqStr    = lscpu['CPU min MHz'] || '';
    const cpuFreqMhz     = maxFreqStr ? (Math.round(parseFloat(maxFreqStr)) || null) : null;
    const cpuBaseFreqMhz = baseFreqStr ? (Math.round(parseFloat(baseFreqStr)) || null) : null;
    const arch           = lscpu['Architecture'] || 'unknown';

    const memMatch       = memRaw.match(/MemTotal:\s*(\d+)\s*kB/i);
    const ramTotalBytes  = memMatch ? parseInt(memMatch[1]) * 1024 : 0;

    const diskParts      = diskRaw.trim().split(/\s+/);
    const diskTotalBytes = parseInt(diskParts[0]) || 0;
    const diskUsedBytes  = parseInt(diskParts[1]) || 0;

    const os = osRaw.trim().replace(/^"|"$/g, '') || 'Unknown';

    return {
        cpuModel,
        cpuCores:       sockets * coresPerSoc,
        cpuThreads:     sockets * coresPerSoc * threadsPerCore,
        cpuFreqMhz,
        cpuBaseFreqMhz,
        arch,
        ramTotalBytes,
        diskTotalBytes,
        diskUsedBytes,
        os,
    };
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Compute normalised 0–1000 scores for each subsystem and an overall score.
 *
 * Reference values (= 1000 pts) are calibrated to high-end server hardware:
 *   CPU single:   800 MB/s SHA-256  (fast Xeon without hardware SHA, or mid-range with)
 *   CPU multi:    800 MB/s per thread (same efficiency reference as single)
 *   RAM:         30 000 MB/s avg    (quad-channel DDR4-3200)
 *   Disk:         1 500 MB/s avg    (mid-range NVMe SSD)
 *   Network ping:   0 ms            (decreasing linearly; 200 ms = 0 pts)
 *   Loopback:    10 000 MB/s        (high-bandwidth kernel socket path)
 */
function computeScores(
    cpu: BenchmarkCpuResult | null,
    ram: BenchmarkRamResult | null,
    disk: BenchmarkDiskResult | null,
    network: BenchmarkNetworkResult | null,
    threads: number,
): BenchmarkScores {
    // CPU: 60% single-core, 40% multi-core per-thread efficiency
    const singlePts = cpu
        ? Math.min(1000, Math.round(cpu.singleCoreMBps * 1000 / 800))
        : 0;
    const multiPerThread = cpu && threads > 0 ? cpu.multiCoreMBps / threads : 0;
    const multiPts = cpu
        ? Math.min(1000, Math.round(multiPerThread * 1000 / 800))
        : 0;
    const cpuScore = cpu ? Math.round(singlePts * 0.6 + multiPts * 0.4) : 0;

    // RAM
    const ramAvg   = ram ? (ram.writeMBps + ram.readMBps) / 2 : 0;
    const ramScore = Math.min(1000, Math.round(ramAvg * 1000 / 30000));

    // Disk
    const diskAvg   = disk ? (disk.writeMBps + disk.readMBps) / 2 : 0;
    const diskScore = Math.min(1000, Math.round(diskAvg * 1000 / 1500));

    // Network: average ping score and loopback score (use 500 if component unavailable)
    const pingScore = network?.pingMs != null
        ? Math.max(0, Math.min(1000, Math.round(1000 * (1 - network.pingMs / 200))))
        : 500;
    const loopScore = network?.loopbackMBps != null
        ? Math.min(1000, Math.round(network.loopbackMBps * 1000 / 10000))
        : 500;
    const netScore  = network ? Math.round(pingScore * 0.5 + loopScore * 0.5) : 0;

    const overall = Math.round((cpuScore + ramScore + diskScore + netScore) / 4);
    return { cpu: cpuScore, ram: ramScore, disk: diskScore, network: netScore, overall };
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
    cpuFreqMhz: null, cpuBaseFreqMhz: null, arch: 'unknown',
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
                hardware:   partial.hardware  ?? EMPTY_HARDWARE,
                cpu:        partial.cpu       ?? null,
                ram:        partial.ram       ?? null,
                disk:       partial.disk      ?? null,
                network:    partial.network   ?? null,
                scores:     partial.scores    ?? null,
                durationMs: Date.now() - startMs,
                ...extra,
            });
        };

        client.on('error', (err) => {
            onProgress({ phase: 'error', message: `SSH error: ${err.message}` });
            finish({ error: err.message });
        });

        client.on('ready', async () => {
            try {
                // ── 1. Hardware info ──────────────────────────────────────
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
                    message: `${partial.hardware.cpuModel} · ${partial.hardware.cpuCores}C/${partial.hardware.cpuThreads}T${partial.hardware.cpuFreqMhz ? ` · ${(partial.hardware.cpuFreqMhz / 1000).toFixed(2)} GHz` : ''}`,
                    results: { hardware: partial.hardware },
                });

                const threads = Math.max(1, partial.hardware.cpuThreads);

                // ── 2. CPU single-core (~3 s) ─────────────────────────────
                onProgress({ phase: 'cpu_single', message: 'Measuring single-core CPU speed (3 s)…' });

                let singleCoreMBps: number | null = null;

                const singleOut = await execSSH(
                    client,
                    'openssl speed -seconds 3 sha256 2>&1',
                    20000
                );
                singleCoreMBps = parseOpensslSha256MBps(singleOut);

                // Fallback: python3 single-thread SHA-256 loop
                if (!singleCoreMBps) {
                    const pyOut = await execSSH(client, pyCmd(PY_CPU_SINGLE), 15000);
                    const v = parseFloat(pyOut.trim());
                    if (!isNaN(v) && v > 0) singleCoreMBps = v;
                }

                onProgress({
                    phase:   'cpu_single',
                    message: singleCoreMBps
                        ? `Single-core SHA-256: ${Math.round(singleCoreMBps)} MB/s`
                        : 'Single-core test unavailable',
                });

                // ── 3. CPU multi-core (~3 s) ──────────────────────────────
                onProgress({ phase: 'cpu_multi', message: `Measuring multi-core CPU speed (${threads} threads, 3 s)…` });

                let multiCoreMBps: number | null = null;

                // Primary: python3 threading (hashlib releases GIL → true parallelism)
                const pyMultiOut = await execSSH(client, pyCmd(PY_CPU_MULTI), 25000);
                const pyMultiVal = parseFloat(pyMultiOut.trim());
                if (!isNaN(pyMultiVal) && pyMultiVal > 0) multiCoreMBps = pyMultiVal;

                // Fallback: openssl speed -multi N (OpenSSL 1.1+ only)
                if (!multiCoreMBps) {
                    const multiOut = await execSSH(
                        client,
                        `N=$(nproc 2>/dev/null || echo 1); openssl speed -seconds 3 -multi $N sha256 2>&1`,
                        30000
                    );
                    const v = parseOpensslSha256MBps(multiOut);
                    // Only accept if it looks like a real multi-core result (meaningfully > single)
                    if (v && v > (singleCoreMBps ?? 0) * 0.8) multiCoreMBps = v;
                }

                // Last resort: extrapolate from single-core (labelled as estimate)
                if (!multiCoreMBps && singleCoreMBps) {
                    multiCoreMBps = singleCoreMBps * threads;
                }

                if (singleCoreMBps || multiCoreMBps) {
                    const tempCpu: BenchmarkCpuResult = {
                        singleCoreMBps: Math.round(singleCoreMBps ?? 0),
                        multiCoreMBps:  Math.round(multiCoreMBps  ?? 0),
                        score: 0,
                    };
                    tempCpu.score = computeScores(tempCpu, null, null, null, threads).cpu;
                    partial.cpu = tempCpu;
                    onProgress({
                        phase:   'cpu_multi',
                        message: multiCoreMBps
                            ? `Multi-core SHA-256: ${Math.round(multiCoreMBps)} MB/s (${threads} threads)`
                            : 'Multi-core test unavailable',
                        results: { cpu: partial.cpu },
                    });
                } else {
                    onProgress({ phase: 'cpu_multi', message: 'CPU benchmark unavailable' });
                }

                // ── 4. RAM write (256 MB → /dev/shm, tmpfs = physical RAM) ──
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

                // ── 5. RAM read (256 MB from /dev/shm) ───────────────────
                onProgress({ phase: 'ram_read', message: 'Benchmarking RAM read speed (256 MB)…' });

                const ramReadOut = await execSSH(
                    client,
                    'dd if=/dev/shm/.termi_bench of=/dev/null bs=1M 2>&1; rm -f /dev/shm/.termi_bench',
                    90000
                );
                const ramReadMBps = parseDdMBps(ramReadOut);

                if (ramWriteMBps || ramReadMBps) {
                    const tempRam: BenchmarkRamResult = {
                        writeMBps: Math.round(ramWriteMBps ?? 0),
                        readMBps:  Math.round(ramReadMBps  ?? 0),
                        score: 0,
                    };
                    tempRam.score = computeScores(partial.cpu ?? null, tempRam, null, null, threads).ram;
                    partial.ram = tempRam;
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

                // ── 6. Disk write (256 MB → /tmp with forced sync) ────────
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

                // ── 7. Disk read (256 MB from /tmp) ──────────────────────
                onProgress({ phase: 'disk_read', message: 'Benchmarking disk read speed (256 MB)…' });

                const diskReadOut = await execSSH(
                    client,
                    `(sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null; true); dd if=/tmp/.termi_bench of=/dev/null bs=1M 2>&1; rm -f /tmp/.termi_bench`,
                    180000
                );
                const diskReadMBps = parseDdMBps(diskReadOut);

                if (diskWriteMBps || diskReadMBps) {
                    const tempDisk: BenchmarkDiskResult = {
                        writeMBps: Math.round(diskWriteMBps ?? 0),
                        readMBps:  Math.round(diskReadMBps  ?? 0),
                        score: 0,
                    };
                    tempDisk.score = computeScores(partial.cpu ?? null, partial.ram ?? null, tempDisk, null, threads).disk;
                    partial.disk = tempDisk;
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

                // ── 8. Network (ping latency + loopback bandwidth) ────────
                onProgress({ phase: 'network', message: 'Running network tests (ping + loopback)…' });

                let pingMs: number | null = null;
                let loopbackMBps: number | null = null;

                // Ping latency
                const pingOut = await execSSH(
                    client,
                    'ping -c 4 -W 2 1.1.1.1 2>&1 || ping -c 4 -W 2 8.8.8.8 2>&1',
                    20000
                ).catch(() => '');
                pingMs = parsePingMs(pingOut);

                // OS loopback socket bandwidth
                const loopOut = await execSSH(client, pyCmd(PY_LOOPBACK), 15000).catch(() => '');
                const loopVal = parseFloat(loopOut.trim());
                if (!isNaN(loopVal) && loopVal > 0) loopbackMBps = Math.round(loopVal);

                const tempNet: BenchmarkNetworkResult = {
                    pingMs,
                    loopbackMBps,
                    score: 0,
                };
                tempNet.score = computeScores(
                    partial.cpu ?? null, partial.ram ?? null, partial.disk ?? null, tempNet, threads
                ).network;
                partial.network = tempNet;

                // Final composite scores
                partial.scores = computeScores(
                    partial.cpu     ?? null,
                    partial.ram     ?? null,
                    partial.disk    ?? null,
                    partial.network ?? null,
                    threads
                );

                const netMsg = [
                    pingMs        != null ? `${pingMs.toFixed(1)} ms ping` : null,
                    loopbackMBps  != null ? `${loopbackMBps.toLocaleString()} MB/s loopback` : null,
                ].filter(Boolean).join(', ') || 'Network test complete';

                onProgress({
                    phase:   'network',
                    message: netMsg,
                    results: { network: partial.network, scores: partial.scores },
                });

                // ── Done ──────────────────────────────────────────────────
                onProgress({
                    phase:   'done',
                    message: `Benchmark complete — Overall Score: ${partial.scores?.overall ?? '—'}`,
                    results: partial,
                });
                finish();

            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
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
