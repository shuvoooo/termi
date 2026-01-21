/**
 * Termo WebSocket Gateway
 * 
 * This service handles WebSocket connections from the browser and proxies them
 * to the appropriate protocol handler (SSH, SCP, RDP, VNC).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

import { SSHHandler } from './handlers/ssh.js';
import { SCPHandler } from './handlers/scp.js';
import { GuacamoleHandler } from './handlers/guacamole.js';
import { validateToken, TokenPayload } from './auth/token.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env.GATEWAY_PORT || '8080', 10);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';

// Connection limits
const MAX_CONNECTIONS_PER_USER = 10;
const CONNECTION_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// TYPES
// ============================================================================

interface ConnectionMeta {
    userId: string;
    protocol: 'ssh' | 'scp' | 'rdp' | 'vnc';
    serverId: string;
    connectedAt: Date;
    handler?: SSHHandler | SCPHandler | GuacamoleHandler;
}

// ============================================================================
// CONNECTION TRACKING
// ============================================================================

const connections = new Map<WebSocket, ConnectionMeta>();
const userConnectionCount = new Map<string, number>();

function addConnection(ws: WebSocket, meta: ConnectionMeta): boolean {
    const count = userConnectionCount.get(meta.userId) || 0;

    if (count >= MAX_CONNECTIONS_PER_USER) {
        return false;
    }

    connections.set(ws, meta);
    userConnectionCount.set(meta.userId, count + 1);
    return true;
}

function removeConnection(ws: WebSocket): void {
    const meta = connections.get(ws);
    if (meta) {
        const count = userConnectionCount.get(meta.userId) || 1;
        userConnectionCount.set(meta.userId, count - 1);

        // Cleanup handler
        if (meta.handler) {
            meta.handler.close();
        }

        connections.delete(ws);
    }
}

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = createServer((req, res) => {
    // Health check endpoint
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            connections: connections.size,
            uptime: process.uptime(),
        }));
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const wss = new WebSocketServer({
    server,
    path: '/connect',
    maxPayload: 1024 * 1024, // 1MB max payload
});

wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Extract connection parameters from query string
    const token = url.searchParams.get('token');
    const protocol = url.searchParams.get('protocol') as 'ssh' | 'scp' | 'rdp' | 'vnc';
    const serverId = url.searchParams.get('serverId');

    // Validate required parameters
    if (!token || !protocol || !serverId) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Missing required parameters'
        }));
        ws.close(4000, 'Bad Request');
        return;
    }

    // Validate protocol
    if (!['ssh', 'scp', 'rdp', 'vnc'].includes(protocol)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid protocol'
        }));
        ws.close(4000, 'Bad Request');
        return;
    }

    // Validate token
    let tokenPayload: TokenPayload;
    try {
        tokenPayload = await validateToken(token);
    } catch (error) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid or expired token'
        }));
        ws.close(4001, 'Unauthorized');
        return;
    }

    // Check server access
    if (tokenPayload.serverId !== serverId) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Server access denied'
        }));
        ws.close(4003, 'Forbidden');
        return;
    }

    // Create connection metadata
    const meta: ConnectionMeta = {
        userId: tokenPayload.userId,
        protocol,
        serverId,
        connectedAt: new Date(),
    };

    // Check connection limit
    if (!addConnection(ws, meta)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Too many connections'
        }));
        ws.close(4029, 'Too Many Requests');
        return;
    }

    // Set connection timeout
    const timeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Connection timeout - no activity',
            }));
            ws.close(4408, 'Connection Timeout');
        }
    }, CONNECTION_TIMEOUT);

    // Clear timeout on first message
    ws.once('message', () => {
        clearTimeout(timeoutId);
    });

    // Create appropriate handler
    try {
        switch (protocol) {
            case 'ssh':
                meta.handler = new SSHHandler(ws, tokenPayload);
                break;
            case 'scp':
                meta.handler = new SCPHandler(ws, tokenPayload);
                break;
            case 'rdp':
            case 'vnc':
                meta.handler = new GuacamoleHandler(ws, tokenPayload, protocol);
                break;
        }

        ws.send(JSON.stringify({ type: 'connected', protocol }));

    } catch (error) {
        console.error('Handler creation error:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to initialize connection'
        }));
        ws.close(5000, 'Internal Error');
        return;
    }

    // Handle disconnection
    ws.on('close', () => {
        removeConnection(ws);
        console.log(`Connection closed: ${protocol}://${serverId}`);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        removeConnection(ws);
    });

    console.log(`New ${protocol} connection from user ${tokenPayload.userId} to server ${serverId}`);
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function shutdown() {
    console.log('Shutting down gateway...');

    // Close all connections
    for (const [ws, meta] of connections) {
        if (meta.handler) {
            meta.handler.close();
        }
        ws.close(1001, 'Server shutting down');
    }

    wss.close();
    server.close(() => {
        console.log('Gateway shut down');
        process.exit(0);
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, HOST, () => {
    console.log(`🚀 Termo Gateway running at ws://${HOST}:${PORT}/connect`);
    console.log(`   Health check: http://${HOST}:${PORT}/health`);
});
