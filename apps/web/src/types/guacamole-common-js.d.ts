/**
 * Minimal ambient type declaration for guacamole-common-js.
 * The library ships no TypeScript types so we silence the TS7016 error here.
 * All usage is typed via `any` inside GuacamoleDisplay.tsx and GatewayTunnel.ts.
 */
declare module 'guacamole-common-js' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Guacamole: any;
    export default Guacamole;
}

