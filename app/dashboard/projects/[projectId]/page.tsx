'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import {
  useProjectViewerWorkflow,
  type ProjectWorkflowReviewAction,
  type WorkflowBlocker,
  type WorkspaceMode,
} from '@/hooks/useProjectViewerWorkflow';
import { supabase } from '@/lib/supabase';
import {
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getBackendUrl } from '@/lib/backendUrl';
import { hasManualGeometryEdits } from '@/lib/annotationGeometryRefresh';
import {
  saveAnnotationDocumentWithConflictRetry,
  waitForAnnotationWritesToDrain,
} from '@/lib/annotationPersistence';
import { parseTakeoff, mapStructuredTakeoff, EMPTY_TAKEOFF } from '@/lib/parseTakeoff';
import type { TakeoffData } from '@/lib/parseTakeoff';
import TakeoffAnalyzingOverlay from '@/components/TakeoffAnalyzingOverlay';
import PdfViewerClient from '@/components/pdf/PdfViewer';
import AnnotationEditorShell from '@/components/annotation/AnnotationEditorShell';
import AnnotationEditorBoundary from '@/components/annotation/AnnotationEditorBoundary';
import ProjectViewerHeader from '@/components/project-viewer/ProjectViewerHeader';
import SheetRail from '@/components/project-viewer/SheetRail';
import WorkflowRail from '@/components/project-viewer/WorkflowRail';
import MeasurementsRail from '@/components/project-viewer/MeasurementsRail';
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';
import type { AnnotationElement, OpeningRelations, RoomRelations, WallRelations } from '@/types/annotation';
import { Document, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

const BACKEND_URL = getBackendUrl();
const DEFAULT_CEILING_HEIGHT_FT = '9';
const DEFAULT_WASTE_FACTOR = 0.15;
const DEFAULT_SHEET_WIDTH_FT = 4;
const DEFAULT_SHEET_LENGTH_FT = 12;

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_mime: string;
  created_at: string;
};

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

function geometrySourceLabel(source: TakeoffData['geometrySource']): string {
  switch (source) {
    case 'annotation_document':
      return 'Saved Geometry';
    default:
      return 'CV Geometry';
  }
}

function roomClosureLabel(status: TakeoffData['roomClosureStatus']): string {
  switch (status) {
    case 'closed':
      return 'Closed';
    case 'ambiguous':
      return 'Ambiguous';
    default:
      return 'Open';
  }
}

function sheetStatusLabel(status: PageWorkflowStatus | undefined): string {
  if (!status?.visited) return 'Unopened';
  if (status.generated && status.estimateReady) return 'Ready';
  if (status.generated) return 'Draft';
  if (!status.hasScale) return 'Needs scale';
  if (status.hasAnnotationDoc) return 'Editing';
  return 'Started';
}

function sheetStatusTone(status: PageWorkflowStatus | undefined): 'good' | 'warn' | 'accent' | 'danger' {
  if (!status?.visited) return 'accent';
  if (status.saveStatus === 'error') return 'danger';
  if (status.generated && status.estimateReady) return 'good';
  if (status.generated || !status.hasScale || status.saveStatus !== 'saved') return 'warn';
  return 'accent';
}

type TakeoffDeltaSummary = {
  floorArea: number;
  totalLinearFt: number;
  openingDeduction: number;
  netWallBoard: number;
  sheetsRequired: number;
};

type CachedPageTakeoff = {
  takeoff: TakeoffData;
  generated: boolean;
  annotatedImage: string | null;
  runComparisonMessage: string | null;
  runComparisonReason: string | null;
  metricDeltas: TakeoffDeltaSummary | null;
};

type PageWorkflowStatus = {
  visited: boolean;
  hasScale: boolean;
  hasAnnotationDoc: boolean;
  generated: boolean;
  estimateReady: boolean;
  saveStatus: 'saved' | 'unsaved' | 'syncing' | 'error';
};

