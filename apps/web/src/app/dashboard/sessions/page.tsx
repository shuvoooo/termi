'use client';

/**
 * The sessions UI (terminals, tab bar, file manager) lives in SessionsWorkspace,
 * which is rendered persistently in the dashboard layout so that WebSocket
 * connections survive navigation between pages.
 *
 * This page component only handles the ?add=serverId URL param so that other
 * pages can deep-link into sessions (e.g. "Open in Sessions" on the dashboard).
 */

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSessionsContext } from '../sessions-context';

function AutoConnect() {
    const searchParams = useSearchParams();
    const { addSession, sessions } = useSessionsContext();

    useEffect(() => {
        const addId = searchParams.get('add');
        if (addId && !sessions.some(s => s.serverId === addId)) {
            addSession(addId);
        }
        // Run only on mount — intentional
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}

export default function SessionsPage() {
    return (
        <Suspense fallback={null}>
            <AutoConnect />
        </Suspense>
    );
}
