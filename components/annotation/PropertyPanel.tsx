'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { safeClone } from '@/lib/clone';
import type {
  AnnotationElement,
  AnnotationIssue,
  FlooringMaterial,
  OpeningRelations,
  RoomRelations,
  WallRelations,
  WallSurfaceClass,
} from '@/types/annotation';

const FLOORING_MATERIALS: FlooringMaterial[] = ['hardwood', 'carpet', 'tile', 'vinyl', 'laminate'];

interface PropertyPanelProps {
  element: AnnotationElement | null;
  issues: AnnotationIssue[];
  revision: number;
  onApply: (element: AnnotationElement) => void;
  onFocusElement?: (elementId: string) => void;
}

interface FormValues {
  name: string;
  confidence: number;
  locked: boolean;
  visible: boolean;
  notes: string;
  rotationDeg: number;
  x: number;
  y: number;
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessPx: number;
  surfaceClass: WallSurfaceClass;
  boardSides: 1 | 2;
  excludeFromTakeoff: boolean;
  material: FlooringMaterial | '';
  areaSqFt: number;
  quantityRequired: number;
}

export default function PropertyPanel({ element, issues, revision, onApply, onFocusElement }: PropertyPanelProps) {
  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      name: '',
      confidence: 1,
      locked: false,
      visible: true,
      notes: '',
      rotationDeg: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      thicknessPx: 12,
      surfaceClass: 'unknown',
      boardSides: 1,
      excludeFromTakeoff: false,
      material: '',
      areaSqFt: 0,
      quantityRequired: 0,
    },
  });

  useEffect(() => {
    if (!element) return;
    const wallRelations =
      element.type === 'wall'
        ? (element.relations as WallRelations | undefined)
        : undefined;
    const roomRelations =
      element.type === 'room'
        ? (element.relations as RoomRelations | undefined)
        : undefined;
    const values: FormValues = {
      name: element.attrs.name || '',
      confidence: element.attrs.confidence ?? 1,
      locked: element.attrs.locked,
      visible: element.attrs.visible,
      notes: element.attrs.notes || '',
      rotationDeg: element.geometry.kind === 'polygon' ? 0 : element.geometry.rotationDeg,
      x: element.geometry.kind === 'rect' ? element.geometry.x : 0,
      y: element.geometry.kind === 'rect' ? element.geometry.y : 0,
      width: element.geometry.kind === 'rect' ? element.geometry.width : 0,
      height: element.geometry.kind === 'rect' ? element.geometry.height : 0,
      x1: element.geometry.kind === 'segment' ? element.geometry.x1 : 0,
      y1: element.geometry.kind === 'segment' ? element.geometry.y1 : 0,
      x2: element.geometry.kind === 'segment' ? element.geometry.x2 : 0,
      y2: element.geometry.kind === 'segment' ? element.geometry.y2 : 0,
      thicknessPx: element.geometry.kind === 'segment' ? element.geometry.thicknessPx : 0,
      surfaceClass: wallRelations?.surfaceClass ?? 'unknown',
      boardSides: wallRelations?.boardSides ?? ((wallRelations?.surfaceClass ?? 'unknown') === 'partition' ? 2 : 1),
      excludeFromTakeoff: wallRelations?.excludeFromTakeoff ?? false,
      material: roomRelations?.material ?? '',
      areaSqFt: Number(roomRelations?.areaSqFt ?? 0),
      quantityRequired: Number(roomRelations?.quantityRequired ?? roomRelations?.areaSqFt ?? 0),
    };
    reset(values);
  }, [element, reset]);

  if (!element) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-gray-400">
        Select an element to edit properties.
      </div>
    );
  }

  const openingRelations =
    element.type === 'door' || element.type === 'window'
      ? (element.relations as OpeningRelations | undefined)
      : undefined;
  const wallRelations =
    element.type === 'wall'
      ? (element.relations as WallRelations | undefined)
      : undefined;
  const roomRelations =
    element.type === 'room'
      ? (element.relations as RoomRelations | undefined)
      : undefined;
  const verification = openingRelations?.verification;

  function applyImmediate(mutator: (draft: AnnotationElement) => void) {
    if (!element) return;
    const updated = safeClone(element);
    mutator(updated);
    onApply(updated);
  }

  function setWallSurfaceClass(nextSurfaceClass: WallSurfaceClass) {
    applyImmediate((updated) => {
      if (updated.type !== 'wall') return;
      const nextRelations = {
        ...((updated.relations as WallRelations | undefined) ?? {}),
        surfaceClass: nextSurfaceClass,
        surfaceClassSource: 'manual' as const,
        boardSides: (nextSurfaceClass === 'partition' ? 2 : 1) as 1 | 2,
      };
      updated.relations = nextRelations;
      updated.attrs.status = updated.attrs.status === 'auto' ? 'edited' : updated.attrs.status;
    });
  }

  function resetWallClassification() {
    applyImmediate((updated) => {
      if (updated.type !== 'wall') return;
      const nextRelations = { ...((updated.relations as WallRelations | undefined) ?? {}) };
      delete nextRelations.surfaceClass;
      delete nextRelations.surfaceClassSource;
      delete nextRelations.boardSides;
      updated.relations = Object.keys(nextRelations).length ? nextRelations : undefined;
      updated.attrs.status = updated.attrs.status === 'auto' ? 'edited' : updated.attrs.status;
    });
  }

  function toggleExcludeFromTakeoff() {
    applyImmediate((updated) => {
      if (updated.type !== 'wall') return;
      const nextRelations = { ...((updated.relations as WallRelations | undefined) ?? {}) };
      nextRelations.excludeFromTakeoff = !(nextRelations.excludeFromTakeoff ?? false);
      updated.relations = nextRelations;
      updated.attrs.status = updated.attrs.status === 'auto' ? 'edited' : updated.attrs.status;
    });
  }

  function toggleLock() {
    applyImmediate((updated) => {
      updated.attrs.locked = !updated.attrs.locked;
    });
  }

  function toggleVisibility() {
    applyImmediate((updated) => {
      updated.attrs.visible = !updated.attrs.visible;
    });
  }

  function markReviewed() {
    applyImmediate((updated) => {
      updated.attrs.status = 'edited';
    });
  }

  function setRoomMaterial(nextMaterial: FlooringMaterial | null) {
    applyImmediate((updated) => {
      if (updated.type !== 'room') return;
      const nextRelations = { ...((updated.relations as RoomRelations | undefined) ?? {}) };
      if (nextMaterial) {
        nextRelations.material = nextMaterial;
      } else {
        delete nextRelations.material;
      }
      const areaSqFt = Number(nextRelations.areaSqFt ?? 0);
      nextRelations.quantityRequired = areaSqFt > 0 ? areaSqFt : Number(nextRelations.quantityRequired ?? 0);
      nextRelations.quantityUnit = 'sqft';
      updated.relations = nextRelations;
      updated.attrs.status = updated.attrs.status === 'auto' ? 'edited' : updated.attrs.status;
    });
  }

  return (
    <form
      onSubmit={handleSubmit((values) => {
        if (!element) return;
        const updated = safeClone(element);
        updated.attrs.name = values.name;
        updated.attrs.confidence = Number(values.confidence);
        updated.attrs.locked = values.locked;
        updated.attrs.visible = values.visible;
        updated.attrs.notes = values.notes;

        if (updated.geometry.kind === 'segment') {
          updated.geometry.x1 = Number(values.x1);
          updated.geometry.y1 = Number(values.y1);
          updated.geometry.x2 = Number(values.x2);
          updated.geometry.y2 = Number(values.y2);
          updated.geometry.thicknessPx = Number(values.thicknessPx);
          updated.geometry.rotationDeg = Number(values.rotationDeg);
          if (updated.type === 'wall') {
            const nextRelations = (
              updated.relations && typeof updated.relations === 'object'
                ? { ...(updated.relations as WallRelations) }
                : {}
            );
            const nextSurfaceClass = values.surfaceClass;
            const nextBoardSides = Number(values.boardSides) === 2 ? 2 : 1;
            const nextExcludeFromTakeoff = values.excludeFromTakeoff;
            const shouldPersistManualOverride = (
              wallRelations?.surfaceClassSource === 'manual'
              || nextSurfaceClass !== (wallRelations?.surfaceClass ?? 'unknown')
              || nextBoardSides !== (wallRelations?.boardSides ?? ((wallRelations?.surfaceClass ?? 'unknown') === 'partition' ? 2 : 1))
              || nextExcludeFromTakeoff !== (wallRelations?.excludeFromTakeoff ?? false)
            );

            if (shouldPersistManualOverride) {
              nextRelations.surfaceClass = nextSurfaceClass;
              nextRelations.surfaceClassSource = 'manual';
              nextRelations.boardSides = nextBoardSides;
              nextRelations.excludeFromTakeoff = nextExcludeFromTakeoff;
              updated.relations = nextRelations;
            } else {
              delete nextRelations.surfaceClass;
              delete nextRelations.surfaceClassSource;
              delete nextRelations.boardSides;
              delete nextRelations.excludeFromTakeoff;
              updated.relations = Object.keys(nextRelations).length ? nextRelations : undefined;
            }
          }
        } else if (updated.geometry.kind === 'rect') {
          updated.geometry.x = Number(values.x);
          updated.geometry.y = Number(values.y);
          updated.geometry.width = Number(values.width);
          updated.geometry.height = Number(values.height);
          updated.geometry.rotationDeg = Number(values.rotationDeg);
        }

        if (updated.type === 'room') {
          const nextRelations = (
            updated.relations && typeof updated.relations === 'object'
              ? { ...(updated.relations as RoomRelations) }
              : {}
          );
          const computedAreaSqFt = Number(nextRelations.areaSqFt ?? roomRelations?.areaSqFt ?? 0);
          if (values.material) nextRelations.material = values.material;
          else delete nextRelations.material;
          nextRelations.areaSqFt = computedAreaSqFt;
          nextRelations.quantityRequired = computedAreaSqFt > 0 ? computedAreaSqFt : Number(nextRelations.quantityRequired ?? 0);
          nextRelations.quantityUnit = 'sqft';
          updated.relations = nextRelations;
        }

        onApply(updated);
      })}
      className="ws-panel p-3 space-y-3 text-xs"
    >
      <div className="ws-section-header">Selection / Evidence</div>
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-[11px] text-gray-300 space-y-1.5">
        <div className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">Identity</div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Element</span>
          <span className="font-mono text-gray-200">{element.id}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Type</span>
          <span className="text-gray-200">{element.type}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Revision</span>
          <span className="text-gray-200">{revision}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Status</span>
          <span className="text-gray-200">{element.attrs.status}</span>
        </div>
        {wallRelations?.surfaceClass && (
          <div className="flex items-center justify-between gap-2">
            <span className="uppercase tracking-wide text-gray-500">Surface</span>
            <span className="text-gray-200">
              {wallRelations.surfaceClass}
              {wallRelations.surfaceClassSource === 'manual' ? ' (manual)' : ' (auto)'}
            </span>
          </div>
        )}
        {openingRelations?.source && (
          <div className="flex items-center justify-between gap-2">
            <span className="uppercase tracking-wide text-gray-500">Source</span>
            <span className="text-gray-200">{openingRelations.source}</span>
          </div>
        )}
        {openingRelations?.hostWallId && (
          <div className="flex items-center justify-between gap-2">
            <span className="uppercase tracking-wide text-gray-500">Host Wall</span>
            <span className="font-mono text-gray-200">{openingRelations.hostWallId}</span>
          </div>
        )}
        {element.type === 'room' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-wide text-gray-500">Area</span>
              <span className="text-gray-200">{(roomRelations?.areaSqFt ?? 0).toFixed(2)} sq ft</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-wide text-gray-500">Material</span>
              <span className="text-gray-200 capitalize">{roomRelations?.material ?? 'Unassigned'}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-wide text-gray-500">Quantity</span>
              <span className="text-gray-200">
                {(roomRelations?.quantityRequired ?? 0).toFixed(2)} {roomRelations?.quantityUnit ?? 'sqft'}
              </span>
            </div>
          </>
        )}
      </div>

      {verification && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 text-[11px] text-cyan-100 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">Verification</div>
          {verification.verificationMode && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Mode</span>
              <span>{verification.verificationMode}</span>
            </div>
          )}
          {typeof verification.wallBreakScore === 'number' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Wall break</span>
              <span>{verification.wallBreakScore.toFixed(2)}</span>
            </div>
          )}
          {typeof verification.openingPixelsScore === 'number' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Opening pixels</span>
              <span>{verification.openingPixelsScore.toFixed(2)}</span>
            </div>
          )}
          {typeof verification.classificationScore === 'number' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Classification</span>
              <span>{verification.classificationScore.toFixed(2)}</span>
            </div>
          )}
          {typeof verification.doorFeatureScore === 'number' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Door feature</span>
              <span>{verification.doorFeatureScore.toFixed(2)}</span>
            </div>
          )}
          {typeof verification.windowFeatureScore === 'number' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Window feature</span>
              <span>{verification.windowFeatureScore.toFixed(2)}</span>
            </div>
          )}
          {typeof verification.tagAlignmentScore === 'number' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Tag alignment</span>
              <span>{verification.tagAlignmentScore.toFixed(2)}</span>
            </div>
          )}
          {verification.hostGapId && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-200/70">Host gap</span>
              <span className="font-mono">{verification.hostGapId}</span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] text-gray-300 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">Issues</div>
        {issues.length === 0 ? (
          <div className="text-gray-500">No issues attached to this element.</div>
        ) : (
          issues.map((issue) => (
            <div key={issue.id} className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1">
              <div className="font-semibold text-red-200">{issue.code}</div>
              <div className="text-red-300/80">{issue.message}</div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] text-gray-300 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">Builder Actions</div>
          {onFocusElement ? (
            <button
              type="button"
              onClick={() => onFocusElement(element.id)}
              className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-cyan-100 transition hover:bg-cyan-500/20"
            >
              Focus on Canvas
            </button>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={toggleLock}
            className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-left text-white transition hover:bg-white/5"
          >
            {element.attrs.locked ? 'Unlock element' : 'Lock element'}
          </button>
          <button
            type="button"
            onClick={toggleVisibility}
            className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-left text-white transition hover:bg-white/5"
          >
            {element.attrs.visible ? 'Hide from takeoff view' : 'Show in takeoff view'}
          </button>
        </div>

        {element.type === 'wall' ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setWallSurfaceClass('perimeter')}
                className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-left text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Mark perimeter
              </button>
              <button
                type="button"
                onClick={() => setWallSurfaceClass('partition')}
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-left text-emerald-100 transition hover:bg-emerald-500/20"
              >
                Mark partition
              </button>
              <button
                type="button"
                onClick={resetWallClassification}
                className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-left text-white transition hover:bg-white/5"
              >
                Reset to auto
              </button>
            </div>
            <button
              type="button"
              onClick={toggleExcludeFromTakeoff}
              className="w-full rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left text-amber-100 transition hover:bg-amber-500/20"
            >
              {(wallRelations?.excludeFromTakeoff ?? false) ? 'Include in takeoff again' : 'Exclude from takeoff'}
            </button>
          </>
        ) : null}

        {(element.type === 'door' || element.type === 'window') ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={markReviewed}
              className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-left text-fuchsia-100 transition hover:bg-fuchsia-500/20"
            >
              Mark reviewed
            </button>
            {openingRelations?.hostWallId && onFocusElement ? (
              <button
                type="button"
                onClick={() => onFocusElement(openingRelations.hostWallId!)}
                className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-left text-white transition hover:bg-white/5"
              >
                Jump to host wall
              </button>
            ) : null}
          </div>
        ) : null}

        {element.type === 'room' ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {FLOORING_MATERIALS.map((material) => (
                <button
                  key={material}
                  type="button"
                  onClick={() => setRoomMaterial(material)}
                  className={`rounded-lg border px-3 py-2 text-left capitalize transition ${
                    roomRelations?.material === material
                      ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-100'
                      : 'border-white/10 bg-black/10 text-white hover:bg-white/5'
                  }`}
                >
                  {material}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRoomMaterial(null)}
              className="w-full rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-left text-white transition hover:bg-white/5"
            >
              Clear flooring assignment
            </button>
          </>
        ) : null}
      </div>

      <details className="rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-[11px] text-gray-300">
        <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">
          Advanced Fields
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-gray-400">Name<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" {...register('name')} /></label>
            <label className="text-gray-400">Confidence<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" step="0.01" {...register('confidence', { valueAsNumber: true })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-gray-400">Visible<input className="ml-2" type="checkbox" {...register('visible')} /></label>
            <label className="text-gray-400">Locked<input className="ml-2" type="checkbox" {...register('locked')} /></label>
          </div>

          {element.geometry.kind === 'rect' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-gray-400">X<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('x', { valueAsNumber: true })} /></label>
              <label className="text-gray-400">Y<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('y', { valueAsNumber: true })} /></label>
              <label className="text-gray-400">Width<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('width', { valueAsNumber: true })} /></label>
              <label className="text-gray-400">Height<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('height', { valueAsNumber: true })} /></label>
            </div>
          ) : element.geometry.kind === 'polygon' ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] text-gray-300 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">Polygon Geometry</div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Vertices</span>
                <span>{element.geometry.points.length}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Area</span>
                <span>{(roomRelations?.areaSqFt ?? 0).toFixed(2)} sq ft</span>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-gray-400">X1<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('x1', { valueAsNumber: true })} /></label>
                <label className="text-gray-400">Y1<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('y1', { valueAsNumber: true })} /></label>
                <label className="text-gray-400">X2<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('x2', { valueAsNumber: true })} /></label>
                <label className="text-gray-400">Y2<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('y2', { valueAsNumber: true })} /></label>
                <label className="text-gray-400">Thickness<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('thicknessPx', { valueAsNumber: true })} /></label>
              </div>

              {element.type === 'wall' ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] text-gray-300 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">Manual Wall Overrides</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-gray-400">
                      Surface Class
                      <select className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" {...register('surfaceClass')}>
                        <option value="perimeter">Perimeter</option>
                        <option value="partition">Partition</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </label>
                    <label className="text-gray-400">
                      Board Sides
                      <select className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" {...register('boardSides', { valueAsNumber: true })}>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </label>
                  </div>
                  <label className="flex items-center justify-between gap-2 text-gray-400">
                    <span>Exclude From Takeoff</span>
                    <input type="checkbox" {...register('excludeFromTakeoff')} />
                  </label>
                </div>
              ) : null}
            </>
          )}

          {element.geometry.kind !== 'polygon' ? (
            <label className="text-gray-400">Rotation<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('rotationDeg', { valueAsNumber: true })} /></label>
          ) : null}
          {element.type === 'room' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-gray-400">
                Material
                <select className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" {...register('material')}>
                  <option value="">Unassigned</option>
                  {FLOORING_MATERIALS.map((material) => (
                    <option key={material} value={material}>{material}</option>
                  ))}
                </select>
              </label>
              <label className="text-gray-400">Area (sq ft)<input readOnly className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" step="0.01" {...register('areaSqFt', { valueAsNumber: true })} /></label>
              <label className="text-gray-400">Quantity (sq ft)<input readOnly className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" step="0.01" {...register('quantityRequired', { valueAsNumber: true })} /></label>
            </div>
          ) : null}
          <label className="text-gray-400">Notes<textarea className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" rows={3} {...register('notes')} /></label>

          <button type="submit" className="w-full rounded bg-indigo-500/20 border border-indigo-400/40 py-1.5 text-indigo-200 hover:bg-indigo-500/30">
            Apply Advanced Changes
          </button>
        </div>
      </details>
    </form>
  );
}
