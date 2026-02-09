'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ChevronLeft, ChevronRight, Minus, Plus, Loader2, FileText, Image as ImageIcon, Sparkles, AlertCircle } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const PdfViewerClient = dynamic(() => import('@/components/pdf/PdfViewer'), {
  ssr: false,
  loading: () => <div className="text-gray-400">Loading PDF viewer...</div>,
});

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_mime: string;
  created_at: string;
};

export default function ProjectViewerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, projectId]);

  async function load() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('projects')
        .select('id,user_id,name,file_path,file_mime,created_at')
        .eq('id', projectId)
        .single();

      if (error) throw error;

      if (data.user_id !== user!.id) {
        router.push('/dashboard/projects');
        return;
      }

      setProject(data);

      const { data: signed, error: signedError } = await supabase.storage
        .from('project-files')
        .createSignedUrl(data.file_path, 60 * 60);

      if (signedError) throw signedError;

      setFileUrl(signed.signedUrl);
    } catch (e) {
      console.error(e);
      router.push('/dashboard/projects');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    if (!fileUrl || !project) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/takeoff/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: fileUrl,
          file_mime: project.file_mime,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setAnalysisResult(data.analysis);
    } catch (e: any) {
      setAnalysisError(e.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  const isPdf = useMemo(() => project?.file_mime === 'application/pdf', [project?.file_mime]);
  const isImage = useMemo(() => project?.file_mime?.startsWith('image/'), [project?.file_mime]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-400 p-3">
        <Loader2 className="animate-spin" size={18} />
        Loading project...
      </div>
    );
  }

  if (!project || !fileUrl) return null;

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full w-full grid grid-rows-[auto_1fr] gap-3 p-3 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 transition shrink-0"
          >
            <ChevronLeft size={18} />
            Back
          </button>

          <div className="text-white font-semibold text-lg truncate">{project.name}</div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500">{isPdf ? 'PDF' : 'Image'}</span>
          </div>
        </div>

        {/* 3-panel layout */}
        <div className="min-h-0 h-full w-full grid gap-3 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
          {/* Left */}
          <aside className="rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white font-semibold text-sm">Plans</div>
              <div className="text-gray-500 text-xs">Current</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0b1120] p-3 flex items-center gap-3">
              {isPdf ? <FileText size={18} className="text-gray-300" /> : <ImageIcon size={18} className="text-gray-300" />}
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{project.name}</div>
                <div className="text-xs text-gray-500 truncate">{project.file_mime}</div>
              </div>
            </div>

            {isPdf && (
              <div className="mt-auto pt-3 flex items-center justify-between text-sm text-gray-300">
                <button
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 grid place-items-center"
                  disabled={pageNumber <= 1}
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="text-xs">
                  Page <span className="text-white">{pageNumber}</span> / <span className="text-white">{numPages || '-'}</span>
                </div>

                <button
                  onClick={() => setPageNumber((p) => Math.min(numPages || p, p + 1))}
                  className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 grid place-items-center"
                  disabled={numPages > 0 && pageNumber >= numPages}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </aside>

          {/* Center */}
          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-black/10 shrink-0">
              <div className="text-gray-300 text-sm">Viewer</div>
              <div className="ml-auto text-gray-400 text-xs">Zoom / Pan enabled</div>
            </div>

            <div className="flex-1 min-h-0 bg-[#0b1120]">
              <TransformWrapper initialScale={1} minScale={0.5} maxScale={4} centerOnInit>
                {({ zoomIn, zoomOut, resetTransform }) => (
                  <div className="h-full w-full flex flex-col min-h-0">
                    <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-black/10 shrink-0">
                      <button
                        onClick={() => zoomOut()}
                        className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 grid place-items-center text-gray-200"
                      >
                        <Minus size={18} />
                      </button>
                      <button
                        onClick={() => zoomIn()}
                        className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 grid place-items-center text-gray-200"
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        onClick={() => resetTransform()}
                        className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-sm"
                      >
                        Reset
                      </button>

                      {isPdf && <div className="ml-auto text-gray-400 text-sm">Page {pageNumber}</div>}
                    </div>

                    <div className="flex-1 min-h-0">
                      <TransformComponent wrapperClass="!w-full !h-full !min-h-0" contentClass="!w-full !h-full">
                        <div className="w-full h-full flex items-center justify-center p-1">
                          {isPdf ? (
                            <PdfViewerClient
                              fileUrl={fileUrl}
                              pageNumber={pageNumber}
                              onLoadNumPages={(n) => {
                                setNumPages(n);
                                setPageNumber((p) => Math.min(p, n));
                              }}
                            />
                          ) : (
                            <img src={fileUrl} alt={project.name} className="max-h-full max-w-full object-contain" />
                          )}
                        </div>
                      </TransformComponent>
                    </div>
                  </div>
                )}
              </TransformWrapper>
            </div>
          </section>

          {/* Right — Analysis Panel */}
          <aside className="rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col min-h-0">
            <div className="text-white font-semibold mb-3 text-sm">AI Takeoff</div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm font-medium transition mb-3 shrink-0"
            >
              {analyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Analyze Plan
                </>
              )}
            </button>

            {analysisError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 mb-3 shrink-0">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-red-300 text-xs">{analysisError}</p>
                </div>
              </div>
            )}

            {analysisResult ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                <div className="text-gray-300 text-xs whitespace-pre-wrap leading-relaxed font-mono">
                  {analysisResult}
                </div>
              </div>
            ) : !analyzing && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-xs text-center px-2">
                  Click &quot;Analyze Plan&quot; to extract rooms, walls, doors, windows, and get a material estimate.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
