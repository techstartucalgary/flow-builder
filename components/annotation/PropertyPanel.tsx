'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { safeClone } from '@/lib/clone';
import type { AnnotationElement } from '@/types/annotation';

interface PropertyPanelProps {
  element: AnnotationElement | null;
  onApply: (element: AnnotationElement) => void;
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
}

export default function PropertyPanel({ element, onApply }: PropertyPanelProps) {
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
    },
  });

  useEffect(() => {
    if (!element) return;
    const values: FormValues = {
      name: element.attrs.name || '',
      confidence: element.attrs.confidence ?? 1,
      locked: element.attrs.locked,
      visible: element.attrs.visible,
      notes: element.attrs.notes || '',
      rotationDeg: element.geometry.rotationDeg,
      x: element.geometry.kind === 'segment' ? 0 : element.geometry.x,
      y: element.geometry.kind === 'segment' ? 0 : element.geometry.y,
      width: element.geometry.kind === 'rect' ? element.geometry.width : 0,
      height: element.geometry.kind === 'rect' ? element.geometry.height : 0,
      x1: element.geometry.kind === 'segment' ? element.geometry.x1 : 0,
      y1: element.geometry.kind === 'segment' ? element.geometry.y1 : 0,
      x2: element.geometry.kind === 'segment' ? element.geometry.x2 : 0,
      y2: element.geometry.kind === 'segment' ? element.geometry.y2 : 0,
      thicknessPx: element.geometry.kind === 'segment' ? element.geometry.thicknessPx : 0,
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
        } else {
          updated.geometry.x = Number(values.x);
          updated.geometry.y = Number(values.y);
          updated.geometry.width = Number(values.width);
          updated.geometry.height = Number(values.height);
          updated.geometry.rotationDeg = Number(values.rotationDeg);
        }

        onApply(updated);
      })}
      className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2 text-xs"
    >
      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Properties</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-gray-400">Name<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" {...register('name')} /></label>
        <label className="text-gray-400">Confidence<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" step="0.01" {...register('confidence', { valueAsNumber: true })} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-gray-400">Visible<input className="ml-2" type="checkbox" {...register('visible')} /></label>
        <label className="text-gray-400">Locked<input className="ml-2" type="checkbox" {...register('locked')} /></label>
      </div>

      {element.geometry.kind !== 'segment' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-gray-400">X<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('x', { valueAsNumber: true })} /></label>
          <label className="text-gray-400">Y<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('y', { valueAsNumber: true })} /></label>
          <label className="text-gray-400">Width<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('width', { valueAsNumber: true })} /></label>
          <label className="text-gray-400">Height<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('height', { valueAsNumber: true })} /></label>
        </div>
      )}

      {element.geometry.kind === 'segment' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-gray-400">X1<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('x1', { valueAsNumber: true })} /></label>
          <label className="text-gray-400">Y1<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('y1', { valueAsNumber: true })} /></label>
          <label className="text-gray-400">X2<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('x2', { valueAsNumber: true })} /></label>
          <label className="text-gray-400">Y2<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('y2', { valueAsNumber: true })} /></label>
          <label className="text-gray-400">Thickness<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('thicknessPx', { valueAsNumber: true })} /></label>
        </div>
      )}

      <label className="text-gray-400">Rotation<input className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" type="number" {...register('rotationDeg', { valueAsNumber: true })} /></label>
      <label className="text-gray-400">Notes<textarea className="mt-1 w-full rounded bg-white/5 px-2 py-1 text-gray-100" rows={3} {...register('notes')} /></label>

      <button type="submit" className="w-full rounded bg-indigo-500/20 border border-indigo-400/40 py-1.5 text-indigo-200 hover:bg-indigo-500/30">
        Apply
      </button>
    </form>
  );
}
