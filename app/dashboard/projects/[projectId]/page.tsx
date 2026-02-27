'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Sparkles,
  PencilRuler,
} from 'lucide-react';
import { getBackendUrl } from '@/lib/backendUrl';
import { parseTakeoff, EMPTY_TAKEOFF } from '@/lib/parseTakeoff';
import type { TakeoffData } from '@/lib/parseTakeoff';
import TakeoffAnalyzingOverlay from '@/components/TakeoffAnalyzingOverlay';
import AnnotationEditorBoundary from '@/components/annotation/AnnotationEditorBoundary';

const BACKEND_URL = getBackendUrl();
const WASTE_FACTOR = 0.15;
const SHEET_SQFT = 48; // 4' x 12' sheet = 48 sq ft

const PdfViewerClient = dynamic(() => import('@/components/pdf/PdfViewer'), {
  ssr: false,
  loading: () => <div className="text-gray-400">Loading PDF viewer...</div>,
});
const AnnotationEditorShell = dynamic(
  () => import('@/components/annotation/AnnotationEditorShell'),
  {
    ssr: false,
    loading: () => <div className="text-gray-400">Loading annotation editor...</div>,
  },
);

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
  const [zoom, setZoom] = useState(1);
  const [editorMode, setEditorMode] = useState(true);

  // Takeoff state
  const [generating, setGenerating] = useState(false);
  const [takeoff, setTakeoff] = useState<TakeoffData>(EMPTY_TAKEOFF);
  const [generated, setGenerated] = useState(false);
  const [takeoffError, setTakeoffError] = useState<string | null>(null);
  // CV pipeline annotated image (base64 PNG, displayed over PDF)
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null);
  // Optional scale (px/ft) for drywall calculation — e.g. 50 for 1/4"=1' at 200 DPI
  const [scalePxPerFt, setScalePxPerFt] = useState<string>('');

  // Overlay stepper
  const ANALYSIS_STEPS = [
    'Uploading plan\u2026',
    'Reading legend\u2026',
    'Detecting doors/windows\u2026',
    'Estimating drywall\u2026',
  ];
  const [overlayStatus, setOverlayStatus] = useState(ANALYSIS_STEPS[0]);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startStepper = useCallback(() => {
    let idx = 0;
    setOverlayStatus(ANALYSIS_STEPS[0]);
    stepTimerRef.current = setInterval(() => {
      idx++;
      if (idx < ANALYSIS_STEPS.length) {
        setOverlayStatus(ANALYSIS_STEPS[idx]);
      } else {
        // Stay on last step; don't loop too fast
        setOverlayStatus(ANALYSIS_STEPS[ANALYSIS_STEPS.length - 1]);
      }
    }, 1200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStepper = useCallback(() => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  async function handleGenerate() {
    if (!fileUrl || !project) return;
    setGenerating(true);
    setTakeoffError(null);
    startStepper();

    try {
      const body: Record<string, unknown> = {
        file_url: fileUrl,
        file_mime: project.file_mime,
        page_number: pageNumber,
      };
      const scale = scalePxPerFt.trim() ? parseFloat(scalePxPerFt) : undefined;
      if (typeof scale === 'number' && !Number.isNaN(scale) && scale > 0) {
        body.scale_px_per_ft = scale;
      }
      console.log('[takeoff] request:', { ...body, file_url: '(hidden)' });
      const res = await fetch(`${BACKEND_URL}/api/takeoff/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      console.log('[takeoff] response:', { net_drywall_sqft: data.net_drywall_sqft, scale: scale, cv_walls: data.cv_walls });
      const hasStructured =
        typeof data.net_drywall_sqft === 'number' ||
        typeof data.cv_doors === 'number' ||
        typeof data.cv_windows === 'number';
      const parsed: TakeoffData = hasStructured
        ? {
            totalArea: typeof data.total_area_sqft === 'number' ? data.total_area_sqft : 0,
            netDrywall: typeof data.net_drywall_sqft === 'number' ? data.net_drywall_sqft : 0,
            doors: typeof data.cv_doors === 'number' ? data.cv_doors : 0,
            windows: typeof data.cv_windows === 'number' ? data.cv_windows : 0,
            waste: Math.round(WASTE_FACTOR * 100),
            summary: data.analysis || '',
          }
        : parseTakeoff(data.analysis || '');

      setTakeoff(parsed);
      setGenerated(true);

      // Store annotated image for overlay (no Supabase)
      if (data.annotated_image) {
        setAnnotatedImage(`data:image/png;base64,${data.annotated_image}`);
      }
    } catch (e: any) {
      setTakeoffError(e.message || 'Generation failed');
    } finally {
      stopStepper();
      setGenerating(false);
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
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-1 min-w-0 px-3 py-2 shrink-0">
        <button
          onClick={() => router.push('/dashboard/projects')}
          className="inline-flex items-center text-gray-300 hover:text-white transition shrink-0"
          aria-label="Back to projects"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-white font-semibold text-lg truncate">{project.name}</div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditorMode((v) => !v)}
            className={`h-8 px-3 rounded-lg border text-xs inline-flex items-center gap-1.5 transition ${
              editorMode
                ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-200'
                : 'border-white/10 bg-white/5 text-gray-300'
            }`}
            title="Toggle annotation editor"
          >
            <PencilRuler size={14} />
            {editorMode ? 'Editor On' : 'Editor Off'}
          </button>

          {isPdf && numPages > 1 && (
            <>
            <button
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 grid place-items-center text-gray-200"
              disabled={pageNumber <= 1}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-gray-400">
              {pageNumber} / {numPages}
            </span>
            <button
              onClick={() => setPageNumber((p) => Math.min(numPages || p, p + 1))}
              className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 grid place-items-center text-gray-200"
              disabled={numPages > 0 && pageNumber >= numPages}
            >
              <ChevronRight size={16} />
            </button>
            </>
          )}
        </div>
      </div>

      {/* 2-panel layout — takes all remaining height */}
      <div className="flex-1 min-h-0 flex">
        {/* Left — PDF with zoom bar */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {editorMode ? (
            <div className="flex-1 min-h-0 p-2">
              <AnnotationEditorBoundary
                key={`${project.id}:${pageNumber}`}
                onDisableEditor={() => setEditorMode(false)}
              >
                <AnnotationEditorShell
                  projectId={project.id}
                  fileUrl={fileUrl}
                  fileMime={project.file_mime}
                  pageNumber={pageNumber}
                  scalePxPerFt={scalePxPerFt.trim() ? parseFloat(scalePxPerFt) : undefined}
                  actorId={user?.id}
                />
              </AnnotationEditorBoundary>
            </div>
          ) : (
            <>
              {/* Zoom bar */}
              <div className="flex items-center gap-3 px-3 py-1.5 text-gray-300 text-xs shrink-0">
                <button
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="flex items-center justify-center hover:text-white transition"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="hover:text-white transition min-w-[3rem] text-center"
                  aria-label="Reset zoom"
                  title="Reset to 100%"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                  className="flex items-center justify-center hover:text-white transition"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={16} />
                </button>
              </div>

              {/* PDF / Image — or annotated overlay after takeoff */}
              <div className="flex-1 min-h-0 overflow-auto relative">
                {annotatedImage && generated ? (
                  /* Show CV-annotated floor plan after takeoff */
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <img
                      src={annotatedImage}
                      alt="Annotated floor plan"
                      className="max-h-full max-w-full object-contain"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                    />
                  </div>
                ) : isPdf ? (
                  <PdfViewerClient
                    fileUrl={fileUrl}
                    pageNumber={pageNumber}
                    zoom={zoom}
                    onLoadNumPages={(n) => {
                      setNumPages(n);
                      setPageNumber((p) => Math.min(p, n));
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <img
                      src={fileUrl}
                      alt={project.name}
                      className="max-h-full max-w-full object-contain"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                    />
                  </div>
                )}

                {/* Takeoff analyzing overlay */}
                <TakeoffAnalyzingOverlay isOpen={generating} statusText={overlayStatus} />
              </div>
            </>
          )}
        </div>

        {/* Right — Takeoff Panel */}
        <aside className="w-[420px] shrink-0 border-l border-white/10 bg-[#0a0f1a] flex flex-col min-h-0 overflow-hidden">
          {/* Scale input */}
          <div className="px-4 pt-4 pb-2 shrink-0">
            <label className="text-xs text-gray-400 block mb-1.5">
              Scale (px/ft) — required for area & drywall
            </label>
            <input
              type="number"
              min={1}
              step={1}
              placeholder="e.g. 50"
              value={scalePxPerFt}
              onChange={(e) => setScalePxPerFt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          {/* Header row */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
            <span className="text-white font-semibold text-sm">AI Takeoff</span>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition shadow-lg shadow-indigo-500/20"
            >
              {generating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  
                  Generate Takeoff
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {takeoffError && (
            <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 shrink-0">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-xs">{takeoffError}</p>
              </div>
            </div>
          )}

          {/* Metric cards — 3 top, 3 bottom */}
          <div className="px-4 py-3 shrink-0 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Total Area</div>
                <div className="text-white font-bold text-xl leading-none">
                  {takeoff.totalArea > 0 ? takeoff.totalArea.toLocaleString() : '0'}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">sq ft</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Net Drywall</div>
                <div className="text-white font-bold text-xl leading-none">
                  {takeoff.netDrywall > 0 ? takeoff.netDrywall.toLocaleString() : '0'}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">sq ft</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Waste</div>
                <div className="text-white font-bold text-xl leading-none">
                  {takeoff.waste > 0 ? takeoff.waste : '0'}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">%</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Doors</div>
                <div className="text-white font-bold text-xl leading-none">
                  {takeoff.doors}
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Windows</div>
                <div className="text-white font-bold text-xl leading-none">
                  {takeoff.windows}
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Sheets</div>
                <div className="text-white font-bold text-xl leading-none">
                  {takeoff.netDrywall > 0 ? Math.ceil((takeoff.netDrywall * (1 + WASTE_FACTOR)) / SHEET_SQFT) : '0'}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">4x12</div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 mx-4 shrink-0" />

          {/* Summary section */}
          <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-4 overflow-hidden">
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3 shrink-0">Summary</div>
            {generated && takeoff.netDrywall > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
                {/* Overview card */}
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-semibold text-sm tracking-wide">TAKEOFF OVERVIEW</span>
                  </div>

                  {/* Key figures row */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-[10px] text-gray-500 mb-0.5">Net Drywall</div>
                      <div className="text-white font-bold text-lg">{takeoff.netDrywall.toLocaleString()}</div>
                      <div className="text-[10px] text-gray-500">sq ft</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 mb-0.5">Sheets (4x12)</div>
                      <div className="text-white font-bold text-lg">{Math.ceil((takeoff.netDrywall * (1 + WASTE_FACTOR)) / SHEET_SQFT)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 mb-0.5">Total Area</div>
                      <div className="text-white font-bold text-lg">{takeoff.totalArea > 0 ? takeoff.totalArea.toLocaleString() : '---'}</div>
                      <div className="text-[10px] text-gray-500">sq ft</div>
                    </div>
                  </div>

                  {/* Breakdown bars */}
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Exterior walls</span>
                        <span className="text-gray-300">{takeoff.netDrywall > 0 ? Math.round(takeoff.netDrywall * 0.45).toLocaleString() : '0'} sq ft</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: '45%' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Partition walls</span>
                        <span className="text-gray-300">{takeoff.netDrywall > 0 ? Math.round(takeoff.netDrywall * 0.55).toLocaleString() : '0'} sq ft</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: '55%' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Waste ({takeoff.waste}%)</span>
                        <span className="text-gray-300">{takeoff.netDrywall > 0 ? Math.round(takeoff.netDrywall * WASTE_FACTOR).toLocaleString() : '0'} sq ft</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500/60" style={{ width: '15%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : generating ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <Loader2 size={14} className="animate-spin" />
                  Analyzing plan...
                </div>
              </div>
            ) : generated ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-xs text-center px-4">
                  {takeoff.netDrywall === 0 ? (
                    scalePxPerFt.trim() ? (
                      <>
                        Scale was sent but drywall is 0. Check browser console and backend terminal for <code>scale_px_per_ft</code>, <code>total_length_px</code>, <code>walls</code>.
                      </>
                    ) : (
                      <>
                        Add <strong>Scale (px/ft)</strong> (e.g. <strong>50</strong> for 1/4&quot;=1&apos;) and click <strong>Generate Takeoff</strong> again.
                      </>
                    )
                  ) : (
                    'Analysis complete.'
                  )}
                </p>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-600 text-xs text-center px-4">
                  Click &quot;Generate Takeoff&quot; to extract rooms, walls, doors, windows, and get a material estimate.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
