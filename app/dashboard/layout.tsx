'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { Settings, Loader2, LogOut } from 'lucide-react';

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const breadcrumb = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const trail = ['FlowBuildr'];

    if (segments[0] !== 'dashboard') {
      return trail;
    }

    if (!segments[1]) {
      trail.push('Dashboard');
      return trail;
    }

    if (segments[1] === 'projects') {
      if (!segments[2]) {
        trail.push('Dashboard');
        return trail;
      }

      trail.push(toTitleCase(decodeURIComponent(segments[2])));

      if (segments[3]) {
        trail.push(toTitleCase(decodeURIComponent(segments[3])));
      }

      return trail;
    }

    trail.push(toTitleCase(segments[1]));
    return trail;
  }, [pathname]);
  const contextTrail = useMemo(() => {
    const segments = breadcrumb.slice(1);
    return segments.length > 0 ? segments : ['Dashboard'];
  }, [breadcrumb]);

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
  const isProjectsDashboard = pathname === '/dashboard/projects';

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#030712] text-white font-sans selection:bg-cyan-500/30">
      {!isProjectViewer && (
        <header className="fixed left-0 top-0 z-50 h-16 w-full border-b border-white/10 bg-[#040a16]/95 backdrop-blur-xl">
          <div className="mx-auto flex h-full w-full max-w-[1900px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <Link href="/dashboard/projects" aria-label="Open dashboard home" className="shrink-0">
                <Image
                  src="/images/FlowBuildrCroppedLogo.png"
                  alt="FlowBuildr"
                  width={265}
                  height={46}
                  className="h-8 w-auto object-contain"
                  priority
                />
              </Link>
              <div className="min-w-0 hidden items-center gap-2 text-sm sm:flex">
                <span className="truncate text-slate-200">
                  {contextTrail.join(' / ')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
                <Link
                  href="/dashboard/settings"
                  className="grid h-8 w-8 place-items-center rounded-full border border-[#297FD6]/90 bg-[#297FD6] text-white transition hover:border-[#2473C2] hover:bg-[#2473C2]"
                  aria-label="Open settings"
                  title="Settings"
                >
                  <Settings size={15} />
                </Link>
                <div className="hidden h-4 w-px bg-white/10 md:block" />
                <div className="hidden max-w-[240px] overflow-hidden md:block">
                  <p className="truncate text-sm text-slate-200">{email}</p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
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
                : isProjectsDashboard
                  ? 'dashboard-main-surface overflow-y-auto px-2 py-5 sm:px-3 sm:py-6 lg:px-4 lg:py-8 xl:px-5'
                  : 'dashboard-main-surface overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 xl:px-10',
            ].join(' ')}
          >
            {isProjectViewer ? children : <div className="dashboard-main-content">{children}</div>}
          </main>
        </div>
      </div>
    </div>
  );
}
