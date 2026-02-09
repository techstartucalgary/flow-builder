'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
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
} from 'lucide-react';

// ✅ PDF thumbnail rendering
import { Document, Page, pdfjs } from 'react-pdf';

// PDF.js worker (client-side)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_mime: string;
  created_at: string;
};

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // ✅ preview URLs for cards (signed URLs)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchProjects() {
    try {
      setLoadingProjects(true);
      setProjectsError(null);

      const { data, error } = await supabase
        .from('projects')
        .select('id,user_id,name,file_path,file_mime,created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      setProjects(rows);

      // ✅ Build signed preview URLs for thumbnails
      await buildPreviewUrls(rows);
    } catch (e: any) {
      console.error(e);
      setProjectsError(e?.message ?? 'Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  }

  async function buildPreviewUrls(rows: ProjectRow[]) {
    // small optimization: don’t refetch if we already have a URL
    const missing = rows.filter((r) => !previewUrls[r.id]);

    if (missing.length === 0) return;

    const pairs = await Promise.all(
      missing.map(async (p) => {
        try {
          const { data, error } = await supabase.storage
            .from('project-files')
            .createSignedUrl(p.file_path, 60 * 60); // 1 hour

          if (error) throw error;
          return [p.id, data.signedUrl] as const;
        } catch (err) {
          console.warn('Failed to create signed url for', p.id, err);
          return [p.id, ''] as const;
        }
      })
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
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, projects]);

  function openModal() {
    setCreateError(null);
    setProjectName('');
    setFile(null);
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
      if (!file) throw new Error('Please upload a PDF or JPEG file.');

      const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowed.includes(file.type)) {
        throw new Error('Only PDF or JPEG (and PNG for now) are allowed.');
      }

      setCreating(true);

      const projectId = crypto.randomUUID();
      const safeFilename = file.name.replace(/\s+/g, '_');
      const path = `${user.id}/${projectId}/${safeFilename}`;

      // 1) upload file
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      // 2) insert DB row
      const { error: insertError } = await supabase.from('projects').insert({
        id: projectId,
        name: projectName.trim(),
        file_path: path,
        file_mime: file.type,
      });

      if (insertError) throw insertError;

      // 3) refresh list
      await fetchProjects();

      // 4) close modal & navigate
      setIsModalOpen(false);
      router.push(`/dashboard/projects/${projectId}`);
    } catch (e: any) {
      console.error(e);
      setCreateError(e?.message ?? 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Top row */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter the name of your project or the name of the folder"
              className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 justify-between lg:justify-end">
          <button className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-200 hover:bg-white/10 transition">
            <Users size={18} />
            Invite members
          </button>

          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setView('grid')}
              className={`h-9 w-9 rounded-lg flex items-center justify-center transition ${
                view === 'grid' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
              }`}
              aria-label="Grid view"
            >
              <Grid3X3 size={18} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`h-9 w-9 rounded-lg flex items-center justify-center transition ${
                view === 'list' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
              }`}
              aria-label="List view"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Folders */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-gray-200">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10">
            <Plus size={16} className="text-blue-400" />
          </span>
          <h2 className="font-semibold">Folders</h2>

          <button className="ml-auto inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 hover:bg-white/10 transition">
            <FolderPlus size={16} />
            New folder
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-gray-400 text-sm">No folders yet.</div>
        </div>
      </section>

      {/* Projects */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-gray-200">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10">
            <Plus size={16} className="text-blue-400" />
          </span>
          <h2 className="font-semibold">Projects</h2>

          <button
            onClick={openModal}
            className="ml-auto inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-[#0099FC] text-white text-sm font-semibold hover:brightness-110 transition"
          >
            <Plus size={16} />
            Create project
          </button>
        </div>

        {projectsError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
            {projectsError}
          </div>
        )}

        {loadingProjects ? (
          <div className="flex items-center gap-3 text-gray-400">
            <Loader2 className="animate-spin" size={18} />
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-gray-300 font-medium">No projects yet.</p>
            <p className="text-gray-500 text-sm mt-1">Create one to see it here.</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                name={p.name}
                mime={p.file_mime}
                createdAt={p.created_at}
                ownerInitial={(user?.email?.[0] ?? 'U').toUpperCase()}
                previewUrl={previewUrls[p.id]}
                onOpen={() => router.push(`/dashboard/projects/${p.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            {filteredProjects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 px-5 py-4 border-b border-white/10 last:border-b-0 cursor-pointer hover:bg-white/5 transition"
                onClick={() => router.push(`/dashboard/projects/${p.id}`)}
              >
                <div className="w-12 h-10 rounded-lg bg-[#0b1120] border border-white/10 grid place-items-center text-gray-300">
                  {p.file_mime === 'application/pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{p.name}</div>
                  <div className="text-gray-500 text-xs">
                    Created {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>

                <button className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition">
                  <MoreVertical size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1120] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Create new project</h3>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {createError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-300 mb-2">Project name</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. basement plan"
                  className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Upload PDF / JPEG</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-white/10 file:text-white hover:file:bg-white/20"
                />
                {file && (
                  <p className="mt-2 text-xs text-gray-400">
                    Selected: <span className="text-gray-200">{file.name}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 transition"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                className="h-10 px-4 rounded-xl bg-[#0099FC] text-white font-semibold hover:brightness-110 transition inline-flex items-center gap-2"
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    Create
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
    <div
      onClick={onOpen}
      className="group rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition overflow-hidden cursor-pointer"
    >
      <div className="relative aspect-[4/3] bg-[#0b1120] overflow-hidden">
        {/* Thumbnail */}
        {previewUrl ? (
          isImage ? (
            <img
              src={previewUrl}
              alt={name}
              className="absolute inset-0 w-full h-full object-cover opacity-90"
              loading="lazy"
            />
          ) : isPdf ? (
            <PdfThumb url={previewUrl} />
          ) : null
        ) : null}

        {/* subtle grid overlay */}
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[size:22px_22px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/45" />

        {/* Fallback icon if no preview */}
        {!previewUrl && (
          <div className="absolute inset-0 grid place-items-center text-gray-300">
            {isPdf ? <FileText size={36} /> : <ImageIcon size={36} />}
          </div>
        )}

        {/* Avatar */}
        <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#0099FC] text-white grid place-items-center font-bold text-sm shadow-lg">
          {ownerInitial}
        </div>

        {/* Menu */}
        <button className="absolute top-3 left-3 p-2 rounded-lg bg-black/20 border border-white/10 text-white/80 hover:text-white hover:bg-black/30 transition opacity-0 group-hover:opacity-100">
          <MoreVertical size={18} />
        </button>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-black/40 backdrop-blur-sm border-t border-white/10">
          <div className="text-white font-medium text-sm truncate">{name}</div>
          <div className="text-white/70 text-xs mt-0.5">
            Created {new Date(createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ✅ PDF Thumbnail (page 1)
 * Renders inside the card without intercepting clicks.
 */
function PdfThumb({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number>(0);

  useEffect(() => {
    if (!ref.current) return;

    const el = ref.current;
    const update = () => setH(el.clientHeight || 0);

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[#0b1120]"
    >
      {h > 0 ? (
        <Document file={url} loading={null} error={null}>
          <Page
            pageNumber={1}
            height={h}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      ) : (
        <div className="text-xs text-gray-400">Loading…</div>
      )}
    </div>
  );
}
