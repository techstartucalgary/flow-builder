'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fromCVTakeoffResult } from '@/lib/annotationAdapters';
import { getBackendUrl } from '@/lib/backendUrl';
import {
  fetchAnnotationStorePayload,
  postAnnotationRevisionsWithConflictRetry,
  saveAnnotationDocumentWithConflictRetry,
} from '@/lib/annotationPersistence';
import { sanitizeAnnotationDocument } from '@/lib/annotationSanitizer';
import EditorToolbar from '@/components/annotation/EditorToolbar';
import IssueHighlighter from '@/components/annotation/IssueHighlighter';
import LayerVisibilityPanel from '@/components/annotation/LayerVisibilityPanel';
import PropertyPanel from '@/components/annotation/PropertyPanel';
import RevisionStatusBar from '@/components/annotation/RevisionStatusBar';
import ViewportStage from '@/components/annotation/ViewportStage';
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';
import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationIssue,
  AnnotationRenderHints,
  CVTakeoffResultPayload,
  EditorTagOverlayState,
} from '@/types/annotation';

const BACKEND_URL = getBackendUrl();

function isLegacyTagMarkerOpenings(doc: AnnotationDocument): boolean {
  const openingElements = doc.elements.filter((e) => e.type === 'door' || e.type === 'window');
  if (!openingElements.length) return false;

  for (const opening of openingElements) {
    if (opening.attrs.status !== 'auto') return false;
    if (opening.geometry.kind !== 'rect') return false;
    if (opening.relations && typeof opening.relations === 'object' && 'hostWallId' in opening.relations) {
      return false;
    }
  }

  const smallCount = openingElements.filter((opening) => {
    if (opening.geometry.kind !== 'rect') return false;
    const maxSide = Math.max(opening.geometry.width, opening.geometry.height);
    const minSide = Math.min(opening.geometry.width, opening.geometry.height);
    return maxSide <= 96 && minSide <= 28;
  }).length;

  return smallCount / openingElements.length >= 0.7;
}

function shouldRefreshOpeningsFromCV(doc: AnnotationDocument): boolean {
  if (isLegacyTagMarkerOpenings(doc)) return true;

  const openingElements = doc.elements.filter((e) => e.type === 'door' || e.type === 'window');
  if (!openingElements.length) return false;

  const windowCount = openingElements.filter((e) => e.type === 'window').length;
  const autoCount = openingElements.filter((e) => e.attrs.status === 'auto').length;
  const opIdCount = openingElements.filter((e) => e.id.includes('_OP-')).length;

  // Previous migration pass could produce only auto door OP entries.
  return windowCount === 0 && autoCount === openingElements.length && opIdCount === openingElements.length;
}

function mergeOpeningsFromCV(
  existingDoc: AnnotationDocument,
  cvDoc: AnnotationDocument,
): AnnotationDocument {
  const cvOpenings = cvDoc.elements.filter((e) => e.type === 'door' || e.type === 'window');
  const nonOpenings = existingDoc.elements.filter((e) => e.type !== 'door' && e.type !== 'window');
  const mergedElements: AnnotationElement[] = [...nonOpenings, ...cvOpenings];
  const validIds = new Set(mergedElements.map((e) => e.id));
  const mergedIssues = existingDoc.issues.filter((issue) => validIds.has(issue.elementId));

  return {
    ...existingDoc,
    elements: mergedElements,
    issues: mergedIssues,
    meta: {
      ...existingDoc.meta,
      updatedAt: new Date().toISOString(),
    },
  };
}

function hasCoordinateMismatch(existingDoc: AnnotationDocument, cvDoc: AnnotationDocument): boolean {
  const existingId = existingDoc.meta.coordinateSpaceId;
  const cvId = cvDoc.meta.coordinateSpaceId;
  if (existingId && cvId) return existingId !== cvId;
  return (
    existingDoc.baseImage.widthPx !== cvDoc.baseImage.widthPx ||
    existingDoc.baseImage.heightPx !== cvDoc.baseImage.heightPx
  );
}

