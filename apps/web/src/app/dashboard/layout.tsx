'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    Terminal,
    Server,
    FolderOpen,
    Settings,
    LogOut,
    Menu,
    X,
    Plus,
    Search,
    Shield,
    Monitor,
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    hasMasterKey: boolean;
}

const navigation = [
    { name: 'Servers', href: '/dashboard', icon: Server },
    { name: 'Groups', href: '/dashboard/groups', icon: FolderOpen },
    { name: 'Sessions', href: '/dashboard/sessions', icon: Monitor },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        async function fetchUser() {
            try {
                const response = await fetch('/api/auth/me');
                const data = await response.json();

                if (!data.success) {
                    router.push('/login');
                    return;
                }

                setUser(data.data.user);
            } catch {
                router.push('/login');
            } finally {
                setLoading(false);
            }
        }

        fetchUser();
    }, [router]);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-dark-950">
                <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="min-h-screen bg-dark-950">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 bottom-0 w-64 bg-dark-900 border-r border-dark-800 z-50 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="flex items-center justify-between h-16 px-4 border-b border-dark-800">
                        <Link href="/dashboard" className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                                <Terminal className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-lg font-bold gradient-text">Termo</span>
                        </Link>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden p-1 text-dark-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="p-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                            <input
                                type="text"
                                placeholder="Search servers..."
                                className="input pl-9 text-sm py-2"
                            />
                        </div>
                    </div>

                    {/* Quick Add */}
                    <div className="px-4 mb-4">
                        <Link
                            href="/dashboard/servers/new"
                            className="btn btn-primary w-full justify-center"
                        >
                            <Plus className="w-4 h-4" />
                            Add Server
                        </Link>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-2 space-y-1">
                        {navigation.map((item) => {
                            const isActive =
                                pathname === item.href ||
                                (item.href !== '/dashboard' && pathname.startsWith(item.href));
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                            ? 'bg-primary-500/20 text-primary-400'
                                            : 'text-dark-300 hover:bg-dark-800 hover:text-white'
                                        }`}
                                >
                                    <item.icon className="w-5 h-5" />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User */}
                    <div className="p-4 border-t border-dark-800">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-white font-medium">
                                {user.email[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user.email}</p>
                                <div className="flex items-center gap-1.5 text-xs text-dark-400">
                                    {user.totpEnabled && (
                                        <span className="flex items-center gap-1 text-green-400">
                                            <Shield className="w-3 h-3" />
                                            2FA
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="btn btn-ghost w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="lg:pl-64">
                {/* Top bar */}
                <header className="sticky top-0 z-30 h-16 bg-dark-900/80 backdrop-blur-lg border-b border-dark-800 lg:hidden">
                    <div className="flex items-center justify-between h-full px-4">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 text-dark-400 hover:text-white"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <Link href="/dashboard" className="flex items-center gap-2">
                            <Terminal className="w-6 h-6 text-primary-500" />
                            <span className="font-bold">Termo</span>
                        </Link>
                        <div className="w-10" />
                    </div>
                </header>

                {/* Page content */}
                <main className="p-4 lg:p-8">{children}</main>
            </div>
        </div>
    );
}
