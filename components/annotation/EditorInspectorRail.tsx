'use client';

import { useMemo } from 'react';

import AnnotationTrustCard from '@/components/annotation/AnnotationTrustCard';
import BulkWallActionsPanel from '@/components/annotation/BulkWallActionsPanel';
import LayerVisibilityPanel from '@/components/annotation/LayerVisibilityPanel';
import PropertyPanel from '@/components/annotation/PropertyPanel';
import RevisionStatusBar from '@/components/annotation/RevisionStatusBar';
import { buildTrustCardModel } from '@/lib/annotationTrust';
import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationIssue,
  RoomElement,
  WallElement,
} from '@/types/annotation';

export type InspectorTab = 'selection' | 'issues' | 'rooms' | 'layers';

interface EditorInspectorRailProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  document: AnnotationDocument;
  saveStatus: 'saved' | 'unsaved' | 'syncing' | 'error';
  selectedElement: AnnotationElement | null;
  selectedElements: AnnotationElement[];
  selectedWalls: WallElement[];
  roomElements: RoomElement[];
  issuesForSelection: AnnotationIssue[];
  onSelectIssue: (issue: AnnotationIssue) => void;
  onApplyMany: (elements: AnnotationElement[]) => void;
  onApplyElement: (element: AnnotationElement) => void;
  onFocusElement: (elementId: string) => void;
  onToggleLayer: (type: 'wall' | 'door' | 'window' | 'room') => void;
}

export default function EditorInspectorRail({
  activeTab: _activeTab,
  onTabChange: _onTabChange,
  document,
  saveStatus,
  selectedElement,
  selectedElements,
  selectedWalls,
  roomElements: _roomElements,
  issuesForSelection,
  onSelectIssue: _onSelectIssue,
  onApplyMany,
  onApplyElement,
  onFocusElement,
  onToggleLayer,
}: EditorInspectorRailProps) {
  const wallsById = useMemo(
    () => Object.fromEntries(
      document.elements
        .filter((element): element is WallElement => element.type === 'wall' && element.geometry.kind === 'segment')
        .map((element) => [element.id, element]),
    ),
    [document.elements],
  );

  const trustModel = useMemo(() => buildTrustCardModel({
    element: selectedElements.length === 1 ? selectedElement : null,
    wallsById,
    issues: issuesForSelection,
    scalePxPerFt: document.baseImage.scalePxPerFt,
  }), [document.baseImage.scalePxPerFt, issuesForSelection, selectedElement, selectedElements.length, wallsById]);

  const roomSelection = selectedElements.length === 1 && selectedElement?.type === 'room' ? selectedElement : null;
  const roomIssues = roomSelection
    ? document.issues.filter((issue) => issue.elementId === roomSelection.id)
    : [];

  return (
    <div className="min-h-0 overflow-y-auto space-y-2 pr-1">
      <RevisionStatusBar revision={document.meta.revision} status={saveStatus} />

      {selectedElements.length > 1 ? (
        <BulkWallActionsPanel
          selectedCount={selectedElements.length}
          walls={selectedWalls}
          onApplyMany={onApplyMany}
        />
      ) : null}

      <div className="ws-panel-flat px-4 py-4">
        <div className="ws-section-header">Selection</div>

        {!selectedElements.length ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--ws-border)] bg-white/[0.02] px-3 py-4 text-sm text-[var(--ws-text-secondary)]">
            Hover a wall, door, or window to inspect trust on the canvas. Click an element to pin trust details here and unlock deeper editing.
          </div>
        ) : null}

        {trustModel ? (
          <div className="mt-3">
            <AnnotationTrustCard model={trustModel} />
          </div>
        ) : null}

        {roomSelection ? (
          <div className="mt-3 rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
            <div className="text-base font-semibold text-white">{roomSelection.attrs.name || roomSelection.id}</div>
            <div className="mt-1 text-sm text-[var(--ws-text-secondary)]">
              Room details stay on demand in annotate mode so the canvas remains primary.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="ws-chip">{roomSelection.attrs.status}</span>
              <span className="ws-chip" data-tone={roomIssues.length ? 'warn' : 'good'}>
                {roomIssues.length ? `${roomIssues.length} issue${roomIssues.length === 1 ? '' : 's'}` : 'No issues'}
              </span>
            </div>
          </div>
        ) : null}

        {selectedElements.length === 1 ? (
          <details className="mt-3 rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-white">
              More details
            </summary>
            <div className="mt-3">
              <PropertyPanel
                element={selectedElement}
                issues={issuesForSelection}
                revision={document.meta.revision}
                onApply={onApplyElement}
                onFocusElement={onFocusElement}
              />
            </div>
          </details>
        ) : null}
      </div>

      <details className="ws-panel-flat px-4 py-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-white">
          Layers
        </summary>
        <div className="mt-3">
          <LayerVisibilityPanel document={document} onToggle={onToggleLayer} />
        </div>
      </details>
    </div>
  );
}
