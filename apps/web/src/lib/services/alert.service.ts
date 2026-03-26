/**
 * Alert Service
 *
 * Sends server-down / server-up alerts via push notification and/or email.
 */

import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';
import { sendPushToUser } from './push.service';

// ============================================================================
// MAILER (reuses SMTP config from email-otp)
// ============================================================================

function createTransporter() {
    if (!process.env.SMTP_HOST) {
        return nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
}

async function sendAlertEmail(to: string, subject: string, html: string): Promise<void> {
    const transporter = createTransporter();
    await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Termi Alerts" <alerts@termi.app>',
        to,
        subject,
        html,
    });
    if (!process.env.SMTP_HOST) {
        console.log('[Alert] No SMTP configured — would have sent alert to:', to, '|', subject);
    }
}

// ============================================================================
// ALERT LOGIC
// ============================================================================

export async function sendServerDownAlert(serverId: string): Promise<void> {
    const config = await prisma.serverMonitorConfig.findUnique({
        where: { serverId },
        include: {
            server: { select: { name: true, host: true, port: true } },
            user: { select: { email: true } },
        },
    });

    if (!config) return;

    const serverName = config.server.name;
    const serverAddr = `${config.server.host}:${config.server.port}`;

    if (config.alertPush) {
        await sendPushToUser(config.userId, {
            title: `Server Down: ${serverName}`,
            body: `${serverAddr} is unreachable. Check your server.`,
            tag: `server-down-${serverId}`,
            url: `/dashboard/servers/${serverId}`,
        });
    }

    if (config.alertEmail && config.user.email) {
        await sendAlertEmail(
            config.user.email,
            `[Termi Alert] Server Down: ${serverName}`,
            `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
              <h2 style="color:#ef4444;margin-bottom:8px">⚠ Server Unreachable</h2>
              <p style="color:#666;margin-bottom:20px">
                Your server <strong>${serverName}</strong> (<code>${serverAddr}</code>)
                has failed ${config.failureThreshold} consecutive health checks and appears to be down.
              </p>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px">
                <table style="width:100%;font-size:14px">
                  <tr><td style="color:#6b7280;padding:4px 0">Server</td><td><strong>${serverName}</strong></td></tr>
                  <tr><td style="color:#6b7280;padding:4px 0">Address</td><td><code>${serverAddr}</code></td></tr>
                  <tr><td style="color:#6b7280;padding:4px 0">Detected</td><td>${new Date().toUTCString()}</td></tr>
                </table>
              </div>
              <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/servers/${serverId}"
                 style="display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                View Server
              </a>
              <p style="color:#999;font-size:12px;margin-top:24px">
                You're receiving this because you enabled monitoring alerts for this server in Termi.
              </p>
            </div>
            `
        );
    }
}

export async function sendServerUpAlert(serverId: string): Promise<void> {
    const config = await prisma.serverMonitorConfig.findUnique({
        where: { serverId },
        include: {
            server: { select: { name: true, host: true, port: true } },
            user: { select: { email: true } },
        },
    });

    if (!config) return;

    const serverName = config.server.name;
    const serverAddr = `${config.server.host}:${config.server.port}`;

    if (config.alertPush) {
        await sendPushToUser(config.userId, {
            title: `Server Recovered: ${serverName}`,
            body: `${serverAddr} is back online.`,
            tag: `server-down-${serverId}`, // same tag replaces the "down" notification
            url: `/dashboard/servers/${serverId}`,
        });
    }

    if (config.alertEmail && config.user.email) {
        await sendAlertEmail(
            config.user.email,
            `[Termi Alert] Server Recovered: ${serverName}`,
            `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
              <h2 style="color:#22c55e;margin-bottom:8px">✓ Server Recovered</h2>
              <p style="color:#666;margin-bottom:20px">
                Your server <strong>${serverName}</strong> (<code>${serverAddr}</code>)
                is back online.
              </p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px">
                <table style="width:100%;font-size:14px">
                  <tr><td style="color:#6b7280;padding:4px 0">Server</td><td><strong>${serverName}</strong></td></tr>
                  <tr><td style="color:#6b7280;padding:4px 0">Address</td><td><code>${serverAddr}</code></td></tr>
                  <tr><td style="color:#6b7280;padding:4px 0">Recovered</td><td>${new Date().toUTCString()}</td></tr>
                </table>
              </div>
              <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/servers/${serverId}"
                 style="display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                View Server
              </a>
            </div>
            `
        );
    }
}
