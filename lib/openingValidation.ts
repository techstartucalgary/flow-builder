import type { AnnotationElement, WallElement } from '@/types/annotation';

export const HOST_FIT_TOLERANCE_PX = 6;
export const MIN_OPENING_SPAN_PX = 20;

function isWallElement(element: AnnotationElement): element is WallElement {
  return element.type === 'wall' && element.geometry.kind === 'segment';
}

function openingAxisSpan(
  opening: Extract<AnnotationElement, { type: 'door' | 'window' }>,
  wall: WallElement,
): [number, number] {
  if (Math.abs(wall.geometry.x2 - wall.geometry.x1) >= Math.abs(wall.geometry.y2 - wall.geometry.y1)) {
    return [opening.geometry.x, opening.geometry.x + opening.geometry.width];
  }
  return [opening.geometry.y, opening.geometry.y + opening.geometry.height];
}

function wallAxisSpan(wall: WallElement): [number, number] {
  if (Math.abs(wall.geometry.x2 - wall.geometry.x1) >= Math.abs(wall.geometry.y2 - wall.geometry.y1)) {
    return [Math.min(wall.geometry.x1, wall.geometry.x2), Math.max(wall.geometry.x1, wall.geometry.x2)];
  }
  return [Math.min(wall.geometry.y1, wall.geometry.y2), Math.max(wall.geometry.y1, wall.geometry.y2)];
}

export function openingFitsHostWall(
  opening: AnnotationElement,
  hostWall: AnnotationElement | undefined,
  tolerancePx = HOST_FIT_TOLERANCE_PX,
): boolean {
  if ((opening.type !== 'door' && opening.type !== 'window') || opening.geometry.kind !== 'rect') {
    return false;
  }
  if (!hostWall || !isWallElement(hostWall)) {
    return false;
  }

  const [openingStart, openingEnd] = openingAxisSpan(opening, hostWall);
  if ((openingEnd - openingStart) < MIN_OPENING_SPAN_PX) {
    return false;
  }

  const [wallStart, wallEnd] = wallAxisSpan(hostWall);
  return openingStart >= wallStart - tolerancePx && openingEnd <= wallEnd + tolerancePx;
}