function presetForIssue(issue: AnnotationIssue, element: AnnotationElement | null): AnnotationRenderHints['preset'] {
  if (element?.type === 'door' || element?.type === 'window') return 'openings_qa';
  if (element?.type === 'wall') return 'walls_qa';
  if (issue.code.toLowerCase().includes('opening')) return 'openings_qa';
  if (issue.code.toLowerCase().includes('wall')) return 'walls_qa';
  return 'final';
}

interface CvDocumentSnapshot {
  document: AnnotationDocument;
  raw: CVTakeoffResultPayload;
}

async function fetchCvDocument(
  projectId: string,
  fileUrl: string,
  fileMime: string,
  pageNumber: number,
  scalePxPerFt: number | undefined,
): Promise<CvDocumentSnapshot> {
  const body: Record<string, unknown> = {
    file_url: fileUrl,
    file_mime: fileMime,
    page_number: pageNumber,
  };
  if (typeof scalePxPerFt === 'number' && scalePxPerFt > 0) {
    body.scale_px_per_ft = scalePxPerFt;
  }

  const cvRes = await fetch(`${BACKEND_URL}/api/cv-takeoff/analyze-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!cvRes.ok) {
    const err = await cvRes.json().catch(() => ({ detail: cvRes.statusText }));
    throw new Error(err.detail || `Failed to refresh openings from CV (${cvRes.status})`);
  }

  const cv = (await cvRes.json()) as CVTakeoffResultPayload;
  return {
    raw: cv,
    document: fromCVTakeoffResult(cv, {
      projectId,
      page: pageNumber,
      sourceUrl: fileUrl,
    }),
  };
}

interface AnnotationEditorShellProps {
  projectId: string;
  fileUrl: string;
  fileMime: string;
  pageNumber: number;
  scalePxPerFt?: number;
  actorId?: string;
}

interface CalibrationPoint {
  x: number;
  y: number;
}

interface CalibrationDraft {
  start: CalibrationPoint | null;
  end: CalibrationPoint | null;
  knownDistanceFt: string;
  error: string | null;
}

export default function AnnotationEditorShell({
  projectId,
  fileUrl,
  fileMime,
  pageNumber,
  scalePxPerFt,
  actorId,
}: AnnotationEditorShellProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showBaseImage, setShowBaseImage] = useState(true);
  const [tagOverlay, setTagOverlay] = useState<EditorTagOverlayState>({ showTags: false, tags: [] });
  const [pendingRebuild, setPendingRebuild] = useState<CvDocumentSnapshot | null>(null);
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({
    start: null,
    end: null,
    knownDistanceFt: '',
    error: null,
  });
  const scalePxPerFtRef = useRef(scalePxPerFt);

  const document = useAnnotationEditorStore((s) => s.document);
  const entities = useAnnotationEditorStore((s) => s.entities);
  const selection = useAnnotationEditorStore((s) => s.selection);
  const toolMode = useAnnotationEditorStore((s) => s.toolMode);
  const viewPreset = useAnnotationEditorStore((s) => s.viewPreset);
  const gridEnabled = useAnnotationEditorStore((s) => s.gridEnabled);
  const wallSnapEnabled = useAnnotationEditorStore((s) => s.wallSnapEnabled);
  const saveStatus = useAnnotationEditorStore((s) => s.saveStatus);

  const initializeDocument = useAnnotationEditorStore((s) => s.initializeDocument);
  const setToolMode = useAnnotationEditorStore((s) => s.setToolMode);
  const setViewPreset = useAnnotationEditorStore((s) => s.setViewPreset);
  const toggleLayer = useAnnotationEditorStore((s) => s.toggleLayer);
  const updateElement = useAnnotationEditorStore((s) => s.updateElement);
  const deleteSelected = useAnnotationEditorStore((s) => s.deleteSelected);
  const undo = useAnnotationEditorStore((s) => s.undo);
  const redo = useAnnotationEditorStore((s) => s.redo);
  const nudgeSelected = useAnnotationEditorStore((s) => s.nudgeSelected);
  const toggleGrid = useAnnotationEditorStore((s) => s.toggleGrid);
  const toggleWallSnap = useAnnotationEditorStore((s) => s.toggleWallSnap);
  const setSelection = useAnnotationEditorStore((s) => s.setSelection);
  const markRevision = useAnnotationEditorStore((s) => s.markRevision);
  const flushPendingOps = useAnnotationEditorStore((s) => s.flushPendingOps);
  const restorePendingOps = useAnnotationEditorStore((s) => s.restorePendingOps);
  const setSaveStatus = useAnnotationEditorStore((s) => s.setSaveStatus);
  const requestFocusOnElements = useAnnotationEditorStore((s) => s.requestFocusOnElements);
  const setBaseImageScale = useAnnotationEditorStore((s) => s.setBaseImageScale);

  useEffect(() => {
    scalePxPerFtRef.current = scalePxPerFt;
  }, [scalePxPerFt]);

  const selectedElement = useMemo(() => {
    if (!selection.length) return null;
    return entities.byId[selection[0]] || null;
  }, [entities.byId, selection]);

  const displayElements = useMemo(() => {
    if (!document) return [] as AnnotationElement[];
    const baseElements = document.elements.filter((element) => document.layers[element.type]);
    if (viewPreset === 'final') return baseElements;
    if (viewPreset === 'walls_qa') {
      return baseElements.filter((element) => element.type === 'wall');
    }
    return baseElements.filter((element) => element.type !== 'room');
  }, [document, viewPreset]);

  const matchedTagIds = useMemo(() => {
    const ids = new Set<string>();
    if (!document) return ids;
    for (const element of document.elements) {
      if (element.type !== 'door' && element.type !== 'window') continue;
      const tagIds = Array.isArray((element.relations as { tagIds?: string[] } | undefined)?.tagIds)
        ? ((element.relations as { tagIds?: string[] }).tagIds as string[])
        : [];
      for (const id of tagIds) ids.add(id);
    }
    return ids;
  }, [document]);

  const issuesByElementId = useMemo(() => {
    if (!document) return new Set<string>();
    if (viewPreset === 'walls_qa') {
      return new Set(document.issues.filter((issue) => issue.code.toLowerCase().includes('wall')).map((issue) => issue.elementId));
    }
    return new Set(document.issues.map((issue) => issue.elementId));
  }, [document, viewPreset]);

  const effectiveShowTags = useMemo(() => {
    if (viewPreset === 'tags_qa') return true;
    if (viewPreset === 'walls_qa') return false;
    if (viewPreset === 'final') return false;
    return tagOverlay.showTags;
  }, [tagOverlay.showTags, viewPreset]);

  const renderHints = useMemo<AnnotationRenderHints>(() => ({
    preset: viewPreset,
    dimNonFocus: viewPreset === 'tags_qa' || viewPreset === 'openings_qa',
    highlightIssues: viewPreset === 'tags_qa' || viewPreset === 'openings_qa',
    showVerificationAccent: viewPreset === 'openings_qa',
  }), [viewPreset]);

  const calibrationDistancePx = useMemo(() => {
    if (!calibrationDraft.start || !calibrationDraft.end) return 0;
    return Math.hypot(
      calibrationDraft.end.x - calibrationDraft.start.x,
      calibrationDraft.end.y - calibrationDraft.start.y,
    );
  }, [calibrationDraft.end, calibrationDraft.start]);

  const refreshOpeningsFromCV = useCallback(async (baseDoc: AnnotationDocument, baseRevision: number) => {
    const cvSnapshot = await fetchCvDocument(projectId, fileUrl, fileMime, pageNumber, scalePxPerFtRef.current);
    const cvDoc = sanitizeAnnotationDocument(cvSnapshot.document);
    setTagOverlay((current) => ({
      ...current,
      tags: cvSnapshot.raw.tags || [],
      coordinateSpaceId: cvSnapshot.raw.metadata.coordinate_space_id,
    }));

    if (hasCoordinateMismatch(baseDoc, cvDoc)) {
      console.warn('[annotation-editor] refresh blocked due to coordinate-space mismatch', {
        existing: {
          coordinateSpaceId: baseDoc.meta.coordinateSpaceId,
          widthPx: baseDoc.baseImage.widthPx,
          heightPx: baseDoc.baseImage.heightPx,
        },
        next: {
          coordinateSpaceId: cvDoc.meta.coordinateSpaceId,
          widthPx: cvDoc.baseImage.widthPx,
          heightPx: cvDoc.baseImage.heightPx,
        },
      });
      setPendingRebuild(cvSnapshot);
      setWarning('Refresh blocked: the latest CV result uses a different coordinate space. Use “Rebuild geometry from current CV” to replace walls and openings together.');
      return { blocked: true as const };
    }

    setPendingRebuild(null);
    setWarning(null);
    const upgradedDoc = sanitizeAnnotationDocument(mergeOpeningsFromCV(baseDoc, cvDoc));
    initializeDocument(upgradedDoc);

    const saved = await saveAnnotationDocumentWithConflictRetry({
      projectId,
      pageNumber,
      document: {
        ...upgradedDoc,
        meta: {
          ...upgradedDoc.meta,
          revision: baseRevision,
        },
      },
      onConflictRevision: markRevision,
    });
    markRevision(saved.latest_revision);
    return { blocked: false as const };
  }, [fileMime, fileUrl, initializeDocument, markRevision, pageNumber, projectId]);

  const rebuildGeometryFromCV = useCallback(async () => {
    if (!pendingRebuild || !document) return;
    const nextDoc = sanitizeAnnotationDocument(pendingRebuild.document);
    initializeDocument(nextDoc);

    const saved = await saveAnnotationDocumentWithConflictRetry({
      projectId,
      pageNumber,
      document: {
        ...nextDoc,
        meta: {
          ...nextDoc.meta,
          revision: document.meta.revision,
        },
      },
      onConflictRevision: markRevision,
    });
    markRevision(saved.latest_revision);
    setWarning(null);
    setPendingRebuild(null);
  }, [document, initializeDocument, markRevision, pageNumber, pendingRebuild, projectId]);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    setPendingRebuild(null);
    setTagOverlay((current) => ({ ...current, tags: [], coordinateSpaceId: undefined }));

    try {
      const existing = await fetchAnnotationStorePayload(projectId, pageNumber);

      if (existing.document) {
        const existingDoc = sanitizeAnnotationDocument(existing.document);

        if (shouldRefreshOpeningsFromCV(existingDoc)) {
          const refreshResult = await refreshOpeningsFromCV(existingDoc, existing.latest_revision);
          if (refreshResult.blocked) {
            initializeDocument(existingDoc);
          }
        } else {
          initializeDocument(existingDoc);
        }

        setLoading(false);
        return;
      }

      const initialSnapshot = await fetchCvDocument(projectId, fileUrl, fileMime, pageNumber, scalePxPerFtRef.current);
      const sanitizedDoc = sanitizeAnnotationDocument(initialSnapshot.document);
      setTagOverlay((current) => ({
        ...current,
        tags: initialSnapshot.raw.tags || [],
        coordinateSpaceId: initialSnapshot.raw.metadata.coordinate_space_id,
      }));
      initializeDocument(sanitizedDoc);

      const saved = await saveAnnotationDocumentWithConflictRetry({
        projectId,
        pageNumber,
        document: sanitizedDoc,
        onConflictRevision: markRevision,
      });
      markRevision(saved.latest_revision);
    } catch (err: any) {
      setError(err?.message || 'Failed to load annotation editor');
    } finally {
      setLoading(false);
    }
  }, [fileMime, fileUrl, initializeDocument, markRevision, pageNumber, projectId, refreshOpeningsFromCV]);

  const saveSnapshot = useCallback(async () => {
    if (!document) return;
    setSaveStatus('syncing');

    try {
      const data = await saveAnnotationDocumentWithConflictRetry({
        projectId,
        pageNumber,
        document,
        onConflictRevision: markRevision,
      });
      markRevision(data.latest_revision);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [document, markRevision, pageNumber, projectId, setSaveStatus]);

  const focusIssue = useCallback((issue: AnnotationIssue) => {
    const element = entities.byId[issue.elementId] || null;
    const preset = presetForIssue(issue, element);
    setViewPreset(preset);
    setSelection([issue.elementId]);
    requestFocusOnElements([issue.elementId], element?.type === 'wall' ? 148 : 120);
  }, [entities.byId, requestFocusOnElements, setSelection, setViewPreset]);

  const resetCalibration = useCallback(() => {
    setCalibrationDraft({
      start: null,
      end: null,
      knownDistanceFt: '',
      error: null,
    });
  }, []);

  const registerCalibrationPoint = useCallback((point: CalibrationPoint) => {
    setCalibrationDraft((current) => {
      if (!current.start || (current.start && current.end)) {
        return {
          start: point,
          end: null,
          knownDistanceFt: current.knownDistanceFt,
          error: null,
        };
      }

      return {
        ...current,
        end: point,
        error: null,
      };
    });
  }, []);

  const applyCalibration = useCallback(() => {
    const knownDistanceFt = Number(calibrationDraft.knownDistanceFt);
    if (!calibrationDraft.start || !calibrationDraft.end || calibrationDistancePx <= 0) {
      setCalibrationDraft((current) => ({ ...current, error: 'Pick two reference points before applying scale.' }));
      return;
    }
    if (!Number.isFinite(knownDistanceFt) || knownDistanceFt <= 0) {
      setCalibrationDraft((current) => ({ ...current, error: 'Enter a known distance in feet greater than zero.' }));
      return;
    }

    setBaseImageScale(calibrationDistancePx / knownDistanceFt, 'manual', true);
    setToolMode('select');
    resetCalibration();
  }, [calibrationDistancePx, calibrationDraft.end, calibrationDraft.knownDistanceFt, calibrationDraft.start, resetCalibration, setBaseImageScale, setToolMode]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    if (toolMode === 'calibrate') return;
    if (!calibrationDraft.start && !calibrationDraft.end && !calibrationDraft.knownDistanceFt && !calibrationDraft.error) return;
    resetCalibration();
  }, [calibrationDraft.end, calibrationDraft.error, calibrationDraft.knownDistanceFt, calibrationDraft.start, resetCalibration, toolMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nudgeSelected(-step, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nudgeSelected(step, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nudgeSelected(0, -step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nudgeSelected(0, step);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelected, nudgeSelected, redo, undo]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!document) return;
      const pending = flushPendingOps();
      if (pending.length) {
        setSaveStatus('syncing');

        try {
          const data = await postAnnotationRevisionsWithConflictRetry({
            projectId,
            pageNumber,
            payload: {
              parent_revision_id: document.meta.revision,
              actor_id: actorId,
              events: pending,
            },
            onConflictRevision: markRevision,
          });
          markRevision(data.latest_revision);
          setSaveStatus('saved');
        } catch {
          restorePendingOps(pending);
          setSaveStatus('error');
        }
        return;
      }

      if (saveStatus === 'unsaved') {
        void saveSnapshot();
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [actorId, document, flushPendingOps, markRevision, pageNumber, projectId, restorePendingOps, saveSnapshot, saveStatus, setSaveStatus]);

  if (loading) {
    return <div className="w-full h-full grid place-items-center text-gray-400 text-sm">Loading annotation editor...</div>;
  }

  if (error || !document) {
    return (
      <div className="w-full h-full grid place-items-center px-6 text-center">
        <div className="text-red-300 text-sm">{error || 'Unable to load annotation editor.'}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 flex flex-col gap-2">
      <EditorToolbar
        toolMode={toolMode}
        onToolChange={setToolMode}
        viewPreset={viewPreset}
        onViewPresetChange={setViewPreset}
        onUndo={undo}
        onRedo={redo}
        onDelete={deleteSelected}
        onSave={() => void saveSnapshot()}
        onRefreshOpenings={() => {
          if (!document) return;
          setSaveStatus('syncing');
          void refreshOpeningsFromCV(document, document.meta.revision)
            .then((result) => setSaveStatus(result.blocked ? 'unsaved' : 'saved'))
            .catch((err: any) => {
              setSaveStatus('error');
              setError(err?.message || 'Failed to refresh openings');
            });
        }}
        showBaseImage={showBaseImage}
        onToggleBaseImage={() => setShowBaseImage((v) => !v)}
        showTags={tagOverlay.showTags}
        onToggleShowTags={() => setTagOverlay((current) => ({ ...current, showTags: !current.showTags }))}
        gridEnabled={gridEnabled}
        wallSnapEnabled={wallSnapEnabled}
        onToggleGrid={toggleGrid}
        onToggleWallSnap={toggleWallSnap}
      />

      {warning && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 flex items-center justify-between gap-3">
          <span>{warning}</span>
          <div className="flex items-center gap-2 shrink-0">
            {pendingRebuild && (
              <button
                type="button"
                onClick={() => {
                  setSaveStatus('syncing');
                  void rebuildGeometryFromCV()
                    .then(() => setSaveStatus('saved'))
                    .catch((err: any) => {
                      setSaveStatus('error');
                      setError(err?.message || 'Failed to rebuild geometry from CV');
                    });
                }}
                className="px-2 py-1 rounded border border-amber-300/50 bg-amber-400/10 text-amber-50 hover:bg-amber-400/20"
              >
                Rebuild geometry from current CV
              </button>
            )}
            <button
              type="button"
              onClick={() => setWarning(null)}
              className="px-2 py-1 rounded border border-white/10 text-gray-200 hover:bg-white/5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {toolMode === 'calibrate' && (
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-3 text-xs text-cyan-50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Plan Scale Calibration</div>
              <div className="mt-1 text-cyan-100/80">
                {!calibrationDraft.start
                  ? 'Click the first reference point on the plan.'
                  : !calibrationDraft.end
                    ? 'Click the second reference point to finish the measured segment.'
                    : 'Enter the real-world distance between the selected points to persist scale.'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetCalibration}
                className="rounded border border-white/10 px-2 py-1 text-cyan-50 transition hover:bg-white/5"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setToolMode('select');
                  resetCalibration();
                }}
                className="rounded border border-white/10 px-2 py-1 text-cyan-50 transition hover:bg-white/5"
              >
                Done
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-cyan-50/90">
              <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/70">Measured Segment</div>
              <div className="mt-1 text-sm font-medium text-white">
                {calibrationDistancePx > 0 ? `${calibrationDistancePx.toFixed(1)} px` : 'Waiting for two points'}
              </div>
            </div>
            <div>
              <label htmlFor="calibration-known-distance-ft" className="block text-[11px] uppercase tracking-[0.16em] text-cyan-100/70">
                Known Distance (ft)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="calibration-known-distance-ft"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={calibrationDraft.knownDistanceFt}
                  onChange={(event) => setCalibrationDraft((current) => ({
                    ...current,
                    knownDistanceFt: event.target.value,
                    error: null,
                  }))}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/60 focus:outline-none"
                  placeholder="e.g. 10"
                />
                <button
                  type="button"
                  onClick={applyCalibration}
                  disabled={!calibrationDraft.start || !calibrationDraft.end}
                  className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {calibrationDraft.error ? (
            <div className="mt-2 text-[11px] text-amber-100">{calibrationDraft.error}</div>
          ) : null}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px] gap-2">
        <ViewportStage
          baseImageUrl={document.baseImage.sourceUrl}
          widthPx={document.baseImage.widthPx}
          heightPx={document.baseImage.heightPx}
          showBaseImage={showBaseImage}
          showTags={effectiveShowTags}
          tags={tagOverlay.tags}
          matchedTagIds={matchedTagIds}
          displayElements={displayElements}
          viewPreset={viewPreset}
          renderHints={renderHints}
          issuesByElementId={issuesByElementId}
          issues={document.issues}
          onIssueSelect={focusIssue}
          calibrationDraft={calibrationDraft}
          onCalibrationPoint={registerCalibrationPoint}
        />

        <div className="min-h-0 overflow-y-auto space-y-2 pr-1">
          <RevisionStatusBar revision={document.meta.revision} status={saveStatus} />
          <IssueHighlighter issues={document.issues} onSelectIssue={focusIssue} />
          <PropertyPanel
            element={selectedElement}
            issues={selectedElement ? document.issues.filter((issue) => issue.elementId === selectedElement.id) : []}
            revision={document.meta.revision}
            onApply={updateElement}
          />
          <LayerVisibilityPanel document={document} onToggle={toggleLayer} />
        </div>
      </div>
    </div>
  );
}
