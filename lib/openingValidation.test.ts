import test from 'node:test';
import assert from 'node:assert/strict';

import { openingFitsHostWall } from './openingValidation';
import type { AnnotationElement } from '../types/annotation';

function wall(id: string, x1: number, y1: number, x2: number, y2: number): AnnotationElement {
  return {
    id,
    type: 'wall',
    attrs: { status: 'auto', locked: false, visible: true },
    geometry: {
      kind: 'segment',
      x1,
      y1,
      x2,
      y2,
      thicknessPx: 12,
      rotationDeg: 0,
    },
    relations: {},
  };
}

function door(id: string, x: number, y: number, width: number, height: number, hostWallId?: string): AnnotationElement {
  return {
    id,
    type: 'door',
    attrs: { status: 'auto', locked: false, visible: true },
    geometry: {
      kind: 'rect',
      x,
      y,
      width,
      height,
      rotationDeg: 0,
    },
    relations: hostWallId ? { hostWallId } : {},
  };
}

test('openingFitsHostWall accepts an opening that fits inside its host wall', () => {
  assert.equal(openingFitsHostWall(door('door_1', 40, 8, 50, 24, 'wall_1'), wall('wall_1', 10, 20, 120, 20)), true);
});

test('openingFitsHostWall rejects an opening longer than its host wall span', () => {
  assert.equal(openingFitsHostWall(door('door_2', 30, 8, 156, 24, 'wall_1'), wall('wall_1', 10, 20, 87, 20)), false);
});

test('openingFitsHostWall rejects openings without a valid host wall', () => {
  assert.equal(openingFitsHostWall(door('door_3', 40, 8, 50, 24), undefined), false);
});
