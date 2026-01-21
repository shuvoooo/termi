#!/usr/bin/env node
/**
 * Termo RDP Diagnostic Tool
 *
 * This script checks all components needed for RDP to work
 */

const net = require('net');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('  TERMO RDP DIAGNOSTIC TOOL');
console.log('═══════════════════════════════════════════════════════════\n');

let issuesFound = 0;
let checks = 0;

function pass(message) {
    console.log(`✓ ${message}`);
}

function fail(message, solution) {
    issuesFound++;
    console.log(`✗ ${message}`);
    if (solution) {
        console.log(`  → Solution: ${solution}`);
    }
}

function info(message) {
    console.log(`ℹ ${message}`);
}

function section(title) {
    console.log(`\n─── ${title} ───`);
}

// Check 1: Docker
section('Docker');
checks++;
try {
    const dockerVersion = execSync('docker --version', { encoding: 'utf8' });
    pass(`Docker installed: ${dockerVersion.trim()}`);
} catch (err) {
    fail('Docker not installed or not in PATH', 'Install Docker Desktop from https://www.docker.com/products/docker-desktop');
}

// Check 2: guacd container
section('guacd Container');
checks++;
try {
    const containers = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
    if (containers.includes('termo-guacd')) {
        pass('guacd container is running');

        // Check container status
        const inspect = execSync('docker inspect termo-guacd --format "{{.State.Status}}"', { encoding: 'utf8' }).trim();
        if (inspect === 'running') {
            pass('guacd container status: running');
        } else {
            fail(`guacd container status: ${inspect}`, 'Run: docker start termo-guacd');
        }
    } else {
        fail('guacd container not found', 'Run: docker run -d -p 4822:4822 --name termo-guacd guacamole/guacd:1.5.4');
    }
} catch (err) {
    fail('Failed to check Docker containers', 'Ensure Docker is running');
}

// Check 3: Port 4822
section('guacd Port (4822)');
checks++;
new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
        pass('Port 4822 is listening');
        socket.destroy();
        resolve(true);
    });

    socket.on('timeout', () => {
        fail('Port 4822 connection timeout', 'Ensure guacd container is running');
        socket.destroy();
        resolve(false);
    });

    socket.on('error', (err) => {
        fail(`Port 4822 not accessible: ${err.message}`, 'Start guacd: docker run -d -p 4822:4822 --name termo-guacd guacamole/guacd:1.5.4');
        resolve(false);
    });

    socket.connect(4822, 'localhost');
}).then((connected) => {
    // Check 4: guacd protocol
    if (connected) {
        section('guacd Protocol');
        checks++;
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(3000);

            let buffer = '';

            socket.on('connect', () => {
                // Send select instruction
                const instruction = '6.select,3.rdp;';
                socket.write(instruction);
            });

            socket.on('data', (data) => {
                buffer += data.toString();
                if (buffer.includes('4.args,')) {
                    pass('guacd responding correctly to protocol');
                    socket.destroy();
                    resolve(true);
                }
            });

            socket.on('timeout', () => {
                fail('guacd not responding to protocol commands', 'Restart guacd container');
                socket.destroy();
                resolve(false);
            });

            socket.on('error', (err) => {
                fail(`guacd protocol error: ${err.message}`, 'Check guacd logs: docker logs termo-guacd');
                resolve(false);
            });

            socket.connect(4822, 'localhost');
        });
    }
    return Promise.resolve(false);
}).then(() => {
    // Check 5: .env file
    section('Environment Configuration');
    checks++;
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        pass('.env file exists');

        const envContent = fs.readFileSync(envPath, 'utf8');

        // Check required variables
        const required = [
            'DATABASE_URL',
            'SESSION_SECRET',
            'ENCRYPTION_KEY',
            'GATEWAY_JWT_SECRET',
            'GATEWAY_URL',
            'NEXT_PUBLIC_GATEWAY_URL',
            'GUACD_HOST',
            'GUACD_PORT'
        ];

        const missing = [];
        required.forEach(key => {
            if (!envContent.includes(key + '=')) {
                missing.push(key);
            }
        });

        if (missing.length === 0) {
            pass('All required environment variables present');
        } else {
            fail(`Missing environment variables: ${missing.join(', ')}`, 'Check .env.example and add missing variables');
        }

        // Check GUACD settings
        if (envContent.includes('GUACD_HOST=localhost') || envContent.includes('GUACD_HOST=127.0.0.1')) {
            pass('GUACD_HOST is set to localhost');
        } else {
            fail('GUACD_HOST should be "localhost" for development', 'Update .env: GUACD_HOST=localhost');
        }

        if (envContent.includes('GUACD_PORT=4822')) {
            pass('GUACD_PORT is set to 4822');
        } else {
            fail('GUACD_PORT should be 4822', 'Update .env: GUACD_PORT=4822');
        }

    } else {
        fail('.env file not found', 'Copy .env.example to .env and configure it');
    }

    // Check 6: Gateway port
    section('Gateway Service (8080)');
    checks++;
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);

        socket.on('connect', () => {
            pass('Gateway is running on port 8080');
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            fail('Gateway not running on port 8080', 'Start gateway: cd apps/gateway && npm run dev');
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            fail('Gateway not running on port 8080', 'Start gateway: cd apps/gateway && npm run dev');
            resolve(false);
        });

        socket.connect(8080, 'localhost');
    });
}).then(() => {
    // Check 7: Web service port
    section('Web Application (3000)');
    checks++;
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);

        socket.on('connect', () => {
            pass('Web application is running on port 3000');
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            fail('Web application not running on port 3000', 'Start web: cd apps/web && npm run dev');
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            fail('Web application not running on port 3000', 'Start web: cd apps/web && npm run dev');
            resolve(false);
        });

        socket.connect(3000, 'localhost');
    });
}).then(() => {
    // Check 8: Database
    section('Database');
    checks++;
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);

        socket.on('connect', () => {
            pass('PostgreSQL is running on port 5432');
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            fail('PostgreSQL not running on port 5432', 'Start PostgreSQL service');
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            fail('PostgreSQL not running on port 5432', 'Start PostgreSQL service');
            resolve(false);
        });

        socket.connect(5432, 'localhost');
    });
}).then(() => {
    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');

    if (issuesFound === 0) {
        console.log('\n✓ All checks passed! Your system is ready for RDP connections.\n');
        console.log('To connect:');
        console.log('1. Go to http://localhost:3000');
        console.log('2. Add an RDP server');
        console.log('3. Click Connect → RDP\n');
    } else {
        console.log(`\n✗ Found ${issuesFound} issue(s). Please fix them and run this diagnostic again.\n`);
        console.log('Quick start guide:');
        console.log('1. Start guacd: docker run -d -p 4822:4822 --name termo-guacd guacamole/guacd:1.5.4');
        console.log('2. Start gateway: cd apps/gateway && npm run dev');
        console.log('3. Start web: cd apps/web && npm run dev\n');
        console.log('For detailed help, see RDP_SETUP_GUIDE.md\n');
    }

    process.exit(issuesFound > 0 ? 1 : 0);
});
