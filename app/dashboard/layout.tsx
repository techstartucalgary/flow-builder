'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { LayoutDashboard, Folder, Settings, Loader2, LogOut } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    if (!loading && !user) router.push('/auth/signin');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <Loader2 className="animate-spin text-blue-500 w-10 h-10" />
      </div>
    );
  }

  if (!user) return null;

  const isActive = (href: string) => pathname === href;

  const isProjectViewer =
    pathname.startsWith('/dashboard/projects/') && pathname !== '/dashboard/projects';

  return (
    <div className="h-[100dvh] w-full bg-[#030712] text-white font-sans selection:bg-blue-500/30 overflow-hidden">
      {/* Top Nav */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-[#030712]/90 backdrop-blur-xl border-b border-white/10 h-16 flex items-center justify-end px-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 border border-white/10 flex items-center justify-center text-xs font-bold">
              {user.email?.substring(0, 2).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-300 hidden sm:block">
              {user.email}
            </span>
          </div>

          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </nav>

      {/* ✅ Content below fixed nav.
          No calc height. Padding accounts for the 64px nav INSIDE the 100dvh box. */}
      <div className="pt-16 h-full min-h-0">
        <div className="flex h-full min-h-0 overflow-hidden">
          {/* Sidebar (hidden on viewer) */}
          {!isProjectViewer && (
            <aside className="w-64 bg-[#030712] border-r border-white/5 hidden lg:flex flex-col">
              <div className="p-6 flex-1">
                <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-4 pl-2">
                  Overview
                </h3>

                <nav className="space-y-2">
                  <Link
                    href="/dashboard"
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                      isActive('/dashboard')
                        ? 'text-white bg-blue-600/10 border-r-2 border-blue-500 rounded-l-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <LayoutDashboard
                      size={18}
                      className={isActive('/dashboard') ? 'text-blue-400' : ''}
                    />
                    <span className="font-medium">Dashboard</span>
                  </Link>

                  <Link
                    href="/dashboard/projects"
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                      isActive('/dashboard/projects')
                        ? 'text-white bg-blue-600/10 border-r-2 border-blue-500 rounded-l-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Folder
                      size={18}
                      className={isActive('/dashboard/projects') ? 'text-blue-400' : ''}
                    />
                    <span className="font-medium">My Projects</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                      isActive('/dashboard/settings')
                        ? 'text-white bg-blue-600/10 border-r-2 border-blue-500 rounded-l-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Settings
                      size={18}
                      className={isActive('/dashboard/settings') ? 'text-blue-400' : ''}
                    />
                    <span className="font-medium">Settings</span>
                  </Link>
                </nav>
              </div>

              <div className="p-6 border-t border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 border border-white/10 flex items-center justify-center text-xs font-bold">
                    {user.email?.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-white truncate">{user.email}</p>
                    <p className="text-xs text-gray-500 truncate">Free Plan</p>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* Main content */}
          <main
            className={[
              'flex-1 min-w-0 h-full min-h-0',
              isProjectViewer
                ? 'p-0 overflow-hidden bg-[#030712]'
                : 'p-6 lg:p-10 overflow-y-auto bg-gradient-to-b from-[#030712] to-[#0b1120]',
            ].join(' ')}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
