'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { fromCVTakeoffResult, toPersistencePayload } from '@/lib/annotationAdapters';
import { sanitizeAnnotationDocument } from '@/lib/annotationSanitizer';
import EditorToolbar from '@/components/annotation/EditorToolbar';
import IssueHighlighter from '@/components/annotation/IssueHighlighter';
import LayerVisibilityPanel from '@/components/annotation/LayerVisibilityPanel';
import PropertyPanel from '@/components/annotation/PropertyPanel';
import RevisionStatusBar from '@/components/annotation/RevisionStatusBar';
import ViewportStage from '@/components/annotation/ViewportStage';
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';
import type {
  AnnotationStorePayload,
  CVTakeoffResultPayload,
  RevisionsResponse,
} from '@/types/annotation';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

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
  const [showBaseImage, setShowBaseImage] = useState(true);

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

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const existingRes = await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`);
      if (!existingRes.ok) throw new Error(`Failed to load annotation doc (${existingRes.status})`);
      const existing = (await existingRes.json()) as AnnotationStorePayload;

      if (existing.document) {
        initializeDocument(sanitizeAnnotationDocument(existing.document));
        setLoading(false);
        return;
      }

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
        throw new Error(err.detail || `Failed to initialize from CV (${cvRes.status})`);
      }

      const cv = (await cvRes.json()) as CVTakeoffResultPayload;
      const initialDoc = fromCVTakeoffResult(cv, {
        projectId,
        page: pageNumber,
        sourceUrl: fileUrl,
      });
      const sanitizedDoc = sanitizeAnnotationDocument(initialDoc);
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
  }, [fileMime, fileUrl, initializeDocument, pageNumber, projectId, scalePxPerFt]);

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
        showBaseImage={showBaseImage}
        onToggleBaseImage={() => setShowBaseImage((v) => !v)}
        gridEnabled={gridEnabled}
        wallSnapEnabled={wallSnapEnabled}
        onToggleGrid={toggleGrid}
        onToggleWallSnap={toggleWallSnap}
      />

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px] gap-2">
        <ViewportStage
          baseImageUrl={document.baseImage.sourceUrl}
          widthPx={document.baseImage.widthPx}
          heightPx={document.baseImage.heightPx}
          showBaseImage={showBaseImage}
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
