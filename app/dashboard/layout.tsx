'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { LayoutDashboard, Folder, Settings, Loader2, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/projects', label: 'My Projects', icon: Folder },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/auth/signin');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <Loader2 className="animate-spin text-cyan-500 w-10 h-10" />
      </div>
    );
  }

  if (!user) return null;

  const email = user.email ?? 'FlowBuildr User';
  const initials = email.slice(0, 2).toUpperCase();
  const isActive = (href: string) => pathname === href;

  const isProjectViewer =
    pathname.startsWith('/dashboard/projects/') && pathname !== '/dashboard/projects';

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#030712] text-white font-sans selection:bg-cyan-500/30">
      {!isProjectViewer && (
        <header className="fixed left-0 top-0 z-50 h-16 w-full border-b border-white/10 bg-[#040a16]/95 backdrop-blur-xl">
          <div className="mx-auto flex h-full w-full max-w-[1700px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarCollapsed((current) => !current)}
                className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              </button>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Project Workspace</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-3 sm:flex">
                <div className="grid h-8 w-8 place-items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-xs font-semibold text-cyan-100">
                  {initials}
                </div>
                <div className="max-w-[240px] overflow-hidden">
                  <p className="truncate text-sm text-slate-200">{email}</p>
                </div>
              </div>

              <button
                onClick={() => signOut()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>
      )}

      <div className={`${isProjectViewer ? '' : 'pt-16'} h-full min-h-0`}>
        <div className="flex h-full min-h-0 overflow-hidden">
          {!isProjectViewer && (
            <aside
              className={[
                'hidden shrink-0 border-r border-white/10 bg-[#040b17] lg:flex lg:flex-col',
                sidebarCollapsed ? 'w-[84px]' : 'w-[260px]',
              ].join(' ')}
            >
              <div className="flex-1 px-5 py-6">
                {!sidebarCollapsed ? (
                  <div className="mb-6 px-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Navigation</p>
                  </div>
                ) : null}

                <nav className="space-y-1.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          'flex items-center rounded-xl px-3 py-2.5 text-sm transition-colors',
                          sidebarCollapsed ? 'justify-center' : 'gap-3',
                          active
                            ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                            : 'border border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                        ].join(' ')}
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        <Icon size={17} />
                        {!sidebarCollapsed ? <span className="font-medium">{item.label}</span> : null}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="border-t border-white/10 px-5 py-5">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className={sidebarCollapsed ? 'flex justify-center' : 'flex items-center gap-3'}>
                    <div className="grid h-9 w-9 place-items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-xs font-semibold text-cyan-100">
                      {initials}
                    </div>
                    {!sidebarCollapsed ? (
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-100">{email}</p>
                        <p className="text-xs text-slate-400">Workspace Account</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          )}

          <main
            className={[
              'flex-1 min-w-0 h-full min-h-0',
              isProjectViewer
                ? 'p-0 overflow-hidden bg-[#030712]'
                : 'overflow-y-auto bg-[linear-gradient(180deg,#040a16_0%,#060d1f_100%)] px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8',
            ].join(' ')}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
