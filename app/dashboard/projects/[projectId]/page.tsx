'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';
import type { EditorViewPreset, OpeningRelations, WallRelations } from '@/types/annotation';

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

function floorAreaMethodLabel(method: TakeoffData['floorAreaMethod']): string {
  switch (method) {
    case 'enclosed_regions':
      return 'Enclosed regions';
    case 'legacy_convex_hull_fallback':
      return 'Legacy convex hull fallback';
    case 'missing_scale':
      return 'Missing scale';
    default:
      return 'Failed';
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

function formatSqFt(value: number): string {
  return value > 0 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

function formatDelta(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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

function confidenceTone(confidence: TakeoffData['takeoffConfidence']): 'good' | 'warn' | 'danger' {
  switch (confidence) {
    case 'high':
      return 'good';
    case 'medium':
      return 'warn';
    default:
      return 'danger';
  }
}

type TakeoffDeltaSummary = {
  floorArea: number;
  totalLinearFt: number;
  openingDeduction: number;
  netWallBoard: number;
  sheetsRequired: number;
};

type ReviewAction = {
  key: string;
  label: string;
  description: string;
  preset: EditorViewPreset;
  elementIds: string[];
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
  const [editorMode, setEditorMode] = useState(true);
  const [inputsCollapsed, setInputsCollapsed] = useState(false);

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
  const [pendingReviewAction, setPendingReviewAction] = useState<ReviewAction | null>(null);

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
    setTakeoff(EMPTY_TAKEOFF);
    setGenerated(false);
    setAnnotatedImage(null);
    setTakeoffError(null);
    setRunComparisonMessage(null);
    setRunComparisonReason(null);
    setMetricDeltas(null);
  }, [pageNumber, projectId]);

  useEffect(() => {
    if (!editorMode || !editorDocument || !pendingReviewAction) return;

    const availableIds = pendingReviewAction.elementIds.filter((id) => editorDocument.elements.some((element) => element.id === id));
    setEditorViewPreset(pendingReviewAction.preset);
    setEditorSelection(availableIds);
    if (availableIds.length > 0) {
      requestFocusOnElements(availableIds);
    }
    setPendingReviewAction(null);
  }, [
    editorDocument,
    editorMode,
    pendingReviewAction,
    requestFocusOnElements,
    setEditorSelection,
    setEditorViewPreset,
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

        body.project_id = project.id;
        body.use_saved_annotations = true;
        body.annotation_revision = geometryRevision;
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
        net_wall_board_sqft: data.net_wall_board_sqft,
        sheets_required: data.sheets_required,
        scale,
        cv_walls: data.cv_walls,
      });
      const parsed: TakeoffData = mapStructuredTakeoff(data) ?? parseTakeoff(data.analysis || '');
      const comparison = compareTakeoffRuns(generated ? takeoff : null, parsed);

      setTakeoff(parsed);
      setGenerated(true);
      setInputsCollapsed(true);
      setRunComparisonMessage(comparison.message);
      setRunComparisonReason(comparison.reason);
      setMetricDeltas(comparison.deltas);

      // Store annotated image for overlay (no Supabase)
      setAnnotatedImage(data.annotated_image ? `data:image/png;base64,${data.annotated_image}` : null);
    } catch (e: any) {
      setTakeoffError(e.message || 'Generation failed');
    } finally {
      stopStepper();
      setGenerating(false);
    }
  }

  const isPdf = useMemo(() => project?.file_mime === 'application/pdf', [project?.file_mime]);
  const modeLabel = editorMode ? presetLabel(editorViewPreset) : 'Review';
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

  const actionableReviewActions = useMemo<ReviewAction[]>(() => {
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

    const actions: ReviewAction[] = [];

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

  const handleReviewAction = useCallback((action: ReviewAction) => {
    if (editorMode && editorDocument) {
      setEditorViewPreset(action.preset);
      setEditorSelection(action.elementIds);
      requestFocusOnElements(action.elementIds);
      return;
    }

    setPendingReviewAction(action);
    setEditorMode(true);
  }, [editorDocument, editorMode, requestFocusOnElements, setEditorSelection, setEditorViewPreset]);

  const openScaleCalibration = useCallback(() => {
    setEditorMode(true);
    setEditorToolMode('calibrate');
  }, [setEditorToolMode]);

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
      label: 'Ceiling',
      value: hasCeilingHeight ? `${ceilingHeightValue} ft` : 'Missing',
      tone: hasCeilingHeight ? ('good' as const) : ('warn' as const),
    },
    {
      label: 'Geometry',
      value: editorDocument ? `Revision ${editorDocument.meta.revision}` : 'No annotation doc',
      tone: editorDocument ? ('good' as const) : ('warn' as const),
    },
    {
      label: 'Takeoff Source',
      value: takeoffSourceDisplay,
      tone: generated && takeoff.geometrySource === 'annotation_document'
        ? ('good' as const)
        : ('accent' as const),
    },
    {
      label: 'Confidence',
      value: generated ? takeoff.takeoffConfidence : 'Pending',
      tone: generated ? confidenceTone(takeoff.takeoffConfidence) : ('accent' as const),
    },
    {
      label: 'Estimate',
      value: generated ? (takeoff.estimateReady ? 'Ready' : 'Draft') : 'Pending',
      tone: generated ? (takeoff.estimateReady ? ('good' as const) : ('warn' as const)) : ('accent' as const),
    },
  ]), [
    ceilingHeightValue,
    editorDocument,
    generated,
    hasCeilingHeight,
    hasScale,
    isPdf,
    numPages,
    pageNumber,
    scaleValue,
    takeoff.takeoffConfidence,
    takeoff.geometrySource,
    takeoff.estimateReady,
    takeoffSourceDisplay,
  ]);
  const compactReadinessRows = useMemo(() => ([
    {
      label: 'Page',
      value: isPdf && numPages > 0 ? `${pageNumber} of ${numPages}` : `Page ${pageNumber}`,
    },
    {
      label: 'Scale',
      value: hasScale ? `${scaleValue} px/ft` : 'Missing',
    },
    {
      label: 'Ceiling',
      value: hasCeilingHeight ? `${ceilingHeightValue} ft` : 'Missing',
    },
    {
      label: 'Source',
      value: takeoffSourceDisplay,
    },
    {
      label: 'Status',
      value: generating ? 'Analyzing' : generated ? (takeoff.estimateReady ? 'Ready' : 'Draft') : 'Awaiting Run',
    },
  ]), [ceilingHeightValue, generated, generating, hasCeilingHeight, hasScale, isPdf, numPages, pageNumber, scaleValue, takeoff.estimateReady, takeoffSourceDisplay]);

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

          <aside className="flex min-h-0 w-[clamp(28rem,34vw,36rem)] shrink-0 flex-col gap-3 overflow-hidden">
            <section className="ws-panel-elevated shrink-0 overflow-hidden px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="ws-section-header">
                  <span>Run / Inputs</span>
                  <span className="ws-chip ml-2" data-tone={generating ? 'accent' : generated ? 'good' : 'warn'}>
                    {generating ? 'Analyzing' : generated ? 'Takeoff Ready' : 'Awaiting Run'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInputsCollapsed((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ws-border)] bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-white"
                  aria-expanded={!inputsCollapsed}
                  aria-label={inputsCollapsed ? 'Expand run inputs' : 'Collapse run inputs'}
                >
                  <span>{inputsCollapsed ? 'Inputs' : 'Collapse'}</span>
                  {inputsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>

              {inputsCollapsed ? (
                <div className="mt-3">
                  <div className="review-inputs-summary">
                    {compactReadinessRows.map((row) => (
                      <div key={row.label} className="review-inputs-summary-item rounded-xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-2.5">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">{row.label}</div>
                        <div className="mt-1 text-sm font-medium text-white">{row.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 transition hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60"
                    >
                      {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                      {generating ? 'Running' : 'Generate'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="grid gap-2.5">
                    {readinessRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-2">
                        <span className="text-xs text-[var(--ws-text-muted)]">{row.label}</span>
                        <span className="ws-chip" data-tone={row.tone}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <div className="grid gap-3">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <label htmlFor="scale-px-per-ft" className="block text-xs text-[var(--ws-text-secondary)]">
                            Scale (px/ft)
                          </label>
                          <button
                            type="button"
                            onClick={openScaleCalibration}
                            className="text-[11px] font-medium text-cyan-200 transition hover:text-white"
                          >
                            Calibrate on plan
                          </button>
                        </div>
                        <div className="relative">
                          <Ruler size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-text-muted)]" />
                          <input
                            id="scale-px-per-ft"
                            type="number"
                            min={1}
                            step={1}
                            placeholder="e.g. 50"
                            value={scalePxPerFt}
                            onChange={(e) => {
                              const value = e.target.value;
                              setScalePxPerFt(value);
                              if (!editorDocument) return;
                              const parsed = value.trim() ? Number(value) : undefined;
                              if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0) {
                                setEditorBaseImageScale(parsed, 'manual', true);
                              } else {
                                setEditorBaseImageScale(undefined, undefined, false);
                              }
                            }}
                            className="w-full rounded-xl border border-[var(--ws-border)] bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] text-[var(--ws-text-muted)]">
                          Manual edits sync with the editor. Use calibration to measure from plan geometry instead of guessing a scale.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="ceiling-height-ft" className="mb-1.5 block text-xs text-[var(--ws-text-secondary)]">
                            Ceiling Height (ft)
                          </label>
                          <input
                            id="ceiling-height-ft"
                            type="number"
                            min={1}
                            step={0.5}
                            placeholder="e.g. 9"
                            value={ceilingHeightFt}
                            onChange={(e) => setCeilingHeightFt(e.target.value)}
                            className="w-full rounded-xl border border-[var(--ws-border)] bg-white/5 px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                          />
                        </div>
                        <div>
                          <label htmlFor="reference-floor-area" className="mb-1.5 block text-xs text-[var(--ws-text-secondary)]">
                            Reference Floor Area
                          </label>
                          <input
                            id="reference-floor-area"
                            type="number"
                            min={1}
                            step={1}
                            placeholder="Optional"
                            value={referenceFloorAreaSqFt}
                            onChange={(e) => setReferenceFloorAreaSqFt(e.target.value)}
                            className="w-full rounded-xl border border-[var(--ws-border)] bg-white/5 px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
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
                      Run the current page through the CV pipeline and review the board breakdown before trusting the estimate.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="ws-panel flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between px-4 py-4">
                <div className="ws-section-header">
                  <span>Review Rail</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="ws-chip">{modeLabel}</span>
                  <span className="ws-chip" data-tone={generated && takeoff.geometrySource === 'annotation_document' ? 'good' : 'accent'}>
                    {takeoffSourceDisplay}
                  </span>
                  {generated ? (
                    <span className="ws-chip" data-tone={takeoff.estimateReady ? 'good' : 'warn'}>
                      {takeoff.estimateReady ? 'Ready' : 'Draft'}
                    </span>
                  ) : null}
                  {generated ? (
                    <span className="ws-chip" data-tone={confidenceTone(takeoff.takeoffConfidence)}>
                      {takeoff.takeoffConfidence}
                    </span>
                  ) : null}
                  {generated && takeoff.geometrySource === 'annotation_document' && takeoff.geometryRevisionUsed > 0 ? (
                    <span className="ws-chip">Rev {takeoff.geometryRevisionUsed}</span>
                  ) : null}
                </div>
              </div>

              <div className="review-rail-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pr-3">
                <div className="ws-section shrink-0">
                  <div className="p-4">
                    <div className="ws-section-header">
                      <span>Key Metrics</span>
                      <span className="text-xs text-[var(--ws-text-muted)]">
                        {generated && takeoff.geometrySource === 'annotation_document' && takeoff.geometryRevisionUsed > 0
                          ? `Saved geometry · Rev ${takeoff.geometryRevisionUsed}`
                          : 'Current page'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-4">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70">Floor Area</div>
                        <div className="mt-2 text-3xl font-semibold text-white">
                          {formatSqFt(takeoff.floorArea)}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                      </div>
                      <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Net Wall Board</div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          {formatSqFt(takeoff.netWallBoard)}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                      </div>
                      <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Ceiling Board</div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          {formatSqFt(takeoff.ceilingBoard)}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                      </div>
                      <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Sheets / Waste</div>
                        <div className="mt-2 flex items-end gap-3">
                          <div>
                            <div className="text-xl font-semibold text-white">{takeoff.sheetsRequired}</div>
                            <div className="text-[11px] text-[var(--ws-text-muted)]">
                              {takeoff.estimateReady ? `${takeoff.sheetSizeSqFt.toLocaleString()} sq ft sheets` : 'blocked until ready'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xl font-semibold text-white">{takeoff.waste || 0}%</div>
                            <div className="text-[11px] text-[var(--ws-text-muted)]">waste</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {generated ? (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Closure</div>
                          <div className="mt-2 text-xl font-semibold text-white">{roomClosureLabel(takeoff.roomClosureStatus)}</div>
                          <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                            {takeoff.unclosedGapCount} gap{takeoff.unclosedGapCount === 1 ? '' : 's'} · {takeoff.largestBoundaryGapFt.toFixed(2)} ft max
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">QA Status</div>
                          <div className="mt-2 text-xl font-semibold text-white">
                            {takeoff.unknownWallCount} / {takeoff.fallbackOpeningCount}
                          </div>
                          <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                            unknown walls / fallback openings · {takeoff.unmatchedOpeningCount} unmatched
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Openings</div>
                      <div className="mt-2 flex items-end gap-4">
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
                  </div>
                </div>

                <div className="ws-section shrink-0">
                  <div className="p-4">
                    <div className="ws-section-header">
                      <span>Trust / Warnings</span>
                      <span className="ws-chip" data-tone={reviewWarnings.length ? 'warn' : 'good'}>
                        {reviewWarnings.length ? `${reviewWarnings.length} review` : 'Clear'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {actionableReviewActions.length ? (
                        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-white">Fix-now actions</div>
                              <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                                Jump straight into the relevant QA view with the impacted geometry selected.
                              </div>
                            </div>
                            <span className="ws-chip" data-tone="accent">{actionableReviewActions.length} queued</span>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {actionableReviewActions.map((action) => (
                              <button
                                key={action.key}
                                type="button"
                                onClick={() => handleReviewAction(action)}
                                className="flex items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-black/10 px-3 py-2.5 text-left transition hover:border-cyan-300/40 hover:bg-cyan-500/[0.08]"
                              >
                                <div>
                                  <div className="text-sm font-medium text-white">{action.label}</div>
                                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{action.description}</div>
                                </div>
                                <span className="ws-chip" data-tone="accent">{presetLabel(action.preset)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
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
                </div>

                <div className="ws-section shrink-0">
                  <div className="p-4">
                    <div className="ws-section-header">
                      <span>Breakdown</span>
                      <span className="text-xs text-[var(--ws-text-muted)]">Audit-oriented</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {[
                        ['Geometry source', takeoffSourceDisplay],
                        ['Geometry revision', generated && takeoff.geometryRevisionUsed > 0 ? `${takeoff.geometryRevisionUsed}` : 'Not pinned'],
                        ['Geometry change', runComparisonMessage || 'Awaiting comparison'],
                        ['Estimate readiness', generated ? (takeoff.estimateReady ? 'Ready' : 'Draft') : 'Pending'],
                        ['Blocked reasons', takeoff.blockedReasons.length ? takeoff.blockedReasons.join(' · ') : 'None'],
                        ['Takeoff confidence', generated ? takeoff.takeoffConfidence : 'Pending'],
                        ['Surface classification', generated ? takeoff.surfaceClassificationConfidence : 'Pending'],
                        ['Room closure', roomClosureLabel(takeoff.roomClosureStatus)],
                        ['Boundary gaps', `${takeoff.unclosedGapCount} (${takeoff.largestBoundaryGapFt.toFixed(2)} ft max)`],
                        ['Perimeter / partition / unknown walls', `${formatSqFt(takeoff.perimeterLinearFt)} / ${formatSqFt(takeoff.partitionLinearFt)} / ${formatSqFt(takeoff.unknownLinearFt)} ft`],
                        ['Perimeter / partition / unknown board', `${formatSqFt(takeoff.perimeterBoardSqFt)} / ${formatSqFt(takeoff.partitionBoardSqFt)} / ${formatSqFt(takeoff.unknownBoardSqFt)} sq ft`],
                        ['Unknown walls', `${takeoff.unknownWallCount}`],
                        ['Unknown wall treatment', takeoff.unknownWallCount > 0 ? 'Provisional 1-side draft' : 'Not used'],
                        ['Unmatched openings', `${takeoff.unmatchedOpeningCount}`],
                        ['Matched openings', `${takeoff.matchedOpeningCount}`],
                        ['Fallback openings', `${takeoff.fallbackOpeningCount}`],
                        ['Opening deduction mode', takeoff.openingDeductionMode],
                        ['Floor area', `${formatSqFt(takeoff.floorArea)} sq ft`],
                        ['Floor area method', floorAreaMethodLabel(takeoff.floorAreaMethod)],
                        ['Reference area', hasReferenceFloorArea ? `${formatSqFt(takeoff.referenceFloorArea)} sq ft` : 'Not provided'],
                        ['Reference variance', hasReferenceFloorArea ? `${formatSqFt(Math.abs(takeoff.referenceAreaDeltaSqFt))} sq ft (${takeoff.referenceAreaDeltaPct.toFixed(2)}%)` : 'Not provided'],
                        ['Total linear feet', `${formatSqFt(takeoff.totalLinearFt)} ft`],
                        ['Gross wall board', `${formatSqFt(takeoff.grossWallBoard)} sq ft`],
                        ['Opening deductions', `${formatSqFt(takeoff.openingDeduction)} sq ft`],
                        ['Net wall board', `${formatSqFt(takeoff.netWallBoard)} sq ft`],
                        ['Ceiling board', `${formatSqFt(takeoff.ceilingBoard)} sq ft`],
                        ['Board before waste', `${formatSqFt(takeoff.netBoardArea)} sq ft`],
                        ['Waste', `${formatSqFt(takeoff.wasteSqFt)} sq ft (${takeoff.waste}%)`],
                        ['Area with waste', `${formatSqFt(takeoff.areaWithWaste)} sq ft`],
                        ['Sheets required', `${takeoff.sheetsRequired}`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-[var(--ws-text-secondary)]">{label}</span>
                            <span className="text-right font-medium text-white">{value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ws-section shrink-0">
                  <div className="p-4">
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
                          <div className="text-sm font-medium text-white">{runComparisonMessage || 'Current run diagnostics'}</div>
                          <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                            {runComparisonReason || 'This run used the latest pinned geometry revision for the current page.'}
                          </p>
                          {metricDeltas ? (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--ws-text-secondary)]">
                              <div>Floor area: {formatDelta(metricDeltas.floorArea)}</div>
                              <div>Linear feet: {formatDelta(metricDeltas.totalLinearFt)}</div>
                              <div>Opening deduction: {formatDelta(metricDeltas.openingDeduction)}</div>
                              <div>Net wall board: {formatDelta(metricDeltas.netWallBoard)}</div>
                              <div>Sheets: {metricDeltas.sheetsRequired >= 0 ? '+' : ''}{metricDeltas.sheetsRequired}</div>
                            </div>
                          ) : null}
                        </div>
                        <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                          <div className="text-sm font-medium text-white">How this was calculated</div>
                          <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                            {takeoff.geometrySource === 'annotation_document'
                              ? 'The current estimate uses the normalized saved annotation document, auto-classifies walls as perimeter or partition unless you override them, deducts only hosted openings, and only releases sheet count when closure, scale, and wall semantics are trustworthy.'
                              : 'The current estimate is running from CV seed geometry, then classifies wall surfaces, measures hosted openings, and keeps the result in draft mode until scale, closure, and wall semantics are stable enough for a final board count.'}
                            {!takeoff.estimateReady && takeoff.unknownWallCount > 0
                              ? ' Unknown walls are still included as provisional one-sided wall board in draft mode so the wall total stays usable while final totals remain blocked.'
                              : ''}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                          <div className="text-sm font-medium text-white">What affects this result</div>
                          <ul className="mt-2 space-y-1 text-sm text-[var(--ws-text-secondary)]">
                            <li>Scale accuracy controls floor area, wall lengths, and measured opening deductions.</li>
                            <li>Ceiling height directly changes gross wall board and final sheet count.</li>
                            <li>{takeoff.geometrySource === 'annotation_document' ? 'Saved wall and opening edits change the normalized geometry snapshot used by regenerate.' : 'Without saved editor geometry, the takeoff falls back to the original CV-derived layout.'}</li>
                          </ul>
                        </div>
                        <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
                          <div className="text-sm font-medium text-white">What needs review</div>
                          <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                            {takeoff.blockedReasons.length
                              ? `${takeoff.unknownWallCount > 0 ? 'Wall board is being shown as a provisional one-sided draft total for unknown walls. ' : ''}${takeoff.blockedReasons.join(' ')}`
                              : takeoff.summary || 'Use the walls QA preset to confirm perimeter vs partition assumptions before treating the estimate as final.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed border-[var(--ws-border-strong)] bg-white/[0.02] px-4 py-5">
                        <div className="text-sm font-medium text-white">Ready to analyze</div>
                        <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                          Generate takeoff to extract geometry, compute enclosed floor area, and populate the builder-style material breakdown. Add a valid scale and ceiling height first if you want the numbers to be actionable.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
