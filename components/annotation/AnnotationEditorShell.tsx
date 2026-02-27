'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { fromCVTakeoffResult, toPersistencePayload } from '@/lib/annotationAdapters';
import { getBackendUrl } from '@/lib/backendUrl';
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
  ProjectedOpeningVisibilityState,
  AnnotationStorePayload,
  CVTakeoffResultPayload,
  EditorTagOverlayState,
  RevisionsResponse,
} from '@/types/annotation';

const BACKEND_URL = getBackendUrl();
const PROJECTED_OPENING_VISIBILITY: ProjectedOpeningVisibilityState = {
  projectedOpeningMinConfidence: 0.72,
  showLowConfidenceProjectedOpenings: false,
};

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
  const [projectedOpeningVisibility, setProjectedOpeningVisibility] = useState<ProjectedOpeningVisibilityState>(PROJECTED_OPENING_VISIBILITY);
  const [pendingRebuild, setPendingRebuild] = useState<CvDocumentSnapshot | null>(null);

  const document = useAnnotationEditorStore((s) => s.document);
  const entities = useAnnotationEditorStore((s) => s.entities);
  const selection = useAnnotationEditorStore((s) => s.selection);
  const toolMode = useAnnotationEditorStore((s) => s.toolMode);
  const gridEnabled = useAnnotationEditorStore((s) => s.gridEnabled);
  const wallSnapEnabled = useAnnotationEditorStore((s) => s.wallSnapEnabled);
  const saveStatus = useAnnotationEditorStore((s) => s.saveStatus);

  const initializeDocument = useAnnotationEditorStore((s) => s.initializeDocument);
  const setToolMode = useAnnotationEditorStore((s) => s.setToolMode);
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
  const setSaveStatus = useAnnotationEditorStore((s) => s.setSaveStatus);

  const selectedElement = useMemo(() => {
    if (!selection.length) return null;
    return entities.byId[selection[0]] || null;
  }, [entities.byId, selection]);

  const openingVisibilitySummary = useMemo(() => {
    if (!document) {
      return {
        visibleOpenings: 0,
        tentativeHiddenOpenings: 0,
      };
    }
    const openings = document.elements.filter((element) => element.type === 'door' || element.type === 'window');
    let visibleOpenings = 0;
    let tentativeHiddenOpenings = 0;

    for (const opening of openings) {
      if (opening.attrs.visible) {
        visibleOpenings += 1;
        continue;
      }

      const relations = opening.relations;
      if (
        relations
        && typeof relations === 'object'
        && 'source' in relations
        && 'confidence' in relations
        && relations.source === 'tag_projected'
        && typeof relations.confidence === 'number'
        && relations.confidence < PROJECTED_OPENING_VISIBILITY.projectedOpeningMinConfidence
      ) {
        tentativeHiddenOpenings += 1;
      }
    }

    return {
      visibleOpenings,
      tentativeHiddenOpenings,
    };
  }, [document]);

  const effectiveShowTentativeOpenings = projectedOpeningVisibility.showLowConfidenceProjectedOpenings
    || (openingVisibilitySummary.visibleOpenings === 0 && openingVisibilitySummary.tentativeHiddenOpenings > 0);

  const refreshOpeningsFromCV = useCallback(async (baseDoc: AnnotationDocument, baseRevision: number) => {
    const cvSnapshot = await fetchCvDocument(projectId, fileUrl, fileMime, pageNumber, scalePxPerFt);
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

    const saveRes = await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: {
          ...upgradedDoc,
          meta: {
            ...upgradedDoc.meta,
            updatedAt: new Date().toISOString(),
          },
        },
        base_revision: baseRevision,
      }),
    });
    if (!saveRes.ok) {
      const err = await saveRes.json().catch(() => ({ detail: saveRes.statusText }));
      throw new Error(err.detail || `Failed to save refreshed openings (${saveRes.status})`);
    }

    const saved = (await saveRes.json()) as AnnotationStorePayload;
    markRevision(saved.latest_revision);
    return { blocked: false as const };
  }, [fileMime, fileUrl, initializeDocument, markRevision, pageNumber, projectId, scalePxPerFt]);

  const rebuildGeometryFromCV = useCallback(async () => {
    if (!pendingRebuild || !document) return;
    const nextDoc = sanitizeAnnotationDocument(pendingRebuild.document);
    initializeDocument(nextDoc);

    const saveRes = await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: {
          ...nextDoc,
          meta: {
            ...nextDoc.meta,
            updatedAt: new Date().toISOString(),
          },
        },
        base_revision: document.meta.revision,
      }),
    });
    if (!saveRes.ok) {
      const err = await saveRes.json().catch(() => ({ detail: saveRes.statusText }));
      throw new Error(err.detail || `Failed to rebuild geometry from CV (${saveRes.status})`);
    }

    const saved = (await saveRes.json()) as AnnotationStorePayload;
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
      const existingRes = await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`);
      if (!existingRes.ok) throw new Error(`Failed to load annotation doc (${existingRes.status})`);
      const existing = (await existingRes.json()) as AnnotationStorePayload;

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

      const initialSnapshot = await fetchCvDocument(projectId, fileUrl, fileMime, pageNumber, scalePxPerFt);
      const sanitizedDoc = sanitizeAnnotationDocument(initialSnapshot.document);
      setTagOverlay((current) => ({
        ...current,
        tags: initialSnapshot.raw.tags || [],
        coordinateSpaceId: initialSnapshot.raw.metadata.coordinate_space_id,
      }));
      initializeDocument(sanitizedDoc);

      await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPersistencePayload(sanitizedDoc)),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load annotation editor');
    } finally {
      setLoading(false);
    }
  }, [fileMime, fileUrl, initializeDocument, pageNumber, projectId, refreshOpeningsFromCV, scalePxPerFt]);

  const saveSnapshot = useCallback(async () => {
    if (!document) return;
    setSaveStatus('syncing');

    try {
      const res = await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPersistencePayload(document)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Save failed (${res.status})`);
      }
      const data = (await res.json()) as AnnotationStorePayload;
      markRevision(data.latest_revision);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [document, markRevision, pageNumber, projectId, setSaveStatus]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

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
      if (!pending.length) return;

      setSaveStatus('syncing');

      try {
        const response = await fetch(`${BACKEND_URL}/api/annotations/${projectId}/revisions?page=${pageNumber}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent_revision_id: document.meta.revision,
            actor_id: actorId,
            events: pending,
          }),
        });

        if (!response.ok) throw new Error('Revision sync failed');
        const data = (await response.json()) as RevisionsResponse;
        markRevision(data.latest_revision);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [actorId, document, flushPendingOps, markRevision, pageNumber, projectId, setSaveStatus]);

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
        showTentativeOpenings={effectiveShowTentativeOpenings}
        onToggleTentativeOpenings={() => setProjectedOpeningVisibility((current) => ({
          ...current,
          showLowConfidenceProjectedOpenings: !current.showLowConfidenceProjectedOpenings,
        }))}
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

      {!warning && openingVisibilitySummary.visibleOpenings === 0 && openingVisibilitySummary.tentativeHiddenOpenings > 0 && (
        <div className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          No high-confidence openings are currently visible. Showing {openingVisibilitySummary.tentativeHiddenOpenings} tentative projected openings for review.
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px] gap-2">
        <ViewportStage
          baseImageUrl={document.baseImage.sourceUrl}
          widthPx={document.baseImage.widthPx}
          heightPx={document.baseImage.heightPx}
          showBaseImage={showBaseImage}
          showTags={tagOverlay.showTags}
          tags={tagOverlay.tags}
          showLowConfidenceProjectedOpenings={effectiveShowTentativeOpenings}
          issues={document.issues}
          onIssueSelect={(issue) => setSelection([issue.elementId])}
        />

        <div className="min-h-0 overflow-y-auto space-y-2 pr-1">
          <RevisionStatusBar revision={document.meta.revision} status={saveStatus} />
          <LayerVisibilityPanel document={document} onToggle={toggleLayer} />
          <IssueHighlighter issues={document.issues} onSelectIssue={(issue) => setSelection([issue.elementId])} />
          <PropertyPanel element={selectedElement} onApply={updateElement} />
        </div>
      </div>
    </div>
  );
}
