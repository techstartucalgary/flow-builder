import type {
  AnnotationDocument,
  AnnotationElement,
  AnnotationElementType,
  AnnotationIssue,
  CVTakeoffResultPayload,
  PersistedAnnotationSnapshot,
} from '@/types/annotation';

const SUPPORTED_TYPES: ReadonlySet<AnnotationElementType> = new Set(['wall', 'door', 'window', 'room']);

function nowIso(): string {
  return new Date().toISOString();
}

function defaultLayers() {
  return {
    wall: true,
    door: true,
    window: true,
    room: true,
  };
}

function makeBaseElement(type: AnnotationElementType, id: string): Pick<AnnotationElement, 'id' | 'type' | 'attrs'> {
  return {
    id,
    type,
    attrs: {
      status: 'auto',
      geometryEdited: false,
      locked: false,
      visible: true,
      confidence: 0.9,
    },
  };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
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
  const issues: AnnotationIssue[] = [];

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

  const openings = Array.isArray(cv.openings) ? cv.openings : [];
  if (openings.length > 0) {
    for (const opening of openings) {
      const type = opening.tag_class === 'door' ? 'door' : 'window';
      if (!SUPPORTED_TYPES.has(type)) continue;
      const [bboxX, bboxY, bboxWidth, bboxHeight] = opening.bbox;
      let x = bboxX;
      let y = bboxY;
      let width = bboxWidth;
      let height = bboxHeight;
      if (
        Array.isArray(opening.projected_center)
        && opening.projected_center.length === 2
        && typeof opening.axis_span_px === 'number'
        && typeof opening.normal_span_px === 'number'
      ) {
        const [centerX, centerY] = opening.projected_center;
        if (typeof centerX === 'number' && typeof centerY === 'number') {
          if (bboxWidth >= bboxHeight) {
            width = Math.max(1, Math.round(opening.axis_span_px));
            height = Math.max(1, Math.round(opening.normal_span_px));
            x = Math.round(centerX - (width / 2));
            y = Math.round(centerY - (height / 2));
          } else {
            width = Math.max(1, Math.round(opening.normal_span_px));
            height = Math.max(1, Math.round(opening.axis_span_px));
            x = Math.round(centerX - (width / 2));
            y = Math.round(centerY - (height / 2));
          }
        }
      }
      if (width <= 0 || height <= 0) continue;
      const confidence = typeof opening.confidence === 'number' ? opening.confidence : 0.5;
      const source = opening.source || 'gap_verified';
      if (!opening.wall_id) {
        issues.push({
          id: `issue_${opening.id}_unhosted`,
          elementId: `${type}_${opening.id}`,
          severity: 'warning',
          code: 'UNHOSTED_OPENING',
          message: `${type} opening has no host wall and should be reviewed.`,
        });
      }
      elements.push({
        ...makeBaseElement(type, `${type}_${opening.id}`),
        type,
        geometry: {
          kind: 'rect',
          x,
          y,
          width,
          height,
          rotationDeg: 0,
        },
        relations: {
          ...(opening.wall_id ? { hostWallId: `wall_${opening.wall_id}` } : {}),
          source,
          confidence,
          tagIds: Array.isArray(opening.tag_ids) ? opening.tag_ids : [],
          verification: (
            opening.verification
            || typeof opening.host_score === 'number'
            || Array.isArray(opening.projected_center)
          ) ? {
            openingPixelsScore: opening.verification?.opening_pixels_score,
            wallBreakScore: opening.verification?.wall_break_score,
            classificationScore: opening.verification?.classification_score,
            doorFeatureScore: opening.verification?.door_feature_score,
            windowFeatureScore: opening.verification?.window_feature_score,
            tagAlignmentScore: opening.verification?.tag_alignment_score,
            verificationMode: opening.verification?.verification_mode,
            hostGapId: opening.verification?.host_gap_id,
            hostScore: opening.host_score,
            symbolSource: opening.symbol_source,
            legendSymbolId: opening.legend_symbol_id || undefined,
            projectedCenter: Array.isArray(opening.projected_center)
              ? [opening.projected_center[0], opening.projected_center[1]]
              : undefined,
            axisSpanPx: typeof opening.axis_span_px === 'number' ? opening.axis_span_px : undefined,
            normalSpanPx: typeof opening.normal_span_px === 'number' ? opening.normal_span_px : undefined,
            rotationDeg: typeof opening.rotation_deg === 'number' ? opening.rotation_deg : undefined,
          } : undefined,
        },
        attrs: {
          ...makeBaseElement(type, `${type}_${opening.id}`).attrs,
          visible: true,
          confidence,
        },
      });
    }
  }

  for (let i = 0; i < elements.length; i += 1) {
    const left = elements[i];
    if ((left.type !== 'door' && left.type !== 'window') || left.geometry.kind !== 'rect') continue;
    const leftRelations = left.relations as { hostWallId?: string; source?: string } | undefined;
    if (!leftRelations?.hostWallId) continue;
    for (let j = i + 1; j < elements.length; j += 1) {
      const right = elements[j];
      if ((right.type !== 'door' && right.type !== 'window') || right.geometry.kind !== 'rect') continue;
      const rightRelations = right.relations as { hostWallId?: string; source?: string } | undefined;
      if (!rightRelations?.hostWallId || rightRelations.hostWallId !== leftRelations.hostWallId) continue;
      if (!rectsOverlap(left.geometry, right.geometry)) continue;
      issues.push({
        id: `issue_overlap_${left.id}_${right.id}`,
        elementId: left.id,
        severity: 'info',
        code: 'OVERLAPPING_OPENINGS',
        message: 'Multiple openings overlap on the same wall segment.',
      });
      break;
    }
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
      scaleSource: cv.metadata.scale_px_per_ft ? 'manual' : undefined,
      scaleLocked: Boolean(cv.metadata.scale_px_per_ft),
    },
    meta: {
      schemaVersion: 1,
      source: 'cv_takeoff',
      createdAt,
      updatedAt: createdAt,
      revision: 0,
      coordinateSpaceId: cv.metadata.coordinate_space_id,
      hasManualGeometryEdits: false,
    },
    layers: defaultLayers(),
    elements: elements.filter((element) => SUPPORTED_TYPES.has(element.type)),
    issues,
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
