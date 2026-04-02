'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';
import {
  Search,
  Plus,
  MoreVertical,
  Grid3X3,
  List,
  FolderPlus,
  Users,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
  Clock3,
  UploadCloud,
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

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

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    void fetchProjects(user.id);
  }, [user?.id]);

  async function fetchProjects(userId: string) {
    try {
      setLoadingProjects(true);
      setProjectsError(null);

      const { data, error } = await supabase
        .from('projects')
        .select('id,user_id,name,file_path,file_mime,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      setProjects(rows);
      await buildPreviewUrls(rows);
    } catch (err: any) {
      setProjectsError(err?.message ?? 'Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  }

  async function buildPreviewUrls(rows: ProjectRow[]) {
    const currentMap = { ...previewUrls };
    const missing = rows.filter((row) => !currentMap[row.id]);
    if (missing.length === 0) return;

    const pairs = await Promise.all(
      missing.map(async (project) => {
        try {
          const { data, error } = await supabase.storage
            .from('project-files')
            .createSignedUrl(project.file_path, 60 * 60);

          if (error) throw error;
          return [project.id, data.signedUrl] as const;
        } catch {
          return [project.id, ''] as const;
        }
      }),
    );

    const next: Record<string, string> = {};
    for (const [id, url] of pairs) {
      if (url) next[id] = url;
    }

    if (Object.keys(next).length > 0) {
      setPreviewUrls((prev) => ({ ...prev, ...next }));
    }
  }

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(normalized));
  }, [query, projects]);

  const summary = useMemo(() => {
    const total = projects.length;
    const pdfCount = projects.filter((project) => project.file_mime === 'application/pdf').length;
    const newest = projects[0] ?? null;
    return {
      total,
      pdfCount,
      newest,
    };
  }, [projects]);

  function openModal() {
    setCreateError(null);
    setProjectName('');
    setBuildingType('');
    setFile(null);
    setDragOver(false);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (creating) return;
    setIsModalOpen(false);
  }

  async function handleCreateProject() {
    try {
      setCreateError(null);
      if (!user?.id) throw new Error('Not authenticated');
      if (!projectName.trim()) throw new Error('Please enter a project name.');
      if (!buildingType.trim()) throw new Error('Please select a building type.');
      if (!file) throw new Error('Please upload a PDF or JPEG file.');

      const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowed.includes(file.type)) {
        throw new Error('Only PDF or JPEG (and PNG for now) are allowed.');
      }

      setCreating(true);

      const projectId = crypto.randomUUID();
      const safeFilename = file.name.replace(/\s+/g, '_');
      const path = `${user.id}/${projectId}/${safeFilename}`;

      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('projects').insert({
        id: projectId,
        user_id: user.id,
        name: projectName.trim(),
        file_path: path,
        file_mime: file.type,
      });
      if (insertError) throw insertError;

      await fetchProjects(user.id);
      setIsModalOpen(false);
      router.push(`/dashboard/projects/${projectId}`);
    } catch (err: any) {
      setCreateError(err?.message ?? 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-6 sm:px-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">My Projects</p>
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">Project Library</h1>
            <p className="max-w-2xl text-sm text-slate-300">
              Manage uploads, organize active plan sets, and open any project workspace in one click.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm text-slate-200 transition hover:bg-white/10">
              <FolderPlus size={15} />
              New Folder
            </button>
            <button
              onClick={openModal}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
            >
              <Plus size={16} />
              Create Project
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Total Projects" value={String(summary.total)} />
        <SummaryCard title="PDF Plans" value={String(summary.pdfCount)} />
        <SummaryCard
          title="Last Added"
          value={summary.newest ? formatDate(summary.newest.created_at) : 'No activity yet'}
          helper={summary.newest?.name}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by project name"
              className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1120]/70 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 transition hover:bg-white/10">
              <Users size={16} />
              Invite
            </button>

            <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 p-1">
              <button
                onClick={() => setView('grid')}
                className={[
                  'inline-flex h-8 w-8 items-center justify-center rounded-md transition',
                  view === 'grid' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white',
                ].join(' ')}
                aria-label="Grid view"
              >
                <Grid3X3 size={16} />
              </button>
              <button
                onClick={() => setView('list')}
                className={[
                  'inline-flex h-8 w-8 items-center justify-center rounded-md transition',
                  view === 'list' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white',
                ].join(' ')}
                aria-label="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Projects</h2>
          <span className="text-xs text-slate-400">{filteredProjects.length} visible</span>
        </div>

        {projectsError ? (
          <div className="px-5 py-5">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {projectsError}
            </div>
          </div>
        ) : loadingProjects ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-100">
              {projects.length === 0 ? 'No projects yet.' : 'No matching projects.'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {projects.length === 0
                ? 'Create your first project to start uploading plans.'
                : 'Try a different search term or clear the filter.'}
            </p>
            {projects.length === 0 ? (
              <button
                onClick={openModal}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
              >
                <Plus size={16} />
                Create Project
              </button>
            ) : null}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                name={project.name}
                mime={project.file_mime}
                createdAt={project.created_at}
                ownerInitial={(user?.email?.[0] ?? 'U').toUpperCase()}
                previewUrl={previewUrls[project.id]}
                onOpen={() => router.push(`/dashboard/projects/${project.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.04]"
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              >
                <div className="grid h-10 w-12 place-items-center rounded-lg border border-white/10 bg-[#0b1120] text-slate-300">
                  {project.file_mime === 'application/pdf' ? <FileText size={17} /> : <ImageIcon size={17} />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{project.name}</p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                    <Clock3 size={12} />
                    <span>Created {formatDate(project.created_at)}</span>
                  </div>
                </div>

                <button
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-md p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <MoreVertical size={16} />
                </button>
              </button>
            ))}
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[radial-gradient(120%_180%_at_0%_0%,rgba(26,67,122,0.35),#070f1f_55%,#050a14_100%)] shadow-2xl">
            <div className="flex items-center justify-between px-7 py-5">
              <h3 className="text-[1.7rem] font-semibold leading-none text-white">Create New Project</h3>
              <button
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-7 pb-5">
              {createError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {createError}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm text-slate-300">Project Name</label>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="e.g. Basement Plan - Phase 1"
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Building Type</label>
                <select
                  value={buildingType}
                  onChange={(event) => setBuildingType(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white focus:border-cyan-400/40 focus:outline-none"
                >
                  <option value="" className="bg-[#081224] text-slate-300">Select building type</option>
                  <option value="residential" className="bg-[#081224] text-slate-100">Residential</option>
                  <option value="commercial" className="bg-[#081224] text-slate-100">Commercial</option>
                  <option value="mixed_use" className="bg-[#081224] text-slate-100">Mixed Use</option>
                </select>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    const droppedFile = event.dataTransfer.files?.[0];
                    if (droppedFile) setFile(droppedFile);
                  }}
                  className={[
                    'w-full rounded-xl border border-dashed px-6 py-10 text-center transition',
                    dragOver
                      ? 'border-cyan-400/70 bg-cyan-500/10'
                      : 'border-white/20 bg-[#061021] hover:border-cyan-400/35 hover:bg-cyan-500/[0.06]',
                  ].join(' ')}
                >
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/5 text-slate-300">
                    <UploadCloud size={22} />
                  </div>
                  <div className="text-2xl font-semibold text-slate-100">Drag &amp; Drop</div>
                  <div className="mt-1 text-sm text-slate-400">Drag &amp; drop floorplans here or click to upload</div>
                </button>
              </div>

              {file ? (
                <div className="rounded-xl border border-white/10 bg-[#091324] p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-14 w-20 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 text-slate-300">
                      {file.type === 'application/pdf' ? <FileText size={24} /> : <ImageIcon size={24} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xl text-slate-100">
                        {file.name} <span className="text-base text-slate-400">({creating ? 'Uploading 80%' : 'Queued'})</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-cyan-400 transition-all"
                          style={{ width: creating ? '80%' : '32%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3 border-t border-white/10 px-7 py-5">
              <button
                onClick={handleCreateProject}
                className="h-11 flex-1 rounded-full border border-cyan-400/35 bg-cyan-500/20 text-base font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={creating || !projectName.trim() || !buildingType.trim() || !file}
              >
                {creating ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  'Create Project'
                )}
              </button>
              <button
                onClick={closeModal}
                className="h-11 min-w-[150px] rounded-full border border-white/15 bg-white/[0.03] px-6 text-base text-slate-200 transition hover:bg-white/10"
                disabled={creating}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  helper,
}: {
  title: string;
  value: string;
  helper?: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      {helper ? <p className="mt-1 truncate text-xs text-slate-400">{helper}</p> : null}
    </article>
  );
}

function ProjectCard({
  name,
  mime,
  createdAt,
  ownerInitial,
  previewUrl,
  onOpen,
}: {
  name: string;
  mime: string;
  createdAt: string;
  ownerInitial: string;
  previewUrl?: string;
  onOpen: () => void;
}) {
  const isPdf = mime === 'application/pdf';
  const isImage = mime.startsWith('image/');

  return (
    <button
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:border-white/15 hover:bg-white/[0.05]"
    >
      <div className="relative aspect-[5/4] overflow-hidden bg-[#0b1120]">
        {previewUrl ? (
          isImage ? (
            <img
              src={previewUrl}
              alt={name}
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:scale-[1.01]"
              loading="lazy"
            />
          ) : isPdf ? (
            <PdfThumb url={previewUrl} />
          ) : null
        ) : null}

        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[size:22px_22px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50" />

        {!previewUrl ? (
          <div className="absolute inset-0 grid place-items-center text-slate-300">
            {isPdf ? <FileText size={30} /> : <ImageIcon size={30} />}
          </div>
        ) : null}

        <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-cyan-300/35 bg-cyan-500/20 text-xs font-bold text-cyan-100">
          {ownerInitial}
        </div>

        <button
          onClick={(event) => event.stopPropagation()}
          className="absolute left-3 top-3 rounded-lg border border-white/15 bg-black/25 p-1.5 text-white/80 opacity-0 transition hover:bg-black/35 hover:text-white group-hover:opacity-100"
        >
          <MoreVertical size={15} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black/45 px-3 py-2 backdrop-blur-sm">
          <div className="truncate text-sm font-medium text-white">{name}</div>
          <div className="mt-0.5 text-xs text-white/70">Created {formatDate(createdAt)}</div>
        </div>
      </div>
    </button>
  );
}

function PdfThumb({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;
    const update = () => setHeight(element.clientHeight || 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 flex items-center justify-center bg-[#0b1120] pointer-events-none">
      {height > 0 ? (
        <Document file={url} loading={null} error={null}>
          <Page
            pageNumber={1}
            height={height}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      ) : (
        <div className="text-xs text-slate-400">Loading...</div>
      )}
    </div>
  );
}
