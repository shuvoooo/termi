/**
 * GatewayTunnel
 *
 * A custom Guacamole.Tunnel implementation that bridges guacamole-common-js
 * to our custom gateway WebSocket protocol.
 *
 * The gateway:
 *  - Sends JSON control frames first  {"type":"connected"}, {"type":"error",...}, {"type":"closed"}
 *  - Then forwards raw Guacamole instructions (e.g. "4.size,1.0,4.1024,3.768;")
 *
 * Guacamole.WebSocketTunnel cannot connect to this directly because it
 * expects pure Guacamole framing. This class bridges the two worlds.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGatewayTunnel(Guacamole: any, wsUrl: string): any {
    const tunnel = new Guacamole.Tunnel();

    let socket: WebSocket | null = null;
    let connectTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * Parse all complete Guacamole instructions contained in `data` and
     * dispatch each one via tunnel.oninstruction.
     * Returns any trailing incomplete fragment.
     */
    function dispatchInstructions(data: string): string {
        let startIndex = 0;

        while (startIndex < data.length) {
            const elements: string[] = [];
            let pos = startIndex;

            // Parse one instruction starting at `pos`
            while (true) {
                // Find the '.' that terminates the length
                const dotIndex = data.indexOf('.', pos);
                if (dotIndex === -1) {
                    // Incomplete — need more data
                    return data.substring(startIndex);
                }

                const length = parseInt(data.substring(pos, dotIndex), 10);
                if (isNaN(length)) {
                    // Malformed — skip to next ';'
                    const skip = data.indexOf(';', pos);
                    if (skip === -1) return data.substring(startIndex);
                    startIndex = skip + 1;
                    break;
                }

                const elementStart = dotIndex + 1;
                const elementEnd = elementStart + length;

                if (elementEnd > data.length) {
                    // Incomplete element — need more data
                    return data.substring(startIndex);
                }

                elements.push(data.substring(elementStart, elementEnd));

                const terminator = data.charAt(elementEnd);

                if (terminator === ';') {
                    // Complete instruction
                    pos = elementEnd + 1;

                    if (elements.length > 0 && tunnel.oninstruction) {
                        const opcode = elements[0];
                        const params = elements.slice(1);

                        // Transition tunnel to OPEN on the first instruction received
                        if (tunnel.state === Guacamole.Tunnel.State.CONNECTING) {
                            if (connectTimeoutId !== null) {
                                clearTimeout(connectTimeoutId);
                                connectTimeoutId = null;
                            }
                            tunnel.setState(Guacamole.Tunnel.State.OPEN);
                        }

                        tunnel.oninstruction(opcode, params);
                    }

                    startIndex = pos;
                    break;
                } else if (terminator === ',') {
                    // More elements follow
                    pos = elementEnd + 1;
                } else {
                    // Malformed — skip to next ';'
                    const skip = data.indexOf(';', pos);
                    if (skip === -1) return data.substring(startIndex);
                    startIndex = skip + 1;
                    break;
                }
            }
        }

        return ''; // All data consumed
    }

    /**
     * Inject a synthetic Guacamole "error" instruction directly into the
     * client via tunnel.oninstruction.
     *
     * WHY: Guacamole.Client (v1.5+) does NOT react to tunnel.onerror or
     * tunnel.setState(CLOSED). The ONLY mechanism it uses to handle errors
     * is the "error" instruction received through tunnel.oninstruction.
     * Without this, the client stays stuck at WAITING ("Connecting...") when
     * the server closes the connection without sending a Guacamole error.
     *
     * This transitions the client:  WAITING → DISCONNECTING → DISCONNECTED.
     */
    function injectError(message: string, code: number) {
        if (tunnel.oninstruction) {
            tunnel.oninstruction('error', [message, String(code)]);
        } else {
            // Fallback if the client hasn't set up oninstruction yet
            tunnel.setState(Guacamole.Tunnel.State.CLOSED);
        }
    }

    tunnel.connect = function connect(data: string) {
        tunnel.setState(Guacamole.Tunnel.State.CONNECTING);

        const url = data ? `${wsUrl}?${data}` : wsUrl;
        socket = new WebSocket(url);

        let fragment = '';

        // If the guacd handshake + target-server connection takes too long,
        // inject a synthetic error instruction so Guacamole.Client transitions
        // to DISCONNECTED (it does NOT respond to tunnel.onerror/setState).
        connectTimeoutId = setTimeout(() => {
            connectTimeoutId = null;
            if (tunnel.state !== Guacamole.Tunnel.State.CLOSED) {
                injectError('Connection timed out — remote desktop server did not respond', 514);
                socket?.close();
            }
        }, 30000); // 30 s — enough for NLA auth on slow servers

        socket.onopen = () => {
            // State stays CONNECTING until the first Guacamole instruction arrives
        };

        socket.onmessage = (event: MessageEvent) => {
            const raw: string = event.data;

            // JSON control messages from the gateway (not Guacamole instructions)
            if (raw.charAt(0) === '{') {
                try {
                    const msg = JSON.parse(raw) as { type: string; message?: string };
                    if (msg.type === 'error') {
                        if (connectTimeoutId !== null) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
                        // Inject as a synthetic Guacamole error instruction — Guacamole.Client
                        // does NOT respond to tunnel.onerror; only oninstruction('error') works.
                        injectError(msg.message || 'Gateway error', 514);
                        socket?.close();
                    } else if (msg.type === 'closed') {
                        if (connectTimeoutId !== null) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
                        // guacd closed the connection (e.g. RDP server unreachable/rejected).
                        // Inject synthetic error so Guacamole.Client leaves WAITING state.
                        injectError('Remote desktop connection was closed', 516);
                    }
                    // "connected" msg: gateway finished guacd handshake — keep waiting
                    return;
                } catch {
                    /* not valid JSON, fall through to instruction parser */
                }
            }

            // Accumulate and parse Guacamole instructions
            fragment = dispatchInstructions(fragment + raw);
        };

        socket.onclose = (event: CloseEvent) => {
            if (connectTimeoutId !== null) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
            if (tunnel.state !== Guacamole.Tunnel.State.CLOSED) {
                if (event.code !== 1000) {
                    // Unexpected close — inject error so Guacamole.Client leaves WAITING.
                    injectError(`Connection lost (${event.reason || event.code})`, 516);
                } else {
                    // Clean close (code 1000): client initiated disconnect, already DISCONNECTED.
                    tunnel.setState(Guacamole.Tunnel.State.CLOSED);
                }
            }
        };

        socket.onerror = () => {
            if (connectTimeoutId !== null) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
            if (tunnel.state !== Guacamole.Tunnel.State.CLOSED) {
                injectError('WebSocket connection failed', 515);
            }
        };
    };

    tunnel.disconnect = function disconnect() {
        if (connectTimeoutId !== null) { clearTimeout(connectTimeoutId); connectTimeoutId = null; }
        if (socket) {
            socket.close(1000, 'Client disconnect');
            socket = null;
        }
        tunnel.setState(Guacamole.Tunnel.State.CLOSED);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tunnel.sendMessage = function sendMessage(...elements: any[]) {
        if (!tunnel.isConnected() || !socket) return;
        if (elements.length === 0) return;

        const message =
            elements
                .map((e: unknown) => {
                    const s = String(e);
                    return `${s.length}.${s}`;
                })
                .join(',') + ';';

        socket.send(message);
    };

    return tunnel;
}

