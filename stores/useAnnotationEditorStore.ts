'use client';

import { create } from 'zustand';
import { produce } from 'immer';

import { safeClone } from '@/lib/clone';
import { applyOperation, invertOperation } from '@/lib/history';
import { snapPointToWalls, snapToGrid } from '@/lib/snapping';
import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationElementType,
  AnnotationOperation,
  EditorCameraState,
  EditorEntities,
  RevisionEvent,
  ToolMode,
} from '@/types/annotation';

const HISTORY_LIMIT = 200;

function emptyEntities(): EditorEntities {
  return {
    byId: {},
    byType: {
      wall: [],
      door: [],
      window: [],
      room: [],
      label: [],
      dimension: [],
    },
  };
}

function indexElements(doc: AnnotationDocument | null): EditorEntities {
  if (!doc) return emptyEntities();
  const byId: Record<string, AnnotationElement> = {};
  const byType = emptyEntities().byType;

  for (const element of doc.elements) {
    byId[element.id] = element;
    byType[element.type].push(element.id);
  }

  return { byId, byType };
}

function randomId(prefix: AnnotationElementType): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function baseCamera(): EditorCameraState {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
    minZoom: 0.25,
    maxZoom: 8,
  };
}

interface HistoryState {
  past: AnnotationOperation[];
  future: AnnotationOperation[];
  pendingOps: RevisionEvent[];
}

interface AnnotationEditorState {
  document: AnnotationDocument | null;
  entities: EditorEntities;
  selection: string[];
  toolMode: ToolMode;
  camera: EditorCameraState;
  gridEnabled: boolean;
  gridSize: number;
  wallSnapEnabled: boolean;
  wallSnapThreshold: number;
  history: HistoryState;
  saveStatus: 'saved' | 'unsaved' | 'syncing' | 'error';

  initializeDocument: (doc: AnnotationDocument) => void;
  setToolMode: (mode: ToolMode) => void;
  setSelection: (ids: string[]) => void;
  setCamera: (partial: Partial<EditorCameraState>) => void;
  setSaveStatus: (status: AnnotationEditorState['saveStatus']) => void;
  toggleLayer: (type: AnnotationElementType) => void;
  toggleGrid: () => void;
  toggleWallSnap: () => void;

  applyOperation: (op: AnnotationOperation, record?: boolean) => void;
  moveElementBy: (id: string, dx: number, dy: number) => void;
  updateElement: (element: AnnotationElement) => void;
  createElementAt: (type: AnnotationElementType, x: number, y: number) => void;
  deleteSelected: () => void;
  nudgeSelected: (dx: number, dy: number) => void;

  undo: () => void;
  redo: () => void;
  flushPendingOps: () => RevisionEvent[];
  markRevision: (revision: number) => void;
}

