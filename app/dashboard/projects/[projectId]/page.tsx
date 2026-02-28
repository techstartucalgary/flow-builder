'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ZoomIn,
  ZoomOut,
  PencilRuler,
  Ruler,
} from 'lucide-react';
import { getBackendUrl } from '@/lib/backendUrl';
import { parseTakeoff, EMPTY_TAKEOFF } from '@/lib/parseTakeoff';
import type { TakeoffData } from '@/lib/parseTakeoff';
import TakeoffAnalyzingOverlay from '@/components/TakeoffAnalyzingOverlay';
import PdfViewerClient from '@/components/pdf/PdfViewer';
import AnnotationEditorShell from '@/components/annotation/AnnotationEditorShell';
import AnnotationEditorBoundary from '@/components/annotation/AnnotationEditorBoundary';
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';

const BACKEND_URL = getBackendUrl();
const WASTE_FACTOR = 0.15;
const SHEET_SQFT = 48; // 4' x 12' sheet = 48 sq ft

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_mime: string;
  created_at: string;
};

function presetLabel(preset: string): string {
  switch (preset) {
    case 'openings_qa':
      return 'Openings QA';
    case 'tags_qa':
      return 'Tags QA';
    case 'walls_qa':
      return 'Walls QA';
    default:
      return 'Editor';
  }
}

function saveTone(status: 'saved' | 'unsaved' | 'syncing' | 'error'): 'good' | 'warn' | 'accent' | 'danger' {
  switch (status) {
    case 'saved':
      return 'good';
    case 'unsaved':
      return 'warn';
    case 'syncing':
      return 'accent';
    default:
      return 'danger';
  }
}

