'use client';

import BulkWallActionsPanel from '@/components/annotation/BulkWallActionsPanel';
import IssueHighlighter from '@/components/annotation/IssueHighlighter';
import LayerVisibilityPanel from '@/components/annotation/LayerVisibilityPanel';
import PropertyPanel from '@/components/annotation/PropertyPanel';
import RevisionStatusBar from '@/components/annotation/RevisionStatusBar';
import RoomTakeoffPanel from '@/components/annotation/RoomTakeoffPanel';
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

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'selection', label: 'Selection' },
  { id: 'issues', label: 'Issues' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'layers', label: 'Layers' },
];

export default function EditorInspectorRail({
  activeTab,
  onTabChange,
  document,
  saveStatus,
  selectedElement,
  selectedElements,
  selectedWalls,
  roomElements,
  issuesForSelection,
  onSelectIssue,
  onApplyMany,
  onApplyElement,
  onFocusElement,
  onToggleLayer,
}: EditorInspectorRailProps) {
  return (
    <div className="min-h-0 overflow-y-auto space-y-2 pr-1">
      <RevisionStatusBar revision={document.meta.revision} status={saveStatus} />

      <div className="ws-panel p-2">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                activeTab === tab.id
                  ? 'bg-cyan-500/15 text-cyan-100'
                  : 'text-[var(--ws-text-secondary)] hover:bg-white/5 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'selection' ? (
        <>
          <BulkWallActionsPanel
            selectedCount={selectedElements.length}
            walls={selectedWalls}
            onApplyMany={onApplyMany}
          />
          <PropertyPanel
            element={selectedElements.length === 1 ? selectedElement : null}
            issues={issuesForSelection}
            revision={document.meta.revision}
            onApply={onApplyElement}
            onFocusElement={onFocusElement}
          />
        </>
      ) : null}

      {activeTab === 'issues' ? (
        <IssueHighlighter issues={document.issues} onSelectIssue={onSelectIssue} />
      ) : null}

      {activeTab === 'rooms' ? (
        <RoomTakeoffPanel
          rooms={roomElements}
          selectedRoomId={selectedElement?.type === 'room' ? selectedElement.id : null}
          onFocusRoom={onFocusElement}
        />
      ) : null}

      {activeTab === 'layers' ? (
        <LayerVisibilityPanel document={document} onToggle={onToggleLayer} />
      ) : null}
    </div>
  );
}
