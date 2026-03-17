import { distancePointToSegment, quantize } from '@/lib/geometry';
import type { AnnotationElement } from '@/types/annotation';

export function snapToGrid(x: number, y: number, gridSize: number): { x: number; y: number } {
  return { x: quantize(x, gridSize), y: quantize(y, gridSize) };
}

export function snapAngle(rotationDeg: number): number {
  const step = 45;
  return quantize(rotationDeg, step);
}

export function snapPointToWalls(
  x: number,
  y: number,
  walls: AnnotationElement[],
  threshold = 12,
): { x: number; y: number; snapped: boolean; wallId?: string; guidePoints?: number[] } {
  let bestDist = Number.POSITIVE_INFINITY;
  let best: { x: number; y: number } | null = null;
  let wallId: string | undefined;
  let guidePoints: number[] | undefined;

  for (const wall of walls) {
    if (wall.type !== 'wall' || wall.geometry.kind !== 'segment') continue;
    const seg = wall.geometry;
    const dist = distancePointToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
    if (dist < bestDist) {
      bestDist = dist;
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const den = dx * dx + dy * dy;
      if (den === 0) continue;
      const t = Math.max(0, Math.min(1, ((x - seg.x1) * dx + (y - seg.y1) * dy) / den));
      best = {
        x: seg.x1 + t * dx,
        y: seg.y1 + t * dy,
      };
      wallId = wall.id;
      guidePoints = [seg.x1, seg.y1, seg.x2, seg.y2];
    }
  }

  if (!best || bestDist > threshold) {
    return { x, y, snapped: false };
  }
  return { ...best, snapped: true, wallId, guidePoints };
}

function normalizeDegrees(value: number): number {
  let normalized = value % 360;
  if (normalized < -180) normalized += 360;
  if (normalized > 180) normalized -= 360;
  return normalized;
}

export function snapWallEndpointAngle(
  anchorX: number,
  anchorY: number,
  x: number,
  y: number,
  toleranceDeg = 8,
): { x: number; y: number; snapped: boolean; guidePoints?: number[] } {
  const dx = x - anchorX;
  const dy = y - anchorY;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return { x, y, snapped: false };
  }

  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  const snappedAngleDeg = snapAngle(angleDeg);
  const deltaDeg = Math.abs(normalizeDegrees(angleDeg - snappedAngleDeg));

  if (deltaDeg > toleranceDeg) {
    return { x, y, snapped: false };
  }

  const snappedAngleRad = snappedAngleDeg * (Math.PI / 180);
  const snappedPoint = {
    x: anchorX + Math.cos(snappedAngleRad) * length,
    y: anchorY + Math.sin(snappedAngleRad) * length,
  };

  return {
    ...snappedPoint,
    snapped: true,
    guidePoints: [anchorX, anchorY, snappedPoint.x, snappedPoint.y],
  };
}