export const useAnnotationEditorStore = create<AnnotationEditorState>((set, get) => ({
  document: null,
  entities: emptyEntities(),
  selection: [],
  toolMode: 'select',
  camera: baseCamera(),
  gridEnabled: true,
  gridSize: 8,
  wallSnapEnabled: true,
  wallSnapThreshold: 12,
  history: { past: [], future: [], pendingOps: [] },
  saveStatus: 'saved',

  initializeDocument: (doc) => {
    set({
      document: doc,
      entities: indexElements(doc),
      selection: [],
      history: { past: [], future: [], pendingOps: [] },
      saveStatus: 'saved',
    });
  },

  setToolMode: (toolMode) => set({ toolMode }),
  setSelection: (selection) => set({ selection }),
  setCamera: (partial) => set((state) => ({ camera: { ...state.camera, ...partial } })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  toggleGrid: () => set((state) => ({ gridEnabled: !state.gridEnabled })),
  toggleWallSnap: () => set((state) => ({ wallSnapEnabled: !state.wallSnapEnabled })),

  toggleLayer: (type) => {
    set(
      produce((state: AnnotationEditorState) => {
        if (!state.document) return;
        state.document.layers[type] = !state.document.layers[type];
        state.saveStatus = 'unsaved';
      }),
    );
  },

  applyOperation: (op, record = true) => {
    set(
      produce((state: AnnotationEditorState) => {
        if (!state.document) return;

        state.document = applyOperation(state.document, op);
        state.document.meta.updatedAt = new Date().toISOString();
        state.entities = indexElements(state.document);
        state.saveStatus = 'unsaved';

        if (!record) return;

        state.history.past.push(op);
        if (state.history.past.length > HISTORY_LIMIT) {
          state.history.past.shift();
        }
        state.history.future = [];

        state.history.pendingOps.push({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          parentRevisionId: state.document.meta.revision,
          timestamp: new Date().toISOString(),
          operations: [op],
        });
      }),
    );
  },

  moveElementBy: (id, dx, dy) => {
    const state = get();
    const element = state.entities.byId[id];
    if (!element || element.attrs.locked) return;

    const next = safeClone(element);
    if (next.geometry.kind === 'segment') {
      next.geometry.x1 += dx;
      next.geometry.x2 += dx;
      next.geometry.y1 += dy;
      next.geometry.y2 += dy;
    } else {
      next.geometry.x += dx;
      next.geometry.y += dy;
    }
    next.attrs.status = 'edited';

    const op: AnnotationOperation = {
      kind: 'update',
      elementId: id,
      before: element,
      after: next,
    };
    get().applyOperation(op, true);
  },

  updateElement: (element) => {
    const current = get().entities.byId[element.id];
    if (!current) return;
    const next = safeClone(element);
    next.attrs.status = next.attrs.status === 'auto' ? 'edited' : next.attrs.status;

    const op: AnnotationOperation = {
      kind: 'update',
      elementId: element.id,
      before: current,
      after: next,
    };
    get().applyOperation(op, true);
  },

  createElementAt: (type, x, y) => {
    const state = get();
    const doc = state.document;
    if (!doc) return;

    let px = x;
    let py = y;
    if (state.gridEnabled) {
      const snapped = snapToGrid(px, py, state.gridSize);
      px = snapped.x;
      py = snapped.y;
    }

    if (state.wallSnapEnabled && type !== 'wall') {
      const wallIds = state.entities.byType.wall;
      const walls = wallIds.map((wallId) => state.entities.byId[wallId]);
      const snapped = snapPointToWalls(px, py, walls, state.wallSnapThreshold);
      px = snapped.x;
      py = snapped.y;
    }

    const id = randomId(type);
    const common = {
      id,
      attrs: {
        status: 'new' as const,
        locked: false,
        visible: true,
        confidence: 1,
      },
      relations: {},
    };

    let element: AnnotationElement;
    if (type === 'wall') {
      element = {
        ...common,
        type,
        geometry: { kind: 'segment', x1: px, y1: py, x2: px + 120, y2: py, thicknessPx: 14, rotationDeg: 0 },
      };
    } else if (type === 'label') {
      element = {
        ...common,
        type,
        geometry: { kind: 'text', x: px, y: py, width: 160, height: 28, rotationDeg: 0, text: 'Label', fontSize: 16 },
      };
    } else if (type === 'dimension') {
      element = {
        ...common,
        type,
        geometry: { kind: 'segment', x1: px, y1: py, x2: px + 100, y2: py, thicknessPx: 2, rotationDeg: 0 },
      };
    } else {
      element = {
        ...common,
        type,
        geometry: { kind: 'rect', x: px, y: py, width: 72, height: 24, rotationDeg: 0 },
      };
    }

    const op: AnnotationOperation = {
      kind: 'create',
      elementId: element.id,
      element,
    };

    get().applyOperation(op, true);
    get().setSelection([element.id]);
  },

  deleteSelected: () => {
    const { selection, entities } = get();
    for (const id of selection) {
      const element = entities.byId[id];
      if (!element || element.attrs.locked) continue;
      const op: AnnotationOperation = {
        kind: 'delete',
        elementId: id,
        element,
      };
      get().applyOperation(op, true);
    }
    get().setSelection([]);
  },

  nudgeSelected: (dx, dy) => {
    for (const id of get().selection) {
      get().moveElementBy(id, dx, dy);
    }
  },

  undo: () => {
    const state = get();
    const last = state.history.past[state.history.past.length - 1];
    if (!last) return;

    const inverse = invertOperation(last);
    if (!inverse) return;

    set(
      produce((draft: AnnotationEditorState) => {
        if (!draft.document) return;
        draft.history.past.pop();
        draft.history.future.push(last);
        draft.document = applyOperation(draft.document, inverse);
        draft.document.meta.updatedAt = new Date().toISOString();
        draft.entities = indexElements(draft.document);
        draft.history.pendingOps.push({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          parentRevisionId: draft.document.meta.revision,
          timestamp: new Date().toISOString(),
          operations: [inverse],
        });
        draft.saveStatus = 'unsaved';
      }),
    );
  },

  redo: () => {
    const state = get();
    const nextOp = state.history.future[state.history.future.length - 1];
    if (!nextOp) return;

    set(
      produce((draft: AnnotationEditorState) => {
        if (!draft.document) return;
        draft.history.future.pop();
        draft.history.past.push(nextOp);
        draft.document = applyOperation(draft.document, nextOp);
        draft.document.meta.updatedAt = new Date().toISOString();
        draft.entities = indexElements(draft.document);
        draft.history.pendingOps.push({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          parentRevisionId: draft.document.meta.revision,
          timestamp: new Date().toISOString(),
          operations: [nextOp],
        });
        draft.saveStatus = 'unsaved';
      }),
    );
  },

  flushPendingOps: () => {
    const pending = get().history.pendingOps;
    set(
      produce((state: AnnotationEditorState) => {
        state.history.pendingOps = [];
      }),
    );
    return pending;
  },

  markRevision: (revision) => {
    set(
      produce((state: AnnotationEditorState) => {
        if (!state.document) return;
        state.document.meta.revision = revision;
        state.document.meta.updatedAt = new Date().toISOString();
        state.saveStatus = 'saved';
      }),
    );
  },
}));
