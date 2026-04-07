import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeAnnotationDocument } from './annotationSanitizer';
import type { AnnotationDocument } from '../types/annotation';

function baseDocument(elements: AnnotationDocument['elements']): AnnotationDocument {
  return {
    documentId: 'doc_1',
    projectId: 'project_1',
    page: 1,
    baseImage: {
      sourceUrl: 'https://example.com/plan.png',
      widthPx: 300,
      heightPx: 300,
      scalePxPerFt: 10,
    },
    meta: {
      schemaVersion: 1,
      source: 'manual',
      createdAt: '2026-03-05T00:00:00Z',
      updatedAt: '2026-03-05T00:00:00Z',
      revision: 1,
    },
    layers: {
      wall: true,
      door: true,
      window: true,
      room: true,
    },
    elements,
    issues: [],
  };
}

test('sanitizeAnnotationDocument drops invalid auto opening that overruns its host wall', () => {
  const document = baseDocument([
    {
      id: 'wall_1',
      type: 'wall',
      attrs: { status: 'auto', locked: false, visible: true },
      geometry: { kind: 'segment', x1: 10, y1: 20, x2: 87, y2: 20, thicknessPx: 6, rotationDeg: 0 },
      relations: {},
    },
    {
      id: 'door_1',
      type: 'door',
      attrs: { status: 'auto', locked: false, visible: true },
      geometry: { kind: 'rect', x: 30, y: 8, width: 156, height: 24, rotationDeg: 0 },
      relations: { hostWallId: 'wall_1', source: 'gap_verified' },
    },
  ]);

  document.issues.push({
    id: 'issue_1',
    elementId: 'door_1',
    severity: 'warning',
    code: 'INVALID_OPENING_HOST_FIT',
    message: 'Opening exceeds wall span.',
  });

  const sanitized = sanitizeAnnotationDocument(document);

  assert.deepEqual(sanitized.elements.map((element) => element.id), ['wall_1']);
  assert.deepEqual(sanitized.issues, []);
});

test('sanitizeAnnotationDocument keeps manual openings without a host wall', () => {
  const document = baseDocument([
    {
      id: 'wall_1',
      type: 'wall',
      attrs: { status: 'auto', locked: false, visible: true },
      geometry: { kind: 'segment', x1: 10, y1: 20, x2: 120, y2: 20, thicknessPx: 6, rotationDeg: 0 },
      relations: {},
    },
    {
      id: 'door_manual',
      type: 'door',
      attrs: { status: 'new', locked: false, visible: true },
      geometry: { kind: 'rect', x: 30, y: 8, width: 72, height: 24, rotationDeg: 0 },
      relations: {},
    },
  ]);

  const sanitized = sanitizeAnnotationDocument(document);

  assert.deepEqual(sanitized.elements.map((element) => element.id), ['wall_1', 'door_manual']);
});
