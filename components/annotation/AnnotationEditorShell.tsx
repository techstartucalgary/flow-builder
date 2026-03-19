'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fromCVTakeoffResult } from '@/lib/annotationAdapters';
import { getBackendUrl } from '@/lib/backendUrl';
import {
  extractRoomsFromDocument,
  fetchAnnotationStorePayload,
  postAnnotationRevisionsWithConflictRetry,
  saveAnnotationDocumentWithConflictRetry,
} from '@/lib/annotationPersistence';
import { sanitizeAnnotationDocument } from '@/lib/annotationSanitizer';
import { openingFitsHostWall } from '@/lib/openingValidation';
import EditorInspectorRail, { type InspectorTab } from '@/components/annotation/EditorInspectorRail';
import EditorStatusBanner from '@/components/annotation/EditorStatusBanner';
import EditorToolbar from '@/components/annotation/EditorToolbar';
import ViewportStage from '@/components/annotation/ViewportStage';
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';
import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationIssue,
  AnnotationRenderHints,
  CVTakeoffResultPayload,
  EditorTagOverlayState,
  RoomElement,
} from '@/types/annotation';

const BACKEND_URL = getBackendUrl();
const ROOM_EXTRACTION_VERSION = '2026-03-room-refresh-v1';
const ROOM_REFRESH_WARNING_PREFIX = 'Room refresh preserved existing rooms';
const completedStartupRoomRefreshes = new Set<string>();
const completedStartupOpeningRefreshes = new Set<string>();

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
): {
  document: AnnotationDocument;
  droppedMissingHostCount: number;
  droppedHostFitCount: number;
} {
  const wallsById = new Map(
    existingDoc.elements
      .filter((element): element is Extract<AnnotationElement, { type: 'wall' }> => element.type === 'wall' && element.geometry.kind === 'segment')
      .map((element) => [element.id, element]),
  );
  const incomingIssues = cvDoc.issues;
  let droppedMissingHostCount = 0;
  let droppedHostFitCount = 0;
  const cvOpenings = cvDoc.elements.filter((e) => {
    if (e.type !== 'door' && e.type !== 'window') return false;
    const hostWallId = e.relations && typeof e.relations === 'object' && 'hostWallId' in e.relations
      ? String(e.relations.hostWallId || '')
      : '';
    if (!hostWallId) {
      droppedMissingHostCount += 1;
      return false;
    }
    if (!openingFitsHostWall(e, wallsById.get(hostWallId))) {
      droppedHostFitCount += 1;
      return false;
    }
    return true;
  });
  const nonOpenings = existingDoc.elements.filter((e) => e.type !== 'door' && e.type !== 'window');
  const mergedElements: AnnotationElement[] = [...nonOpenings, ...cvOpenings];
  const validIds = new Set(mergedElements.map((e) => e.id));
  const replacedOpeningIds = new Set(
    existingDoc.elements
      .filter((element) => element.type === 'door' || element.type === 'window')
      .map((element) => element.id),
  );
  const mergedIssues = [
    ...existingDoc.issues.filter((issue) => validIds.has(issue.elementId) && !replacedOpeningIds.has(issue.elementId)),
    ...incomingIssues.filter((issue) => validIds.has(issue.elementId)),
  ];

  return {
    document: {
      ...existingDoc,
      elements: mergedElements,
      issues: mergedIssues,
      meta: {
        ...existingDoc.meta,
        updatedAt: new Date().toISOString(),
      },
    },
    droppedMissingHostCount,
    droppedHostFitCount,
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

function roomElementsFromDocument(doc: AnnotationDocument): RoomElement[] {
  return doc.elements.filter((element): element is RoomElement => element.type === 'room');
}

function areRoomsAutoGenerated(rooms: RoomElement[]): boolean {
  return rooms.length > 0 && rooms.every((room) => {
    const extractionStatus = typeof room.relations === 'object' && room.relations && 'extractionStatus' in room.relations
      ? String((room.relations as { extractionStatus?: string }).extractionStatus || 'auto')
      : 'auto';
    return room.attrs.status !== 'edited' && extractionStatus !== 'edited';
  });
}

function withRoomExtractionMeta(
  doc: AnnotationDocument,
  revision: number,
  status: 'closed' | 'open' | 'ambiguous',
): AnnotationDocument {
  return {
    ...doc,
    meta: {
      ...doc.meta,
      roomExtractionVersion: ROOM_EXTRACTION_VERSION,
      roomExtractionRevision: revision,
      roomExtractionStatus: status,
    },
  };
}

function shouldExtractRooms(doc: AnnotationDocument): boolean {
  const rooms = roomElementsFromDocument(doc);
  if (rooms.length === 0) return true;
  if (rooms.some((room) => room.geometry.kind !== 'polygon')) return true;
  const autoGeneratedRooms = areRoomsAutoGenerated(rooms);
  if (!autoGeneratedRooms) return false;
  if (doc.meta.roomExtractionVersion !== ROOM_EXTRACTION_VERSION) return true;
  if ((doc.meta.roomExtractionRevision ?? -1) < doc.meta.revision) return true;
  return false;
}

function replaceRooms(document: AnnotationDocument, rooms: RoomElement[]): AnnotationDocument {
  const existingRoomIds = new Set(document.elements.filter((element) => element.type === 'room').map((element) => element.id));
  const preservedIssues = document.issues.filter((issue) => !existingRoomIds.has(issue.elementId));
  return {
    ...document,
    elements: [
      ...document.elements.filter((element) => element.type !== 'room'),
      ...rooms,
    ],
    issues: preservedIssues,
    meta: {
      ...document.meta,
      updatedAt: new Date().toISOString(),
    },
  };
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

interface RoomRefreshOutcome {
  document: AnnotationDocument;
  preservedExistingRooms: boolean;
  replacedRooms: boolean;
  summary: {
    roomCount: number;
    status: 'closed' | 'open' | 'ambiguous';
    confidence: 'high' | 'medium' | 'low';
  };
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('selection');
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({
    start: null,
    end: null,
    knownDistanceFt: '',
    error: null,
  });
  const scalePxPerFtRef = useRef(scalePxPerFt);
  const documentIdRef = useRef<string | null>(null);
  const selectionRef = useRef<string[]>([]);
  const loadDocumentRef = useRef<(() => Promise<void>) | null>(null);

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

  useEffect(() => {
    documentIdRef.current = document?.documentId ?? null;
  }, [document?.documentId]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const selectedElement = useMemo(() => {
    if (!selection.length) return null;
    return entities.byId[selection[0]] || null;
  }, [entities.byId, selection]);

  const selectedElements = useMemo(
    () => selection.map((id) => entities.byId[id]).filter((element): element is AnnotationElement => Boolean(element)),
    [entities.byId, selection],
  );

  const selectedWalls = useMemo(
    () => selectedElements.filter((element): element is Extract<AnnotationElement, { type: 'wall' }> => element.type === 'wall'),
    [selectedElements],
  );

  const displayElements = useMemo(() => {
    if (!document) return [] as AnnotationElement[];
    return document.elements.filter((element) => document.layers[element.type]);
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

  const roomElements = useMemo(
    () => document ? roomElementsFromDocument(document) : [],
    [document],
  );

  const refreshRoomsFromDocument = useCallback(async (
    baseDoc: AnnotationDocument,
    baseRevision: number,
    options?: { persist?: boolean; initialize?: boolean },
  ): Promise<RoomRefreshOutcome> => {
    const extracted = await extractRoomsFromDocument({
      document: baseDoc,
      revision: baseRevision,
      effectiveScalePxPerFt: baseDoc.baseImage.scalePxPerFt,
    });
    const existingRooms = roomElementsFromDocument(baseDoc);
    const shouldPreserveExistingRooms = existingRooms.length > 0 && (
      extracted.rooms.length === 0
      || extracted.summary.status === 'open'
      || extracted.summary.confidence === 'low'
    );
    const nextBaseDoc = shouldPreserveExistingRooms
      ? withRoomExtractionMeta(baseDoc, baseRevision, extracted.summary.status)
      : withRoomExtractionMeta(replaceRooms(baseDoc, extracted.rooms), baseRevision, extracted.summary.status);
    const nextDoc = sanitizeAnnotationDocument(nextBaseDoc);
    const preservedSelection = documentIdRef.current === baseDoc.documentId
      ? selectionRef.current.filter((id) => nextDoc.elements.some((element) => element.id === id))
      : [];

    if (options?.initialize !== false) {
      initializeDocument(nextDoc);
      if (preservedSelection.length) {
        setSelection(preservedSelection);
      }
    }

    if (shouldPreserveExistingRooms) {
      const nextRoomLabel = extracted.rooms.length === 1 ? '1 room' : `${extracted.rooms.length} rooms`;
      setWarning(
        `${ROOM_REFRESH_WARNING_PREFIX}: extractor returned ${nextRoomLabel} with ${extracted.summary.status} status and ${extracted.summary.confidence} confidence.`,
      );
    } else {
      setWarning((current) => current?.startsWith(ROOM_REFRESH_WARNING_PREFIX) ? null : current);
    }

    if (options?.persist === false) {
      return {
        document: nextDoc,
        preservedExistingRooms: shouldPreserveExistingRooms,
        replacedRooms: !shouldPreserveExistingRooms,
        summary: {
          roomCount: extracted.summary.room_count,
          status: extracted.summary.status,
          confidence: extracted.summary.confidence,
        },
      };
    }

    const saved = await saveAnnotationDocumentWithConflictRetry({
      projectId,
      pageNumber,
      document: {
        ...nextDoc,
        meta: {
          ...nextDoc.meta,
          revision: baseRevision,
        },
      },
      onConflictRevision: markRevision,
    });
    const persistedDoc = sanitizeAnnotationDocument(withRoomExtractionMeta({
      ...nextDoc,
      meta: {
        ...nextDoc.meta,
        revision: saved.latest_revision,
      },
    }, saved.latest_revision, extracted.summary.status));
    if (options?.initialize !== false) {
      initializeDocument(persistedDoc);
      if (preservedSelection.length) {
        setSelection(preservedSelection);
      }
    } else if (documentIdRef.current === baseDoc.documentId) {
      initializeDocument(persistedDoc);
      if (preservedSelection.length) {
        setSelection(preservedSelection);
      }
    } else {
      markRevision(saved.latest_revision);
    }
    return {
      document: persistedDoc,
      preservedExistingRooms: shouldPreserveExistingRooms,
      replacedRooms: !shouldPreserveExistingRooms,
      summary: {
        roomCount: extracted.summary.room_count,
        status: extracted.summary.status,
        confidence: extracted.summary.confidence,
      },
    };
  }, [initializeDocument, markRevision, pageNumber, projectId, setSelection]);

  const refreshOpeningsFromCV = useCallback(async (
    baseDoc: AnnotationDocument,
    baseRevision: number,
    options?: { persistRooms?: boolean },
  ) => {
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
    const mergeResult = mergeOpeningsFromCV(baseDoc, cvDoc);
    const upgradedDoc = sanitizeAnnotationDocument(mergeResult.document);
    if (mergeResult.droppedMissingHostCount || mergeResult.droppedHostFitCount) {
      const droppedParts: string[] = [];
      if (mergeResult.droppedHostFitCount) {
        droppedParts.push(`${mergeResult.droppedHostFitCount} opening${mergeResult.droppedHostFitCount === 1 ? '' : 's'} did not fit the current host wall geometry`);
      }
      if (mergeResult.droppedMissingHostCount) {
        droppedParts.push(
          mergeResult.droppedMissingHostCount === 1
            ? '1 opening was missing a host wall'
            : `${mergeResult.droppedMissingHostCount} openings were missing a host wall`,
        );
      }
      setWarning(`Refresh skipped invalid CV openings: ${droppedParts.join('; ')}.`);
    } else {
      setWarning(null);
    }
    await refreshRoomsFromDocument(upgradedDoc, baseRevision, { persist: options?.persistRooms !== false });
    return { blocked: false as const };
  }, [fileMime, fileUrl, markRevision, refreshRoomsFromDocument]);

  const rebuildGeometryFromCV = useCallback(async () => {
    if (!pendingRebuild || !document) return;
    const nextDoc = sanitizeAnnotationDocument(pendingRebuild.document);
    await refreshRoomsFromDocument(nextDoc, document.meta.revision);
    setWarning(null);
    setPendingRebuild(null);
  }, [document, pendingRebuild, refreshRoomsFromDocument]);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    setPendingRebuild(null);
    setStatusMessage('Loading annotation workspace...');
    setTagOverlay((current) => ({ ...current, tags: [], coordinateSpaceId: undefined }));

    try {
      const currentStoreDocument = useAnnotationEditorStore.getState().document;
      if (currentStoreDocument?.projectId === projectId && currentStoreDocument.page === pageNumber) {
        setLoading(false);
        if (shouldRefreshOpeningsFromCV(currentStoreDocument)) {
          const openingRefreshKey = `${projectId}:${pageNumber}:${currentStoreDocument.documentId}:${currentStoreDocument.meta.revision}:openings`;
          if (!completedStartupOpeningRefreshes.has(openingRefreshKey)) {
            completedStartupOpeningRefreshes.add(openingRefreshKey);
            setStatusMessage('Refreshing openings from CV...');
            void refreshOpeningsFromCV(currentStoreDocument, currentStoreDocument.meta.revision, { persistRooms: false })
              .then((refreshResult) => {
                if (refreshResult.blocked) {
                  setStatusMessage('Refresh paused for coordinate review.');
                  return;
                }
                setStatusMessage(null);
              })
              .catch((err: any) => {
                completedStartupOpeningRefreshes.delete(openingRefreshKey);
                setError(err?.message || 'Failed to refresh openings from CV');
                setStatusMessage('Opening refresh failed.');
              });
          } else {
            setStatusMessage(null);
          }
        } else if (shouldExtractRooms(currentStoreDocument)) {
          const roomRefreshKey = `${projectId}:${pageNumber}:${currentStoreDocument.documentId}:${currentStoreDocument.meta.revision}:${ROOM_EXTRACTION_VERSION}`;
          if (!completedStartupRoomRefreshes.has(roomRefreshKey)) {
            completedStartupRoomRefreshes.add(roomRefreshKey);
            setStatusMessage('Refreshing room extraction...');
            void refreshRoomsFromDocument(currentStoreDocument, currentStoreDocument.meta.revision, { persist: false })
              .then(() => {
                setStatusMessage(null);
              })
              .catch((err: any) => {
                completedStartupRoomRefreshes.delete(roomRefreshKey);
                setError(err?.message || 'Failed to refresh rooms');
                setStatusMessage('Room refresh failed.');
              });
          } else {
            setStatusMessage(null);
          }
        } else {
          setStatusMessage(null);
        }
        return;
      }

      const existing = await fetchAnnotationStorePayload(projectId, pageNumber);

      if (existing.document) {
        const existingDoc = sanitizeAnnotationDocument(existing.document);
        initializeDocument(existingDoc);
        setLoading(false);

        if (shouldRefreshOpeningsFromCV(existingDoc)) {
          const openingRefreshKey = `${projectId}:${pageNumber}:${existingDoc.documentId}:${existing.latest_revision}:openings`;
          if (!completedStartupOpeningRefreshes.has(openingRefreshKey)) {
            completedStartupOpeningRefreshes.add(openingRefreshKey);
            setStatusMessage('Refreshing openings from CV...');
            void refreshOpeningsFromCV(existingDoc, existing.latest_revision, { persistRooms: false })
              .then((refreshResult) => {
                if (refreshResult.blocked) {
                  setStatusMessage('Refresh paused for coordinate review.');
                  return;
                }
                setStatusMessage(null);
              })
              .catch((err: any) => {
                completedStartupOpeningRefreshes.delete(openingRefreshKey);
                setError(err?.message || 'Failed to refresh openings from CV');
                setStatusMessage('Opening refresh failed.');
              });
          } else {
            setStatusMessage(null);
          }
        } else if (shouldExtractRooms(existingDoc)) {
          const roomRefreshKey = `${projectId}:${pageNumber}:${existingDoc.documentId}:${existing.latest_revision}:${ROOM_EXTRACTION_VERSION}`;
          if (!completedStartupRoomRefreshes.has(roomRefreshKey)) {
            completedStartupRoomRefreshes.add(roomRefreshKey);
            setStatusMessage('Refreshing room extraction...');
            void refreshRoomsFromDocument(existingDoc, existing.latest_revision, { persist: false })
              .then(() => {
                setStatusMessage(null);
              })
              .catch((err: any) => {
                completedStartupRoomRefreshes.delete(roomRefreshKey);
                setError(err?.message || 'Failed to refresh rooms');
                setStatusMessage('Room refresh failed.');
              });
          } else {
            setStatusMessage(null);
          }
        } else {
          setStatusMessage(null);
        }
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
      setLoading(false);
      const roomRefreshKey = `${projectId}:${pageNumber}:${sanitizedDoc.documentId}:${sanitizedDoc.meta.revision}:${ROOM_EXTRACTION_VERSION}`;
      if (!completedStartupRoomRefreshes.has(roomRefreshKey)) {
        completedStartupRoomRefreshes.add(roomRefreshKey);
        setStatusMessage('Refreshing room extraction...');
        void refreshRoomsFromDocument(sanitizedDoc, sanitizedDoc.meta.revision, { persist: false })
          .then(() => {
            setStatusMessage(null);
          })
          .catch((err: any) => {
            completedStartupRoomRefreshes.delete(roomRefreshKey);
            setError(err?.message || 'Failed to refresh rooms');
            setStatusMessage('Room refresh failed.');
          });
      } else {
        setStatusMessage(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load annotation editor');
    } finally {
      setLoading(false);
    }
  }, [fileMime, fileUrl, initializeDocument, refreshOpeningsFromCV, refreshRoomsFromDocument]);

  const saveSnapshot = useCallback(async () => {
    if (!document) return;
    setSaveStatus('syncing');
    setStatusMessage('Saving document changes...');

    try {
      const data = await saveAnnotationDocumentWithConflictRetry({
        projectId,
        pageNumber,
        document,
        onConflictRevision: markRevision,
      });
      markRevision(data.latest_revision);
      setSaveStatus('saved');
      setStatusMessage(null);
    } catch {
      setSaveStatus('error');
      setStatusMessage('Save failed. Resolve the editor state before generating.');
    }
  }, [document, markRevision, pageNumber, projectId, setSaveStatus]);

  const focusIssue = useCallback((issue: AnnotationIssue) => {
    const element = entities.byId[issue.elementId] || null;
    const preset = presetForIssue(issue, element);
    setViewPreset(preset);
    setInspectorTab('issues');
    setSelection([issue.elementId]);
    requestFocusOnElements([issue.elementId], element?.type === 'wall' ? 148 : 120);
  }, [entities.byId, requestFocusOnElements, setSelection, setViewPreset]);

  const focusElementById = useCallback((elementId: string) => {
    const element = entities.byId[elementId] || null;
    if (!element) return;
    if (element.type === 'wall') setViewPreset('walls_qa');
    else if (element.type === 'door' || element.type === 'window') setViewPreset('openings_qa');
    else setViewPreset('final');
    setInspectorTab(element.type === 'room' ? 'rooms' : 'selection');
    setSelection([elementId]);
    requestFocusOnElements([elementId], element.type === 'wall' ? 148 : 120);
  }, [entities.byId, requestFocusOnElements, setSelection, setViewPreset]);

  const applyManyElements = useCallback((elements: AnnotationElement[]) => {
    for (const element of elements) {
      updateElement(element);
    }
    setSelection(elements.map((element) => element.id));
    requestFocusOnElements(elements.map((element) => element.id), 140);
  }, [requestFocusOnElements, setSelection, updateElement]);

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

    const nextScale = calibrationDistancePx / knownDistanceFt;
    setBaseImageScale(nextScale, 'manual', true);
    if (document) {
      const nextDoc: AnnotationDocument = {
        ...document,
        baseImage: {
          ...document.baseImage,
          scalePxPerFt: nextScale,
          scaleSource: 'manual',
          scaleLocked: true,
        },
      };
      setSaveStatus('syncing');
      void refreshRoomsFromDocument(nextDoc, document.meta.revision)
        .then(() => setSaveStatus('saved'))
        .catch((err: any) => {
          setSaveStatus('error');
          setError(err?.message || 'Failed to refresh rooms after calibration');
        });
    }
    setToolMode('select');
    resetCalibration();
  }, [calibrationDistancePx, calibrationDraft.end, calibrationDraft.knownDistanceFt, calibrationDraft.start, document, refreshRoomsFromDocument, resetCalibration, setBaseImageScale, setSaveStatus, setToolMode]);

  useEffect(() => {
    loadDocumentRef.current = loadDocument;
  }, [loadDocument]);

  useEffect(() => {
    void loadDocumentRef.current?.();
  }, [fileMime, fileUrl, pageNumber, projectId]);

  useEffect(() => {
    if (toolMode === 'calibrate') return;
    if (!calibrationDraft.start && !calibrationDraft.end && !calibrationDraft.knownDistanceFt && !calibrationDraft.error) return;
    resetCalibration();
  }, [calibrationDraft.end, calibrationDraft.error, calibrationDraft.knownDistanceFt, calibrationDraft.start, resetCalibration, toolMode]);

  useEffect(() => {
    if (!selectedElement) return;
    setInspectorTab(selectedElement.type === 'room' ? 'rooms' : 'selection');
  }, [selectedElement]);

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
        setStatusMessage('Syncing annotation revisions...');

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
          setStatusMessage(null);
        } catch {
          restorePendingOps(pending);
          setSaveStatus('error');
          setStatusMessage('Revision sync failed.');
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
          setStatusMessage('Refreshing openings from CV...');
          void refreshOpeningsFromCV(document, document.meta.revision)
            .then((result) => {
              setSaveStatus(result.blocked ? 'unsaved' : 'saved');
              setStatusMessage(result.blocked ? 'Refresh paused for coordinate review.' : null);
            })
            .catch((err: any) => {
              setSaveStatus('error');
              setError(err?.message || 'Failed to refresh openings');
              setStatusMessage('Opening refresh failed.');
            });
        }}
        onRefreshRooms={() => {
          if (!document) return;
          setSaveStatus('syncing');
          setStatusMessage('Refreshing room extraction...');
          void refreshRoomsFromDocument(document, document.meta.revision)
            .then(() => {
              setSaveStatus('saved');
              setStatusMessage(null);
            })
            .catch((err: any) => {
              setSaveStatus('error');
              setError(err?.message || 'Failed to refresh rooms');
              setStatusMessage('Room refresh failed.');
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

      <EditorStatusBanner
        saveStatus={saveStatus}
        statusMessage={statusMessage}
        warning={warning}
        error={error}
        pendingRebuild={Boolean(pendingRebuild)}
        onRebuild={pendingRebuild ? () => {
          setSaveStatus('syncing');
          setStatusMessage('Rebuilding geometry from the current CV snapshot...');
          void rebuildGeometryFromCV()
            .then(() => {
              setSaveStatus('saved');
              setStatusMessage(null);
            })
            .catch((err: any) => {
              setSaveStatus('error');
              setError(err?.message || 'Failed to rebuild geometry from CV');
              setStatusMessage('Geometry rebuild failed.');
            });
        } : undefined}
        onDismissWarning={warning ? () => setWarning(null) : undefined}
      >
        {toolMode === 'calibrate' ? (
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
        ) : null}
      </EditorStatusBanner>

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

        <EditorInspectorRail
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          document={document}
          saveStatus={saveStatus}
          selectedElement={selection.length === 1 ? selectedElement : null}
          selectedElements={selectedElements}
          selectedWalls={selectedWalls}
          roomElements={roomElements}
          issuesForSelection={selectedElement ? document.issues.filter((issue) => issue.elementId === selectedElement.id) : []}
          onSelectIssue={focusIssue}
          onApplyMany={applyManyElements}
          onApplyElement={updateElement}
          onFocusElement={focusElementById}
          onToggleLayer={toggleLayer}
        />
      </div>
    </div>
  );
}
