import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationElementType,
  AnnotationLayers,
} from '@/types/annotation';

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
  return sanitized;
}

export function sanitizeAnnotationDocument(doc: AnnotationDocument): AnnotationDocument {
  return {
    ...doc,
    layers: sanitizeLayers(doc.layers),
    elements: sanitizeElements(doc.elements),
  };
}
