'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { Settings, Loader2, LogOut } from 'lucide-react';

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
        <Loader2 className="animate-spin text-cyan-500 w-10 h-10" />
      </div>
    );
  }

  if (!user) return null;

  const email = user.email ?? 'FlowBuildr User';
  const isProjectViewer =
    pathname.startsWith('/dashboard/projects/') && pathname !== '/dashboard/projects';

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#030712] text-white font-sans selection:bg-cyan-500/30">
      {!isProjectViewer && (
        <header className="fixed left-0 top-0 z-50 h-16 w-full border-b border-white/10 bg-[#040a16]/95 backdrop-blur-xl">
          <div className="mx-auto flex h-full w-full max-w-[1900px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/projects"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:text-white"
                aria-label="Open projects"
              >
                <Settings size={15} />
              </Link>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Project Workspace</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-3 sm:flex">
                <Link
                  href="/dashboard/settings"
                  className="grid h-8 w-8 place-items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/15"
                  aria-label="Open settings"
                  title="Settings"
                >
                  <Settings size={15} />
                </Link>
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
          <main
            className={[
              'flex-1 min-w-0 h-full min-h-0',
              isProjectViewer
                ? 'p-0 overflow-hidden bg-[#030712]'
                : 'overflow-y-auto bg-[linear-gradient(180deg,#040a16_0%,#060d1f_100%)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 xl:px-10',
            ].join(' ')}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
