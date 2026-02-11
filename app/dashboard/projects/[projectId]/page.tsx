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
} from 'lucide-react';
import { parseTakeoff, EMPTY_TAKEOFF } from '@/lib/parseTakeoff';
import type { TakeoffData } from '@/lib/parseTakeoff';
import TakeoffAnalyzingOverlay from '@/components/TakeoffAnalyzingOverlay';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const WASTE_FACTOR = 0.15;
const SHEET_SQFT = 48; // 4' x 12' sheet = 48 sq ft

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
  const [zoom, setZoom] = useState(1);

  // Takeoff state
  const [generating, setGenerating] = useState(false);
  const [takeoff, setTakeoff] = useState<TakeoffData>(EMPTY_TAKEOFF);
  const [generated, setGenerated] = useState(false);
  const [takeoffError, setTakeoffError] = useState<string | null>(null);

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
      console.log('[handleGenerate] raw analysis length:', data.analysis?.length);
      console.log('[handleGenerate] raw analysis preview:', data.analysis?.substring(0, 500));
      const parsed = parseTakeoff(data.analysis || '');
      setTakeoff(parsed);
      setGenerated(true);
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

        {isPdf && numPages > 1 && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
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
          </div>
        )}
      </div>

      {/* 2-panel layout — takes all remaining height */}
      <div className="flex-1 min-h-0 flex">
        {/* Left — PDF with zoom bar */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
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

          {/* PDF / Image */}
          <div className="flex-1 min-h-0 overflow-auto relative">
            {isPdf ? (
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
        </div>

        {/* Right — Takeoff Panel */}
        <aside className="w-[420px] shrink-0 border-l border-white/10 bg-[#0a0f1a] flex flex-col min-h-0 overflow-hidden">
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
                  Analysis complete. Some metrics may not have been extracted. Check browser console for debug info.
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
