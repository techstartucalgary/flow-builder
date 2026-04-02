'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, ArrowRight, Loader2, Clock3, FileStack, ScanText } from 'lucide-react';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_mime: string;
  created_at: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void loadProjects(user.id);
  }, [user?.id]);

  async function loadProjects(userId: string) {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('projects')
        .select('id,user_id,name,file_path,file_mime,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(12);

      if (queryError) throw queryError;
      setProjects(data ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load your workspace');
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const total = projects.length;
    const pdfCount = projects.filter((project) => project.file_mime === 'application/pdf').length;
    const imageCount = Math.max(total - pdfCount, 0);
    const newestProject = projects[0] ?? null;

    return {
      total,
      pdfCount,
      imageCount,
      newestProject,
      hasProjects: total > 0,
    };
  }, [projects]);

  const recentProjects = projects.slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-6 sm:px-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">FlowBuildr Command Center</h1>
            <p className="max-w-2xl text-sm text-slate-300">
              Continue active projects, start new plan uploads, and keep your workspace moving.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/projects"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm text-slate-100 transition hover:bg-white/10"
            >
              <Folder size={16} />
              View My Projects
            </Link>
            {stats.newestProject ? (
              <button
                onClick={() => router.push(`/dashboard/projects/${stats.newestProject?.id}`)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Continue Latest
                <ArrowRight size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          title="Total Projects"
          value={String(stats.total)}
          helper={stats.total === 1 ? '1 active workspace item' : `${stats.total} workspace items`}
          icon={<FileStack size={16} />}
        />
        <StatusCard
          title="PDF Plans"
          value={String(stats.pdfCount)}
          helper="Plans optimized for takeoff workflow"
          icon={<ScanText size={16} />}
        />
        <StatusCard
          title="Image Plans"
          value={String(stats.imageCount)}
          helper="JPG and PNG uploads"
          icon={<Folder size={16} />}
        />
        <StatusCard
          title="Last Activity"
          value={stats.newestProject ? formatDate(stats.newestProject.created_at) : 'No activity yet'}
          helper={stats.newestProject ? stats.newestProject.name : 'Create your first project to begin'}
          icon={<Clock3 size={16} />}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Recent Projects</h2>
          <p className="mt-1 text-sm text-slate-400">Pick up where you left off with your latest plans.</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 px-6 py-10 text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recent projects...
          </div>
        ) : error ? (
          <div className="px-6 py-8">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          </div>
        ) : !stats.hasProjects ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-100">No projects yet.</p>
            <p className="mt-1 text-sm text-slate-400">
              Create a project in My Projects to start uploading plans and running takeoff.
            </p>
            <Link
              href="/dashboard/projects"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
            >
              Open My Projects
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {recentProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-white/[0.04]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{project.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Added {formatDate(project.created_at)} -{' '}
                    {project.file_mime === 'application/pdf' ? 'PDF plan' : 'Image plan'}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-cyan-200">
                  Open
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
        {icon}
      </div>
      <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{helper}</p>
    </article>
  );
}
