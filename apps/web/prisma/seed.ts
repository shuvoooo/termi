/**
 * Database Seed Script
 *
 * Creates initial data for development and testing.
 * Run with: npx tsx prisma/seed.ts
 */

import { PrismaLibSql } from '@prisma/adapter-libsql'
import 'dotenv/config'
import {PrismaClient, Protocol} from "@/app/generated/prisma/client";
import {encrypt, hashPassword, serializeEncrypted} from "@/lib/crypto";

const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
})

const prisma = new PrismaClient({
    adapter,
});


async function main() {
    console.log('🌱 Seeding database...');

    // Create demo user
    const passwordHash = await hashPassword('Demo@123');

    const user = await prisma.user.upsert({
        where: {email: 'demo@termi.local'},
        update: {},
        create: {
            email: 'demo@termi.local',
            passwordHash,
            isActive: true,
            isVerified: true,
        },
    });

    console.log(`✓ Created user: ${user.email}`);

    // Create server groups
    const groups = await Promise.all([
        prisma.serverGroup.upsert({
            where: {userId_name: {userId: user.id, name: 'Production'}},
            update: {},
            create: {
                userId: user.id,
                name: 'Production',
                color: '#ef4444',
                icon: 'server',
                sortOrder: 0,
            },
        }),
        prisma.serverGroup.upsert({
            where: {userId_name: {userId: user.id, name: 'Development'}},
            update: {},
            create: {
                userId: user.id,
                name: 'Development',
                color: '#22c55e',
                icon: 'code',
                sortOrder: 1,
            },
        }),
        prisma.serverGroup.upsert({
            where: {userId_name: {userId: user.id, name: 'Testing'}},
            update: {},
            create: {
                userId: user.id,
                name: 'Testing',
                color: '#f59e0b',
                icon: 'flask',
                sortOrder: 2,
            },
        }),
    ]);

    console.log(`✓ Created ${groups.length} server groups`);

    // Helper to encrypt credentials
    const encryptField = (value: string) => serializeEncrypted(encrypt(value));

    // Create demo servers
    const servers = [
        {
            name: 'Web Server 1',
            description: 'Production web server',
            host: '192.168.1.10',
            port: 22,
            protocol: Protocol.SSH,
            username: 'admin',
            password: 'demo123',
            groupId: groups[0].id,
            tags: ['web', 'nginx', 'ubuntu'],
            isFavorite: true,
        },
        {
            name: 'Database Server',
            description: 'PostgreSQL database',
            host: '192.168.1.11',
            port: 22,
            protocol: Protocol.SSH,
            username: 'postgres',
            password: 'demo123',
            groupId: groups[0].id,
            tags: ['database', 'postgresql'],
        },
        {
            name: 'Dev Box',
            description: 'Development workstation',
            host: '192.168.1.50',
            port: 22,
            protocol: Protocol.SSH,
            username: 'developer',
            password: 'demo123',
            groupId: groups[1].id,
            tags: ['dev', 'workstation'],
        },
        {
            name: 'Windows Server',
            description: 'Windows Server 2022',
            host: '192.168.1.100',
            port: 3389,
            protocol: Protocol.RDP,
            username: 'Administrator',
            password: 'demo123',
            groupId: groups[0].id,
            tags: ['windows', 'rdp'],
        },
        {
            name: 'Linux Desktop',
            description: 'Ubuntu desktop with VNC',
            host: '192.168.1.51',
            port: 5900,
            protocol: Protocol.VNC,
            username: 'user',
            password: 'demo123',
            groupId: groups[1].id,
            tags: ['linux', 'vnc', 'desktop'],
        },
    ];

    for (const server of servers) {
        await prisma.server.create({
            data: {
                userId: user.id,
                name: server.name,
                description: server.description,
                host: encryptField(server.host),
                port: server.port,
                protocol: server.protocol,
                username: encryptField(server.username),
                password: encryptField(server.password),
                groupId: server.groupId,
                tags: server.tags,
                isFavorite: server.isFavorite || false,
            },
        });
    }

    console.log(`✓ Created ${servers.length} demo servers`);

    console.log('');
    console.log('🎉 Seed completed!');
    console.log('');
    console.log('Demo credentials:');
    console.log('  Email: demo@termi.local');
    console.log('  Password: Demo@123');
    console.log('');
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(() => {
        prisma.$disconnect();
    });
