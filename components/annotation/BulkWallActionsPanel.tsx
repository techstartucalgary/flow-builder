'use client';

import { safeClone } from '@/lib/clone';
import type { AnnotationElement, WallElement, WallRelations, WallSurfaceClass } from '@/types/annotation';

interface BulkWallActionsPanelProps {
  selectedCount: number;
  walls: WallElement[];
  onApplyMany: (elements: AnnotationElement[]) => void;
}

function withSurfaceClass(element: WallElement, surfaceClass: WallSurfaceClass): WallElement {
  const updated = safeClone(element);
  const nextRelations = {
    ...((updated.relations as WallRelations | undefined) ?? {}),
    surfaceClass,
    surfaceClassSource: 'manual' as const,
    boardSides: (surfaceClass === 'partition' ? 2 : 1) as 1 | 2,
  };
  updated.relations = nextRelations;
  updated.attrs.status = updated.attrs.status === 'auto' ? 'edited' : updated.attrs.status;
  return updated;
}

function withExcludeFromTakeoff(element: WallElement, excludeFromTakeoff: boolean): WallElement {
  const updated = safeClone(element);
  const nextRelations = {
    ...((updated.relations as WallRelations | undefined) ?? {}),
    excludeFromTakeoff,
  };
  updated.relations = nextRelations;
  updated.attrs.status = updated.attrs.status === 'auto' ? 'edited' : updated.attrs.status;
  return updated;
}

function withResetAuto(element: WallElement): WallElement {
  const updated = safeClone(element);
  const nextRelations = { ...((updated.relations as WallRelations | undefined) ?? {}) };
  delete nextRelations.surfaceClass;
  delete nextRelations.surfaceClassSource;
  delete nextRelations.boardSides;
  updated.relations = Object.keys(nextRelations).length ? nextRelations : undefined;
  updated.attrs.status = updated.attrs.status === 'auto' ? 'edited' : updated.attrs.status;
  return updated;
}

export default function BulkWallActionsPanel({ selectedCount, walls, onApplyMany }: BulkWallActionsPanelProps) {
  if (walls.length < 2) return null;

  return (
    <div className="ws-panel p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="ws-section-header">Bulk Wall QA</div>
          <div className="mt-1 text-[11px] text-gray-400">
            {walls.length} wall{walls.length === 1 ? '' : 's'} selected out of {selectedCount} element{selectedCount === 1 ? '' : 's'}.
          </div>
        </div>
        <span className="ws-chip" data-tone="accent">{walls.length} walls</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onApplyMany(walls.map((wall) => withSurfaceClass(wall, 'perimeter')))}
          className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-left text-cyan-100 transition hover:bg-cyan-500/20"
        >
          Mark selected as perimeter
        </button>
        <button
          type="button"
          onClick={() => onApplyMany(walls.map((wall) => withSurfaceClass(wall, 'partition')))}
          className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-left text-emerald-100 transition hover:bg-emerald-500/20"
        >
          Mark selected as partition
        </button>
        <button
          type="button"
          onClick={() => onApplyMany(walls.map((wall) => withExcludeFromTakeoff(wall, true)))}
          className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-amber-100 transition hover:bg-amber-500/20"
        >
          Exclude selected from takeoff
        </button>
        <button
          type="button"
          onClick={() => onApplyMany(walls.map((wall) => withExcludeFromTakeoff(wall, false)))}
          className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-left text-white transition hover:bg-white/5"
        >
          Include selected in takeoff
        </button>
      </div>

      <button
        type="button"
        onClick={() => onApplyMany(walls.map((wall) => withResetAuto(wall)))}
        className="w-full rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-left text-white transition hover:bg-white/5"
      >
        Reset selected walls to auto classification
      </button>
    </div>
  );
}
