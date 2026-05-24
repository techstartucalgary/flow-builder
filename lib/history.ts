import type { AnnotationDocument, AnnotationOperation } from '@/types/annotation';
import { safeClone } from '@/lib/clone';

export function applyOperation(doc: AnnotationDocument, op: AnnotationOperation): AnnotationDocument {
  const next = safeClone(doc);

  if (op.kind === 'create' && op.element) {
    next.elements.push(op.element);
    return next;
  }

  if (op.kind === 'delete') {
    next.elements = next.elements.filter((e) => e.id !== op.elementId);
    return next;
  }

  if (op.kind === 'update' && op.after) {
    const idx = next.elements.findIndex((e) => e.id === op.elementId);
    if (idx >= 0) {
      next.elements[idx] = op.after;
    }
    return next;
  }

  return next;
}

export function invertOperation(op: AnnotationOperation): AnnotationOperation | null {
  if (op.kind === 'create' && op.element) {
    return {
      kind: 'delete',
      elementId: op.element.id,
      element: op.element,
    };
  }

  if (op.kind === 'delete' && op.element) {
    return {
      kind: 'create',
      elementId: op.element.id,
      element: op.element,
    };
  }

  if (op.kind === 'update' && op.before) {
    return {
      kind: 'update',
      elementId: op.elementId,
      before: op.after,
      after: op.before,
    };
  }

  return null;
}
