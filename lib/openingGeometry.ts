import { clamp, rectCenter, segmentLength } from '@/lib/geometry';
import type { AnnotationElement, OpeningRelations, RectGeometry, WallElement } from '@/types/annotation';

type OpeningElement = Extract<AnnotationElement, { type: 'door' | 'window' }>;

export interface OpeningOverlayGeometry {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotationDeg: number;
}

function projectPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const denom = dx * dx + dy * dy;
  if (denom <= 0) return { x: x1, y: y1 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / denom));
  return {
    x: x1 + (dx * t),
    y: y1 + (dy * t),
  };
}

function orientedRectBounds(overlay: OpeningOverlayGeometry): RectGeometry {
  const halfWidth = overlay.width / 2;
  const halfHeight = overlay.height / 2;
  const angle = overlay.rotationDeg * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([dx, dy]) => ({
    x: overlay.centerX + (dx * cos) - (dy * sin),
    y: overlay.centerY + (dx * sin) + (dy * cos),
  }));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    kind: 'rect',
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
    rotationDeg: 0,
  };
}

export function getHostWallForOpening(
  opening: OpeningElement,
  wallsById: Record<string, AnnotationElement>,
): WallElement | null {
  const hostWallId = typeof opening.relations === 'object' && opening.relations && 'hostWallId' in opening.relations
    ? String(opening.relations.hostWallId || '')
    : '';
  if (!hostWallId) return null;
  const hostWall = wallsById[hostWallId];
  if (!hostWall || hostWall.type !== 'wall' || hostWall.geometry.kind !== 'segment') return null;
  return hostWall;
}

export function computeOpeningOverlayGeometry(
  opening: OpeningElement,
  hostWall: WallElement,
): OpeningOverlayGeometry | null {
  if (opening.geometry.kind !== 'rect' || hostWall.geometry.kind !== 'segment') return null;
  const relations = opening.relations as OpeningRelations | undefined;
  const verification = relations?.verification;

  const wall = hostWall.geometry;
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const wallLength = segmentLength(wall);
  if (wallLength <= 0) return null;

  const tangentX = dx / wallLength;
  const tangentY = dy / wallLength;
  const normalX = -tangentY;
  const normalY = tangentX;
  const rawCenter = rectCenter(opening.geometry);
  const projectedCenter = Array.isArray(verification?.projectedCenter)
    ? { x: verification.projectedCenter[0], y: verification.projectedCenter[1] }
    : projectPointToSegment(rawCenter.x, rawCenter.y, wall.x1, wall.y1, wall.x2, wall.y2);
  const rawCorners = [
    [opening.geometry.x, opening.geometry.y],
    [opening.geometry.x + opening.geometry.width, opening.geometry.y],
    [opening.geometry.x + opening.geometry.width, opening.geometry.y + opening.geometry.height],
    [opening.geometry.x, opening.geometry.y + opening.geometry.height],
  ];

  let halfSpan = 0;
  let halfDepth = 0;
  for (const [cornerX, cornerY] of rawCorners) {
    const relX = cornerX - rawCenter.x;
    const relY = cornerY - rawCenter.y;
    halfSpan = Math.max(halfSpan, Math.abs((relX * tangentX) + (relY * tangentY)));
    halfDepth = Math.max(halfDepth, Math.abs((relX * normalX) + (relY * normalY)));
  }

  const hostThickness = Math.max(8, hostWall.geometry.thicknessPx);
  const minSpan = opening.type === 'door' ? 22 : 18;
  const rawMajorSpan = typeof verification?.axisSpanPx === 'number'
    ? verification.axisSpanPx
    : Math.max(opening.geometry.width, opening.geometry.height);
  const spanLimit = Math.max(minSpan, wallLength - Math.max(12, hostThickness * 0.75));
  const span = clamp(
    Math.max(rawMajorSpan * 0.86, halfSpan * 2, minSpan),
    minSpan,
    spanLimit,
  );
  const minDepth = opening.type === 'door' ? hostThickness + 8 : hostThickness + 6;
  const rawDepth = typeof verification?.normalSpanPx === 'number' ? verification.normalSpanPx : halfDepth * 2;
  const depth = clamp(
    Math.max(rawDepth, minDepth),
    minDepth,
    Math.max(minDepth, span * 0.42),
  );

  return {
    centerX: projectedCenter.x,
    centerY: projectedCenter.y,
    width: span,
    height: depth,
    rotationDeg: Math.atan2(dy, dx) * (180 / Math.PI),
  };
}

export function createHostedOpeningGeometry(
  type: OpeningElement['type'],
  x: number,
  y: number,
  hostWall: WallElement | null,
): RectGeometry {
  if (!hostWall || hostWall.geometry.kind !== 'segment') {
    return {
      kind: 'rect',
      x: x - 36,
      y: y - 12,
      width: 72,
      height: 24,
      rotationDeg: 0,
    };
  }

  const defaultSpan = type === 'door' ? 72 : 56;
  const hostThickness = Math.max(8, hostWall.geometry.thicknessPx);
  const wall = hostWall.geometry;
  const horizontalish = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
  if (horizontalish) {
    return {
      kind: 'rect',
      x: x - (defaultSpan / 2),
      y: y - ((hostThickness + 8) / 2),
      width: defaultSpan,
      height: hostThickness + 8,
      rotationDeg: 0,
    };
  }
  if (Math.abs(wall.y2 - wall.y1) > Math.abs(wall.x2 - wall.x1)) {
    return {
      kind: 'rect',
      x: x - ((hostThickness + 8) / 2),
      y: y - (defaultSpan / 2),
      width: hostThickness + 8,
      height: defaultSpan,
      rotationDeg: 0,
    };
  }

  const overlay = computeOpeningOverlayGeometry(
    {
      id: `${type}_draft`,
      type,
      geometry: {
        kind: 'rect',
        x: x - (defaultSpan / 2),
        y: y - 12,
        width: defaultSpan,
        height: hostThickness + 8,
        rotationDeg: 0,
      },
      attrs: {
        status: 'new',
        locked: false,
        visible: true,
        confidence: 1,
      },
      relations: { hostWallId: hostWall.id },
    },
    hostWall,
  );
  return overlay ? orientedRectBounds(overlay) : {
    kind: 'rect',
    x: x - 36,
    y: y - 12,
    width: 72,
    height: 24,
    rotationDeg: 0,
  };
}