function compareTakeoffRuns(previous: TakeoffData | null, next: TakeoffData): {
  message: string;
  reason: string | null;
  deltas: TakeoffDeltaSummary;
} {
  const deltas: TakeoffDeltaSummary = {
    floorArea: next.floorArea - (previous?.floorArea ?? 0),
    totalLinearFt: next.totalLinearFt - (previous?.totalLinearFt ?? 0),
    openingDeduction: next.openingDeduction - (previous?.openingDeduction ?? 0),
    netWallBoard: next.netWallBoard - (previous?.netWallBoard ?? 0),
    sheetsRequired: next.sheetsRequired - (previous?.sheetsRequired ?? 0),
  };

  if (!previous || !previous.geometryHash) {
    return {
      message: 'Geometry changed, metrics changed',
      reason: 'This is the first generated baseline for the current page.',
      deltas,
    };
  }

  if (previous.geometryHash === next.geometryHash) {
    return {
      message: 'No geometry change since last run',
      reason: null,
      deltas,
    };
  }

  const metricsChanged = (
    Math.abs(deltas.floorArea) >= 0.1
    || Math.abs(deltas.totalLinearFt) >= 0.1
    || Math.abs(deltas.openingDeduction) >= 0.1
    || Math.abs(deltas.netWallBoard) >= 0.1
    || deltas.sheetsRequired !== 0
  );

  if (metricsChanged) {
    return {
      message: 'Geometry changed, metrics changed',
      reason: null,
      deltas,
    };
  }

  let reason = 'Edit was absorbed by geometry normalization.';
  if (next.roomClosureStatus !== 'closed') {
    reason = 'Boundary still open or ambiguous, so floor area stayed provisional.';
  } else if (next.unmatchedOpeningCount > 0) {
    reason = 'Edit affected unmatched opening geometry that was excluded from deductions.';
  } else if (Math.abs(deltas.totalLinearFt) < 0.1) {
    reason = 'Wall moved without changing normalized wall length.';
  }

  return {
    message: 'Geometry changed, but not enough to materially affect current totals',
    reason,
    deltas,
  };
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('annotate');

  // Takeoff state
  const [generating, setGenerating] = useState(false);
  const [takeoff, setTakeoff] = useState<TakeoffData>(EMPTY_TAKEOFF);
  const [generated, setGenerated] = useState(false);
  const [takeoffError, setTakeoffError] = useState<string | null>(null);
  const [runComparisonMessage, setRunComparisonMessage] = useState<string | null>(null);
  const [runComparisonReason, setRunComparisonReason] = useState<string | null>(null);
  const [metricDeltas, setMetricDeltas] = useState<TakeoffDeltaSummary | null>(null);
  // CV pipeline annotated image (base64 PNG, displayed over PDF)
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null);
  // Optional scale (px/ft) for drywall calculation — e.g. 50 for 1/4"=1' at 200 DPI
  const [scalePxPerFt, setScalePxPerFt] = useState<string>('');
  const [ceilingHeightFt, setCeilingHeightFt] = useState<string>(DEFAULT_CEILING_HEIGHT_FT);
  const [referenceFloorAreaSqFt, setReferenceFloorAreaSqFt] = useState<string>('');
  const [pendingReviewAction, setPendingReviewAction] = useState<ProjectWorkflowReviewAction | null>(null);
  const [pageStatuses, setPageStatuses] = useState<Record<number, PageWorkflowStatus>>({});
  const takeoffCacheKey = useMemo(
    () => `flowbuildr:takeoff:${projectId}:page:${pageNumber}`,
    [pageNumber, projectId],
  );

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
  const editorSelection = useAnnotationEditorStore((s) => s.selection);
  const editorEntities = useAnnotationEditorStore((s) => s.entities);
  const editorSaveStatus = useAnnotationEditorStore((s) => s.saveStatus);
  const editorPendingOpsCount = useAnnotationEditorStore((s) => s.history.pendingOps.length);
  const editorViewPreset = useAnnotationEditorStore((s) => s.viewPreset);
  const markEditorRevision = useAnnotationEditorStore((s) => s.markRevision);
  const setEditorSaveStatus = useAnnotationEditorStore((s) => s.setSaveStatus);
  const setEditorBaseImageScale = useAnnotationEditorStore((s) => s.setBaseImageScale);
  const setEditorSelection = useAnnotationEditorStore((s) => s.setSelection);
  const setEditorViewPreset = useAnnotationEditorStore((s) => s.setViewPreset);
  const requestFocusOnElements = useAnnotationEditorStore((s) => s.requestFocusOnElements);
  const setEditorToolMode = useAnnotationEditorStore((s) => s.setToolMode);

  useEffect(() => {
    if (!user?.id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, projectId]);

  useEffect(() => {
    if (!editorDocument) return;
    const documentScale = editorDocument.baseImage.scalePxPerFt;
    const nextScale = typeof documentScale === 'number' && Number.isFinite(documentScale) && documentScale > 0
      ? String(documentScale)
      : '';
    if (scalePxPerFt !== nextScale) {
      setScalePxPerFt(nextScale);
    }
  }, [editorDocument, scalePxPerFt]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = window.sessionStorage.getItem(takeoffCacheKey);
    if (!raw) {
      setTakeoff(EMPTY_TAKEOFF);
      setGenerated(false);
      setAnnotatedImage(null);
      setTakeoffError(null);
      setRunComparisonMessage(null);
      setRunComparisonReason(null);
      setMetricDeltas(null);
      return;
    }

    try {
      const cached = JSON.parse(raw) as CachedPageTakeoff;
      setTakeoff(cached.takeoff ?? EMPTY_TAKEOFF);
      setGenerated(Boolean(cached.generated));
      setAnnotatedImage(cached.annotatedImage ?? null);
      setTakeoffError(null);
      setRunComparisonMessage(cached.runComparisonMessage ?? null);
      setRunComparisonReason(cached.runComparisonReason ?? null);
      setMetricDeltas(cached.metricDeltas ?? null);
    } catch {
      window.sessionStorage.removeItem(takeoffCacheKey);
      setTakeoff(EMPTY_TAKEOFF);
      setGenerated(false);
      setAnnotatedImage(null);
      setTakeoffError(null);
      setRunComparisonMessage(null);
      setRunComparisonReason(null);
      setMetricDeltas(null);
    }
  }, [takeoffCacheKey]);

  useEffect(() => {
    if (project?.file_mime !== 'application/pdf' || !fileUrl) return;
    if (!numPages || pageStatuses[pageNumber]?.visited) return;

    setPageStatuses((current) => ({
      ...current,
      [pageNumber]: {
        visited: true,
        hasScale: false,
        hasAnnotationDoc: false,
        generated: false,
        estimateReady: false,
        saveStatus: 'saved',
      },
    }));
  }, [fileUrl, numPages, pageNumber, pageStatuses, project?.file_mime]);

  useEffect(() => {
    if (workspaceMode !== 'annotate' || !editorDocument || !pendingReviewAction) return;

    const availableIds = pendingReviewAction.elementIds.filter((id) => editorDocument.elements.some((element) => element.id === id));
    setEditorViewPreset(pendingReviewAction.preset);
    setEditorSelection(availableIds);
    if (availableIds.length > 0) {
      requestFocusOnElements(availableIds);
    }
    setPendingReviewAction(null);
  }, [
    editorDocument,
    pendingReviewAction,
    requestFocusOnElements,
    setEditorSelection,
    setEditorViewPreset,
    workspaceMode,
  ]);

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
      let geometryRevision = 0;
      const body: Record<string, unknown> = {
        file_url: fileUrl,
        file_mime: project.file_mime,
        page_number: pageNumber,
        include_ceiling: true,
        waste_factor: DEFAULT_WASTE_FACTOR,
        sheet_width_ft: DEFAULT_SHEET_WIDTH_FT,
        sheet_length_ft: DEFAULT_SHEET_LENGTH_FT,
      };
      const scale = scalePxPerFt.trim() ? parseFloat(scalePxPerFt) : undefined;
      if (typeof scale === 'number' && !Number.isNaN(scale) && scale > 0) {
        body.scale_px_per_ft = scale;
      }
      const ceilingHeight = ceilingHeightFt.trim() ? parseFloat(ceilingHeightFt) : undefined;
      if (typeof ceilingHeight === 'number' && !Number.isNaN(ceilingHeight) && ceilingHeight > 0) {
        body.ceiling_height_ft = ceilingHeight;
      }
      const referenceFloorArea = referenceFloorAreaSqFt.trim() ? parseFloat(referenceFloorAreaSqFt) : undefined;
      if (typeof referenceFloorArea === 'number' && !Number.isNaN(referenceFloorArea) && referenceFloorArea > 0) {
        body.reference_floor_area_sqft = referenceFloorArea;
      }

      await waitForAnnotationWritesToDrain();

      const currentEditorState = useAnnotationEditorStore.getState();
      const currentEditorDocument = currentEditorState.document;
      const currentPendingOpsCount = currentEditorState.history.pendingOps.length;
      const currentEditorSaveStatus = currentEditorState.saveStatus;

      if (currentEditorDocument) {
        geometryRevision = currentEditorDocument.meta.revision;
        const useSavedGeometry = hasManualGeometryEdits(currentEditorDocument);

        if (currentEditorSaveStatus !== 'saved' || currentPendingOpsCount > 0) {
          setEditorSaveStatus('syncing');
          try {
            const saved = await saveAnnotationDocumentWithConflictRetry({
              projectId: project.id,
              pageNumber,
              document: currentEditorDocument,
              onConflictRevision: markEditorRevision,
            });
            geometryRevision = saved.latest_revision;
            markEditorRevision(saved.latest_revision);
            setEditorSaveStatus('saved');
          } catch {
            setEditorSaveStatus('error');
            throw new Error("Couldn't save editor changes before generate. Resolve the editor save issue and try again.");
          }
        }

        await waitForAnnotationWritesToDrain();

        if (useSavedGeometry) {
          body.project_id = project.id;
          body.use_saved_annotations = true;
          body.annotation_revision = geometryRevision;
        }
      }

      console.log('[takeoff] request:', { ...body, file_url: '(hidden)' });
      const res = await fetch(`${BACKEND_URL}/api/takeoff/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        if (res.status === 409 && body.use_saved_annotations) {
          throw new Error('The saved annotation revision changed before takeoff ran. Save again and regenerate.');
        }
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      console.log('[takeoff] response:', {
        floor_area_sqft: data.floor_area_sqft,
        floor_area_method: data.floor_area_method,
        sealed_endpoint_gap_count: data.area_debug?.sealed_endpoint_gap_count,
        room_closure_status: data.room_closure_status,
        net_wall_board_sqft: data.net_wall_board_sqft,
        sheets_required: data.sheets_required,
        scale,
        cv_walls: data.cv_walls,
      });
      const parsed: TakeoffData = mapStructuredTakeoff(data) ?? parseTakeoff(data.analysis || '');
      const comparison = compareTakeoffRuns(generated ? takeoff : null, parsed);

      setTakeoff(parsed);
      setGenerated(true);
      setRunComparisonMessage(comparison.message);
      setRunComparisonReason(comparison.reason);
      setMetricDeltas(comparison.deltas);

      // Store annotated image for overlay (no Supabase)
      const nextAnnotatedImage = data.annotated_image ? `data:image/png;base64,${data.annotated_image}` : null;
      setAnnotatedImage(nextAnnotatedImage);
      if (typeof window !== 'undefined') {
        const cached: CachedPageTakeoff = {
          takeoff: parsed,
          generated: true,
          annotatedImage: nextAnnotatedImage,
          runComparisonMessage: comparison.message,
          runComparisonReason: comparison.reason,
          metricDeltas: comparison.deltas,
        };
        window.sessionStorage.setItem(takeoffCacheKey, JSON.stringify(cached));
      }
    } catch (e: any) {
      setTakeoffError(e.message || 'Generation failed');
    } finally {
      stopStepper();
      setGenerating(false);
    }
  }

  const isPdf = useMemo(() => project?.file_mime === 'application/pdf', [project?.file_mime]);
  const editorMode = workspaceMode === 'annotate';
  const scaleValue = scalePxPerFt.trim() ? Number(scalePxPerFt) : null;
  const ceilingHeightValue = ceilingHeightFt.trim() ? Number(ceilingHeightFt) : null;
  const hasScale = typeof scaleValue === 'number' && Number.isFinite(scaleValue) && scaleValue > 0;
  const hasCeilingHeight = typeof ceilingHeightValue === 'number' && Number.isFinite(ceilingHeightValue) && ceilingHeightValue > 0;
  const hasReferenceFloorArea = takeoff.referenceFloorArea > 0;
  const takeoffSourceDisplay = generated
    ? geometrySourceLabel(takeoff.geometrySource)
    : editorDocument
      ? 'Saved Geometry'
      : 'CV Geometry';

  useEffect(() => {
    if (project?.file_mime !== 'application/pdf' || !numPages) return;

    setPageStatuses((current) => ({
      ...current,
      [pageNumber]: {
        visited: true,
        hasScale,
        hasAnnotationDoc: Boolean(editorDocument),
        generated,
        estimateReady: takeoff.estimateReady,
        saveStatus: editorSaveStatus,
      },
    }));
  }, [editorDocument, editorSaveStatus, generated, hasScale, numPages, pageNumber, project?.file_mime, takeoff.estimateReady]);
  const reviewWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!hasScale) {
      warnings.push('Scale missing. Floor area, wall lengths, and deductions are provisional.');
    }
    if (!hasCeilingHeight) {
      warnings.push('Ceiling height drives sheet count. Confirm before trusting material output.');
    }
    if (generated && takeoff.floorAreaMethod === 'legacy_convex_hull_fallback') {
      warnings.push('Floor area fell back to legacy geometry. Review outer wall closure before trusting this page.');
    }
    if (generated && hasReferenceFloorArea && takeoff.referenceAreaDeltaPct > 5) {
      warnings.push('Calculated floor area differs from the reference by more than 5%.');
    }
    if (generated && takeoff.takeoffConfidence === 'low') {
      warnings.push('Takeoff confidence is low. Review closure status, unmatched openings, and scale before trusting totals.');
    }
    if (generated && !takeoff.estimateReady) {
      warnings.push('This estimate is still in draft mode. Final sheet count is blocked until the remaining QA issues are resolved.');
    }
    if (generated && takeoff.unknownWallCount > 0) {
      warnings.push('Wall board is provisional because some walls are still unclassified. Unknown walls are currently counted as one-sided draft surfaces.');
    }
    if (generated && takeoff.roomClosureStatus !== 'closed') {
      warnings.push(`Room boundary is ${roomClosureLabel(takeoff.roomClosureStatus).toLowerCase()}. Floor area and ceiling board remain provisional until closure is stable.`);
    }
    if (generated && takeoff.unmatchedOpeningCount > 0) {
      warnings.push(`${takeoff.unmatchedOpeningCount} opening${takeoff.unmatchedOpeningCount === 1 ? '' : 's'} could not be hosted to a wall and were excluded from deductions.`);
    }
    if (generated) {
      takeoff.blockedReasons.forEach((reason) => warnings.push(reason));
    }
    if (editorDocument && editorSaveStatus !== 'saved') {
      warnings.push('Generate will save the current editor geometry before recalculating takeoff.');
    }
    if (takeoffError) {
      warnings.push(takeoffError);
    }
    if (generated && takeoff.estimateReady && takeoff.sheetsRequired === 0 && takeoff.netWallBoard > 0) {
      warnings.push('Material totals are inconsistent. Review scale, ceiling height, and detected openings.');
    }
    if (generated && editorDocument && takeoff.geometrySource === 'cv_pipeline') {
      warnings.push('Takeoff used the CV fallback instead of saved editor geometry for this run.');
    }
    return warnings;
  }, [
    editorDocument,
    editorSaveStatus,
    generated,
    hasCeilingHeight,
    hasReferenceFloorArea,
    hasScale,
    takeoff.geometrySource,
    takeoff.roomClosureStatus,
    takeoff.takeoffConfidence,
    takeoff.estimateReady,
    takeoff.blockedReasons,
    takeoff.floorAreaMethod,
    takeoff.estimateReady,
    takeoff.netWallBoard,
    takeoff.unknownWallCount,
    takeoff.unmatchedOpeningCount,
    takeoff.referenceAreaDeltaPct,
    takeoff.sheetsRequired,
    takeoffError,
  ]);

  const actionableReviewActions = useMemo<ProjectWorkflowReviewAction[]>(() => {
    if (!generated || !editorDocument) return [];

    const unknownWallIds = editorDocument.elements
      .filter((element) => {
        if (element.type !== 'wall') return false;
        const relations = element.relations as WallRelations | undefined;
        return (relations?.surfaceClass ?? 'unknown') === 'unknown';
      })
      .map((element) => element.id);

    const unhostedOpeningIds = editorDocument.elements
      .filter((element) => {
        if (element.type !== 'door' && element.type !== 'window') return false;
        const relations = element.relations as OpeningRelations | undefined;
        return !relations?.hostWallId;
      })
      .map((element) => element.id);

    const fallbackOpeningIds = editorDocument.elements
      .filter((element) => {
        if (element.type !== 'door' && element.type !== 'window') return false;
        const relations = element.relations as OpeningRelations | undefined;
        return relations?.source === 'tag_projected' || relations?.source === 'gap_verified_tag_classified';
      })
      .map((element) => element.id);

    const boundaryReviewIds = editorDocument.elements
      .filter((element) => element.type === 'wall' || element.type === 'room')
      .map((element) => element.id);

    const actions: ProjectWorkflowReviewAction[] = [];

    if (takeoff.roomClosureStatus !== 'closed' && boundaryReviewIds.length > 0) {
      actions.push({
        key: 'closure',
        label: 'Review boundary closure',
        description: `Focus ${boundaryReviewIds.length} wall and room elements tied to floor-area closure.`,
        preset: 'final',
        elementIds: boundaryReviewIds,
      });
    }

    if (takeoff.unknownWallCount > 0 && unknownWallIds.length > 0) {
      actions.push({
        key: 'walls',
        label: 'Classify unknown walls',
        description: `${unknownWallIds.length} wall${unknownWallIds.length === 1 ? '' : 's'} still need a perimeter or partition decision.`,
        preset: 'walls_qa',
        elementIds: unknownWallIds,
      });
    }

    if (takeoff.unmatchedOpeningCount > 0 && unhostedOpeningIds.length > 0) {
      actions.push({
        key: 'unhosted-openings',
        label: 'Host unmatched openings',
        description: `${unhostedOpeningIds.length} opening${unhostedOpeningIds.length === 1 ? '' : 's'} are missing a wall host.`,
        preset: 'openings_qa',
        elementIds: unhostedOpeningIds,
      });
    }

    if (takeoff.fallbackOpeningCount > 0 && fallbackOpeningIds.length > 0) {
      actions.push({
        key: 'fallback-openings',
        label: 'Review fallback openings',
        description: `${fallbackOpeningIds.length} opening${fallbackOpeningIds.length === 1 ? '' : 's'} came from fallback evidence and should be verified.`,
        preset: 'openings_qa',
        elementIds: fallbackOpeningIds,
      });
    }

    return actions;
  }, [editorDocument, generated, takeoff.fallbackOpeningCount, takeoff.roomClosureStatus, takeoff.unknownWallCount, takeoff.unmatchedOpeningCount]);

  const workflow = useProjectViewerWorkflow({
    workspaceMode,
    generating,
    generated,
    hasScale,
    hasCeilingHeight,
    editorDocumentExists: Boolean(editorDocument),
    editorPendingOpsCount,
    editorSaveStatus,
    takeoffError,
    scaleValue,
    ceilingHeightValue,
    takeoff,
    takeoffSourceDisplay,
    actionableReviewActions,
  });

  const handleReviewAction = useCallback((action: ProjectWorkflowReviewAction) => {
    if (editorMode && editorDocument) {
      setEditorViewPreset(action.preset);
      setEditorSelection(action.elementIds);
      requestFocusOnElements(action.elementIds);
      return;
    }

    setPendingReviewAction(action);
    setWorkspaceMode('annotate');
  }, [editorDocument, editorMode, requestFocusOnElements, setEditorSelection, setEditorViewPreset]);

  const focusMeasurementElements = useCallback((elementIds: string[]) => {
    if (!elementIds.length || !editorDocument) return;
    const focusedElements = elementIds
      .map((id) => editorDocument.elements.find((element) => element.id === id))
      .filter((element): element is AnnotationElement => Boolean(element));
    const first = focusedElements[0];
    if (!first) return;

    setWorkspaceMode('annotate');
    setEditorSelection(elementIds);
    if (first.type === 'wall') setEditorViewPreset('walls_qa');
    else if (first.type === 'door' || first.type === 'window') setEditorViewPreset('openings_qa');
    else setEditorViewPreset('final');
    requestFocusOnElements(elementIds, first.type === 'wall' ? 148 : 120);
  }, [editorDocument, requestFocusOnElements, setEditorSelection, setEditorViewPreset]);

  const selectionSummary = useMemo(() => {
    const selected = editorSelection
      .map((id) => editorEntities.byId[id])
      .filter((element): element is AnnotationElement => Boolean(element));
    if (!selected.length) {
      return {
        label: 'Nothing selected',
        count: 0,
        details: [
          'Select a wall, opening, or room on the plan.',
          editorDocument ? `${editorDocument.elements.length} total elements on this sheet.` : 'Annotation document is loading.',
        ],
      };
    }

    if (selected.length > 1) {
      const counts = selected.reduce<Record<string, number>>((acc, element) => {
        acc[element.type] = (acc[element.type] ?? 0) + 1;
        return acc;
      }, {});
      return {
        label: `${selected.length} elements selected`,
        count: selected.length,
        details: Object.entries(counts).map(([type, count]) => `${count} ${type}${count === 1 ? '' : 's'}`),
      };
    }

    const element = selected[0];
    const details: string[] = [`Type: ${element.type}`];
    if (element.attrs.name) details.push(`Name: ${element.attrs.name}`);
    if (element.type === 'wall') {
      const relations = element.relations as WallRelations | undefined;
      details.push(`Surface: ${relations?.surfaceClass ?? 'unknown'}`);
      details.push(`Board sides: ${relations?.boardSides ?? 2}`);
    } else if (element.type === 'door' || element.type === 'window') {
      const relations = element.relations as OpeningRelations | undefined;
      details.push(`Host wall: ${relations?.hostWallId ? 'Assigned' : 'Missing'}`);
      if (typeof relations?.confidence === 'number') details.push(`Confidence: ${Math.round(relations.confidence * 100)}%`);
    } else if (element.type === 'room') {
      const relations = element.relations as RoomRelations | undefined;
      if (typeof relations?.areaSqFt === 'number') details.push(`Area: ${relations.areaSqFt.toLocaleString()} sq ft`);
      if (relations?.material) details.push(`Material: ${relations.material}`);
    }

    return {
      label: element.attrs.name || `${element.type[0].toUpperCase()}${element.type.slice(1)} selected`,
      count: 1,
      details,
    };
  }, [editorDocument, editorEntities.byId, editorSelection]);

  const openScaleCalibration = useCallback(() => {
    setWorkspaceMode('annotate');
    setEditorToolMode('calibrate');
  }, [setEditorToolMode]);

  const handlePrimaryAction = () => {
    if (workflow.primaryAction.actionType === 'annotate') {
      setWorkspaceMode('annotate');
      return;
    }
    void handleGenerate();
  };

  const handleWorkflowBlocker = useCallback((blocker: WorkflowBlocker) => {
    if (blocker.actionType === 'scale') {
      openScaleCalibration();
      return;
    }
    if (blocker.actionType === 'ceiling' || blocker.actionType === 'annotate' || blocker.actionType === 'save') {
      setWorkspaceMode('annotate');
      return;
    }
    if (blocker.actionType === 'review' && blocker.actionKey) {
      const reviewAction = actionableReviewActions.find((action) => action.key === blocker.actionKey);
      if (reviewAction) {
        handleReviewAction(reviewAction);
        return;
      }
    }
    setWorkspaceMode('annotate');
  }, [actionableReviewActions, handleReviewAction, openScaleCalibration]);

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
        {isPdf ? (
          <div className="hidden">
            <Document
              file={fileUrl}
              onLoadSuccess={(info) => {
                setNumPages(info.numPages);
                setPageNumber((current) => Math.min(current, info.numPages));
              }}
              loading={null}
            />
          </div>
        ) : null}
        <ProjectViewerHeader
          projectName={project.name}
          saveLabel={saveLabel(editorSaveStatus)}
          saveTone={saveTone(editorSaveStatus)}
          blockerCount={workflow.blockerCount}
          workspaceMode={workspaceMode}
          canReview={generated}
          onWorkspaceModeChange={setWorkspaceMode}
          onBack={() => router.push('/dashboard/projects')}
        />

        <div className="project-viewer-grid min-h-0 flex-1">
          <MeasurementsRail
            document={editorDocument}
            pageNumber={pageNumber}
            onFocusElements={focusMeasurementElements}
          />

          <section className="project-viewer-center min-w-0">
            <SheetRail
              numPages={isPdf ? numPages : 1}
              pageNumber={pageNumber}
              pageStatuses={pageStatuses}
              fileUrl={fileUrl}
              isPdf={isPdf}
              onSelectPage={setPageNumber}
              onPreviousPage={() => setPageNumber((current) => Math.max(1, current - 1))}
              onNextPage={() => setPageNumber((current) => Math.min(numPages || current, current + 1))}
              sheetStatusTone={sheetStatusTone}
              sheetStatusLabel={sheetStatusLabel}
            />

            <div className="project-plan-panel ws-panel-flat min-h-0 overflow-hidden">
              <div className="relative min-h-0 flex-1 overflow-hidden">
                {editorMode ? (
                  <div className="h-full min-h-0">
                    <AnnotationEditorBoundary
                      key={`${project.id}:${pageNumber}`}
                      onDisableEditor={() => setWorkspaceMode('review')}
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
                  <div className="relative h-full overflow-auto p-3">
                    <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-2xl border border-[var(--ws-border)] bg-slate-950/80 px-2 py-1.5 text-[var(--ws-text-secondary)] shadow-lg backdrop-blur-xl">
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
                    {annotatedImage && generated ? (
                      <div className="flex h-full w-full items-center justify-center bg-black/10 p-4">
                        <img
                          src={annotatedImage}
                          alt="Annotated floor plan"
                          className="max-h-full max-w-full object-contain"
                          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                        />
                      </div>
                    ) : isPdf ? (
                      <div className="flex h-full w-full items-center justify-center">
                        <PdfViewerClient
                          fileUrl={fileUrl}
                          pageNumber={pageNumber}
                          zoom={zoom}
                          onLoadNumPages={(n) => {
                            setNumPages(n);
                            setPageNumber((p) => Math.min(p, n));
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-black/10 p-4">
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

          <WorkflowRail
            mode={workspaceMode}
            workflow={workflow}
            generating={generating}
            generated={generated}
            overlayStatus={overlayStatus}
            takeoff={takeoff}
            takeoffSourceDisplay={takeoffSourceDisplay}
            scalePxPerFt={scalePxPerFt}
            ceilingHeightFt={ceilingHeightFt}
            referenceFloorAreaSqFt={referenceFloorAreaSqFt}
            runComparisonMessage={runComparisonMessage}
            runComparisonReason={runComparisonReason}
            metricDeltas={metricDeltas}
            takeoffError={takeoffError}
            reviewWarnings={reviewWarnings}
            reviewActions={actionableReviewActions}
            selectionSummary={selectionSummary}
            onSetScalePxPerFt={(value) => {
              setScalePxPerFt(value);
              if (!editorDocument) return;
              const parsed = value.trim() ? Number(value) : undefined;
              if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0) {
                setEditorBaseImageScale(parsed, 'manual', true);
              } else {
                setEditorBaseImageScale(undefined, undefined, false);
              }
            }}
            onSetCeilingHeightFt={setCeilingHeightFt}
            onSetReferenceFloorAreaSqFt={setReferenceFloorAreaSqFt}
            onOpenScaleCalibration={openScaleCalibration}
            onPrimaryAction={handlePrimaryAction}
            onBlockerAction={handleWorkflowBlocker}
            onReviewAction={handleReviewAction}
          />
        </div>
      </div>
    </div>
  );
}