function saveLabel(status: 'saved' | 'unsaved' | 'syncing' | 'error'): string {
  switch (status) {
    case 'saved':
      return 'Saved';
    case 'unsaved':
      return 'Unsaved';
    case 'syncing':
      return 'Syncing';
    default:
      return 'Attention';
  }
}

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
  const editorDocument = useAnnotationEditorStore((s) => s.document);
  const editorSaveStatus = useAnnotationEditorStore((s) => s.saveStatus);
  const editorViewPreset = useAnnotationEditorStore((s) => s.viewPreset);

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
  const modeLabel = editorMode ? presetLabel(editorViewPreset) : 'Review';
  const scaleValue = scalePxPerFt.trim() ? Number(scalePxPerFt) : null;
  const hasScale = typeof scaleValue === 'number' && Number.isFinite(scaleValue) && scaleValue > 0;
  const sheets = takeoff.netDrywall > 0 ? Math.ceil((takeoff.netDrywall * (1 + WASTE_FACTOR)) / SHEET_SQFT) : 0;
  const wasteSqFt = takeoff.netDrywall > 0 ? Math.round(takeoff.netDrywall * WASTE_FACTOR) : 0;
  const openingDeductionEstimate = generated ? Math.max(0, Math.round((takeoff.doors * 21) + (takeoff.windows * 12))) : 0;
  const reviewWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!hasScale) {
      warnings.push('Scale missing. Area and drywall outputs should be treated as provisional.');
    }
    if (editorMode && editorSaveStatus !== 'saved') {
      warnings.push('Editor changes are not fully committed yet. Regenerate after saving if you want takeoff numbers to reflect geometry updates.');
    }
    if (takeoffError) {
      warnings.push(takeoffError);
    }
    if (generated && takeoff.netDrywall === 0 && hasScale) {
      warnings.push('Takeoff completed with zero drywall. Inspect geometry and backend debug counters before trusting the result.');
    }
    return warnings;
  }, [editorMode, editorSaveStatus, generated, hasScale, takeoff.netDrywall, takeoffError]);

  const readinessRows = useMemo(() => ([
    {
      label: 'Document',
      value: isPdf ? 'PDF drawing set' : 'Raster plan image',
      tone: 'accent' as const,
    },
    {
      label: 'Page',
      value: isPdf && numPages > 0 ? `${pageNumber} of ${numPages}` : `Page ${pageNumber}`,
      tone: 'accent' as const,
    },
    {
      label: 'Scale',
      value: hasScale ? `${scaleValue} px/ft` : 'Missing',
      tone: hasScale ? ('good' as const) : ('warn' as const),
    },
    {
      label: 'Geometry',
      value: editorDocument ? `Revision ${editorDocument.meta.revision}` : 'No annotation doc',
      tone: editorDocument ? ('good' as const) : ('warn' as const),
    },
  ]), [editorDocument, hasScale, isPdf, numPages, pageNumber, scaleValue]);

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
    <div className="absolute inset-0 overflow-hidden bg-[var(--ws-bg)] text-[var(--ws-text)]">
      <div className="flex h-full flex-col gap-3 px-3 py-3">
        <header className="ws-panel-elevated flex shrink-0 items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/projects')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ws-border)] bg-white/5 text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-[var(--ws-text)]"
              aria-label="Back to projects"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-white">{project.name}</h1>
                <span className="ws-chip" data-tone={saveTone(editorSaveStatus)}>
                  {saveLabel(editorSaveStatus)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ws-text-muted)]">
                <span className="ws-chip">{isPdf ? 'PDF plan' : 'Image plan'}</span>
                <span className="ws-chip">Sheet {pageNumber}</span>
                {editorDocument ? <span className="ws-chip">Revision {editorDocument.meta.revision}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 rounded-2xl border border-[var(--ws-border)] bg-white/5 px-3 py-2 md:flex">
              <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--ws-text-muted)]">Mode</span>
              <span className="ws-chip" data-tone={editorMode ? 'accent' : 'good'}>
                {modeLabel}
              </span>
            </div>

            {isPdf && numPages > 1 ? (
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--ws-border)] bg-white/5 px-2 py-1.5">
                <button
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                  disabled={pageNumber <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="min-w-[4.5rem] text-center text-xs text-[var(--ws-text-secondary)]">
                  {pageNumber} / {numPages}
                </span>
                <button
                  onClick={() => setPageNumber((p) => Math.min(numPages || p, p + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                  disabled={numPages > 0 && pageNumber >= numPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setEditorMode((v) => !v)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
                editorMode
                  ? 'border-cyan-400/60 bg-cyan-500/12 text-cyan-100'
                  : 'border-[var(--ws-border)] bg-white/5 text-[var(--ws-text-secondary)] hover:bg-white/10'
              }`}
              title="Toggle annotation editor"
            >
              <PencilRuler size={16} />
              {editorMode ? 'Editor On' : 'Editor Off'}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-3">
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="ws-panel-elevated flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ws-border)] px-4 py-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--ws-text-muted)]">Plan Workspace</div>
                  <div className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                    {editorMode
                      ? 'Inspect geometry, review issues, and adjust annotations before trusting takeoff output.'
                      : 'Review the source plan, zoom into details, and compare the drawing against generated results.'}
                  </div>
                </div>
                {!editorMode ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-[var(--ws-border)] bg-white/5 px-2 py-1.5 text-[var(--ws-text-secondary)]">
                    <button
                      onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white"
                      aria-label="Zoom out"
                    >
                      <ZoomOut size={16} />
                    </button>
                    <button
                      onClick={() => setZoom(1)}
                      className="min-w-[3.5rem] rounded-lg px-2 py-1 text-center text-xs transition hover:bg-white/10 hover:text-white"
                      aria-label="Reset zoom"
                      title="Reset to 100%"
                    >
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white"
                      aria-label="Zoom in"
                    >
                      <ZoomIn size={16} />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(39,212,255,0.09),_transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
                {editorMode ? (
                  <div className="h-full min-h-0 p-2">
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
                  <div className="relative h-full overflow-auto">
                    {annotatedImage && generated ? (
                      <div className="flex h-full w-full items-center justify-center p-4">
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
                      <div className="flex h-full w-full items-center justify-center p-4">
                        <img
                          src={fileUrl}
                          alt={project.name}
                          className="max-h-full max-w-full object-contain"
                          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                        />
                      </div>
                    )}
                    <TakeoffAnalyzingOverlay isOpen={generating} statusText={overlayStatus} />
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="flex w-[420px] shrink-0 flex-col gap-3 overflow-hidden">
            <section className="ws-panel-elevated shrink-0 px-4 py-4">
              <div className="ws-section-header">
                <span>Run / Inputs</span>
                <span className="ws-chip" data-tone={generating ? 'accent' : generated ? 'good' : 'warn'}>
                  {generating ? 'Analyzing' : generated ? 'Takeoff Ready' : 'Awaiting Run'}
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {readinessRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded-xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-2">
                    <span className="text-xs text-[var(--ws-text-muted)]">{row.label}</span>
                    <span className="ws-chip" data-tone={row.tone}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="mb-1.5 block text-xs text-[var(--ws-text-secondary)]">
                  Scale (px/ft)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Ruler size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-text-muted)]" />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="e.g. 50"
                      value={scalePxPerFt}
                      onChange={(e) => setScalePxPerFt(e.target.value)}
                      className="w-full rounded-xl border border-[var(--ws-border)] bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 transition hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60"
                  >
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    {generating ? 'Running' : 'Generate'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-[var(--ws-text-muted)]">
                  Run the current page through the CV pipeline, then review geometry and material output before trusting the estimate.
                </p>
              </div>
            </section>

            <section className="ws-panel flex-1 min-h-0 overflow-hidden px-4 py-4">
              <div className="ws-section-header">
                <span>Review Rail</span>
                <span className="ws-chip">{modeLabel}</span>
              </div>

              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                <div className="ws-section">
                  <div className="ws-section-header">
                    <span>Key Metrics</span>
                    <span className="text-xs text-[var(--ws-text-muted)]">Current page</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70">Net Drywall</div>
                      <div className="mt-2 text-3xl font-semibold text-white">
                        {takeoff.netDrywall > 0 ? takeoff.netDrywall.toLocaleString() : '0'}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Total Area</div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {takeoff.totalArea > 0 ? takeoff.totalArea.toLocaleString() : '0'}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Openings</div>
                      <div className="mt-2 flex items-end gap-3">
                        <div>
                          <div className="text-xl font-semibold text-white">{takeoff.doors}</div>
                          <div className="text-[11px] text-[var(--ws-text-muted)]">doors</div>
                        </div>
                        <div>
                          <div className="text-xl font-semibold text-white">{takeoff.windows}</div>
                          <div className="text-[11px] text-[var(--ws-text-muted)]">windows</div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Sheets / Waste</div>
                      <div className="mt-2 flex items-end gap-3">
                        <div>
                          <div className="text-xl font-semibold text-white">{sheets}</div>
                          <div className="text-[11px] text-[var(--ws-text-muted)]">4x12 sheets</div>
                        </div>
                        <div>
                          <div className="text-xl font-semibold text-white">{takeoff.waste || 0}%</div>
                          <div className="text-[11px] text-[var(--ws-text-muted)]">waste</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="ws-section">
                  <div className="ws-section-header">
                    <span>Trust / Warnings</span>
                    <span className="ws-chip" data-tone={reviewWarnings.length ? 'warn' : 'good'}>
                      {reviewWarnings.length ? `${reviewWarnings.length} review` : 'Clear'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {takeoffError ? (
                      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                        <div className="flex items-start gap-2">
                          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
                          <span>{takeoffError}</span>
                        </div>
                      </div>
                    ) : null}
                    {reviewWarnings.length ? reviewWarnings.map((warning) => (
                      <div key={warning} className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-3 text-sm text-amber-100">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                          <span>{warning}</span>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-3 text-sm text-emerald-100">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                          <span>The current page has scale, geometry, and persisted editor state aligned for review.</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="ws-section">
                  <div className="ws-section-header">
                    <span>Breakdown</span>
                    <span className="text-xs text-[var(--ws-text-muted)]">Audit-oriented</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--ws-text-secondary)]">Gross wall area basis</span>
                        <span className="font-medium text-white">{takeoff.netDrywall > 0 ? (takeoff.netDrywall + openingDeductionEstimate).toLocaleString() : '0'} sq ft</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--ws-text-muted)]">Net drywall plus estimated deductions from emitted openings on this page.</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--ws-text-secondary)]">Opening deductions</span>
                        <span className="font-medium text-white">{openingDeductionEstimate.toLocaleString()} sq ft</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--ws-text-muted)]">Derived from current door/window counts. Replace this with per-opening audit data once backend breakdowns land.</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--ws-text-secondary)]">Waste-adjusted total</span>
                        <span className="font-medium text-white">{takeoff.netDrywall > 0 ? (takeoff.netDrywall + wasteSqFt).toLocaleString() : '0'} sq ft</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--ws-text-muted)]">Net drywall plus configured waste allowance before sheet conversion.</p>
                    </div>
                  </div>
                </div>

                <div className="ws-section">
                  <div className="ws-section-header">
                    <span>Summary</span>
                    <span className="text-xs text-[var(--ws-text-muted)]">Why these numbers move</span>
                  </div>
                  {generating ? (
                    <div className="mt-3 rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-6 text-center text-sm text-[var(--ws-text-secondary)]">
                      <Loader2 size={16} className="mx-auto mb-2 animate-spin" />
                      {overlayStatus}
                    </div>
                  ) : generated ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                        <div className="text-sm font-medium text-white">How this was calculated</div>
                        <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                          The current estimate uses detected wall geometry on this page, subtracts emitted openings, applies the waste factor, and converts the result into 4x12 sheet counts.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                        <div className="text-sm font-medium text-white">What affects this result</div>
                        <ul className="mt-2 space-y-1 text-sm text-[var(--ws-text-secondary)]">
                          <li>Scale accuracy determines whether area and drywall values are trustworthy.</li>
                          <li>Door/window verification changes deduction totals and sheet counts.</li>
                          <li>Unsaved editor changes do not automatically recalculate takeoff output.</li>
                        </ul>
                      </div>
                      <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                        <div className="text-sm font-medium text-white">What needs review</div>
                        <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                          {takeoff.summary || 'Use the editor QA presets to inspect walls, openings, and unmatched tags before treating the estimate as final.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-[var(--ws-border-strong)] bg-white/[0.02] px-4 py-5">
                      <div className="text-sm font-medium text-white">Ready to analyze</div>
                      <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                        Generate takeoff to extract geometry, estimate drywall, and populate the review rail. Add a valid scale first if you want area and drywall numbers to be actionable.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
