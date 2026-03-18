import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationElementType,
  AnnotationLayers,
} from '@/types/annotation';
import { openingFitsHostWall } from '@/lib/openingValidation';

const SUPPORTED_TYPES: ReadonlySet<AnnotationElementType> = new Set(['wall', 'door', 'window', 'room']);

function defaultLayers(): AnnotationLayers {
  return {
    wall: true,
    door: true,
    window: true,
    room: true,
  };
}

function isSupportedType(value: unknown): value is AnnotationElementType {
  return typeof value === 'string' && SUPPORTED_TYPES.has(value as AnnotationElementType);
}

function sanitizeLayers(layers: unknown): AnnotationLayers {
  const incoming = (layers && typeof layers === 'object') ? (layers as Record<string, unknown>) : {};
  const defaults = defaultLayers();
  return {
    wall: typeof incoming.wall === 'boolean' ? incoming.wall : defaults.wall,
    door: typeof incoming.door === 'boolean' ? incoming.door : defaults.door,
    window: typeof incoming.window === 'boolean' ? incoming.window : defaults.window,
    room: typeof incoming.room === 'boolean' ? incoming.room : defaults.room,
  };
}

function sanitizeElements(elements: unknown): AnnotationElement[] {
  if (!Array.isArray(elements)) return [];
  const sanitized: AnnotationElement[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const element = raw as AnnotationElement & { type?: unknown; geometry?: { kind?: unknown } };
    if (!isSupportedType(element.type)) continue;
    if (!element.geometry || (element.geometry.kind !== 'segment' && element.geometry.kind !== 'rect')) continue;
    if (
      (element.type === 'door' || element.type === 'window')
      && element.relations
      && typeof element.relations === 'object'
      && 'source' in element.relations
      && element.relations.source === 'tag_projected'
    ) {
      continue;
    }
    sanitized.push({ ...element } as AnnotationElement);
  }

  const wallsById = new Map(
    sanitized
      .filter((element): element is Extract<AnnotationElement, { type: 'wall' }> => element.type === 'wall' && element.geometry.kind === 'segment')
      .map((element) => [element.id, element]),
  );

  return sanitized.filter((element) => {
    if (element.type !== 'door' && element.type !== 'window') return true;
    if (element.attrs.status !== 'auto') return true;
    const hostWallId = element.relations && typeof element.relations === 'object' && 'hostWallId' in element.relations
      ? String(element.relations.hostWallId || '')
      : '';
    if (!hostWallId) return false;
    return openingFitsHostWall(element, wallsById.get(hostWallId));
  });
}

export function sanitizeAnnotationDocument(doc: AnnotationDocument): AnnotationDocument {
  const elements = sanitizeElements(doc.elements);
  const validIds = new Set(elements.map((element) => element.id));
  return {
    ...doc,
    layers: sanitizeLayers(doc.layers),
    elements,
    issues: Array.isArray(doc.issues) ? doc.issues.filter((issue) => validIds.has(issue.elementId)) : [],
  };
}
