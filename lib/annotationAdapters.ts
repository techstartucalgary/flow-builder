import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationElementType,
  CVTakeoffResultPayload,
  PersistedAnnotationSnapshot,
} from '@/types/annotation';

function nowIso(): string {
  return new Date().toISOString();
}

function defaultLayers() {
  return {
    wall: true,
    door: true,
    window: true,
    room: true,
    label: true,
    dimension: true,
  };
}

function makeBaseElement(type: AnnotationElementType, id: string): Pick<AnnotationElement, 'id' | 'type' | 'attrs'> {
  return {
    id,
    type,
    attrs: {
      status: 'auto',
      locked: false,
      visible: true,
      confidence: 0.9,
    },
  };
}

export function fromCVTakeoffResult(
  cv: CVTakeoffResultPayload,
  options: {
    projectId: string;
    page: number;
    sourceUrl: string;
  },
): AnnotationDocument {
  const elements: AnnotationElement[] = [];

  for (const wall of cv.walls) {
    elements.push({
      ...makeBaseElement('wall', `wall_${wall.id}`),
      type: 'wall',
      geometry: {
        kind: 'segment',
        x1: wall.start[0],
        y1: wall.start[1],
        x2: wall.end[0],
        y2: wall.end[1],
        thicknessPx: wall.visual_thickness || wall.thickness || 12,
        rotationDeg: 0,
      },
      relations: {},
    });
  }

  for (const tag of cv.tags) {
    const type = tag.tag_class === 'door' ? 'door' : 'window';
    const size = Math.max(10, tag.radius * 2);
    elements.push({
      ...makeBaseElement(type, `${type}_${tag.id}`),
      type,
      geometry: {
        kind: 'rect',
        x: tag.center[0] - size / 2,
        y: tag.center[1] - size / 2,
        width: size,
        height: Math.max(8, size / 3),
        rotationDeg: 0,
      },
      relations: {},
    });
  }

  const createdAt = nowIso();
  const previewSrc = cv.preview_image ? `data:image/png;base64,${cv.preview_image}` : options.sourceUrl;

  return {
    documentId: `${options.projectId}_page_${options.page}`,
    projectId: options.projectId,
    page: options.page,
    baseImage: {
      sourceUrl: previewSrc,
      widthPx: cv.metadata.image_width,
      heightPx: cv.metadata.image_height,
      scalePxPerFt: cv.metadata.scale_px_per_ft,
    },
    meta: {
      schemaVersion: 1,
      source: 'cv_takeoff',
      createdAt,
      updatedAt: createdAt,
      revision: 0,
    },
    layers: defaultLayers(),
    elements,
    issues: [],
  };
}

export function toPersistencePayload(doc: AnnotationDocument): PersistedAnnotationSnapshot {
  return {
    document: {
      ...doc,
      meta: {
        ...doc.meta,
        updatedAt: nowIso(),
      },
    },
    base_revision: doc.meta.revision,
  };
}
