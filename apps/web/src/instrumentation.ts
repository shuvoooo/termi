/**
 * Next.js Instrumentation
 *
 * Runs once on server startup (not in Edge runtime).
 * Used to initialize the background monitoring cron job.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    // Only run in the Node.js runtime, not the Edge runtime
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    // Dynamically import to avoid bundling issues
    const { default: cron } = await import('node-cron');
    const { runMonitoringPass } = await import('./lib/services/monitor.service');

    // Run monitoring every minute; the service itself respects each server's
    // configured interval (1, 5, 10, 15, 30, or 60 minutes).
    cron.schedule('* * * * *', async () => {
        try {
            await runMonitoringPass();
        } catch (err) {
            console.error('[Monitoring Cron] Unhandled error:', err);
        }
    });

    console.log('[Monitoring] Background cron started — checking every minute');
}
