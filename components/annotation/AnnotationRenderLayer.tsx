'use client';

import { Fragment } from 'react';
import { Circle, Line, Rect } from 'react-konva';

import type { AnnotationElement, OpeningRelations } from '@/types/annotation';

interface AnnotationRenderLayerProps {
  elements: AnnotationElement[];
  selectedIds: string[];
  showLowConfidenceProjectedOpenings: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, event: any) => void;
  onTransformEnd: (id: string, event: any) => void;
}

function styleForStatus(status: AnnotationElement['attrs']['status']) {
  if (status === 'edited') return '#22c55e';
  if (status === 'new') return '#a855f7';
  return '#22d3ee';
}

function styleForType(element: AnnotationElement, baseStroke: string) {
  if (element.type === 'door') {
    return {
      stroke: '#fb7185',
      fill: 'rgba(251,113,133,0.25)',
    };
  }
  if (element.type === 'window') {
    return {
      stroke: '#60a5fa',
      fill: 'rgba(96,165,250,0.25)',
    };
  }
  return {
    stroke: baseStroke,
    fill: 'rgba(255,255,255,0.02)',
  };
}

export default function AnnotationRenderLayer({
  elements,
  selectedIds,
  showLowConfidenceProjectedOpenings,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: AnnotationRenderLayerProps) {
  return (
    <Fragment>
      {elements.map((element) => {
        const selected = selectedIds.includes(element.id);
        const statusStroke = styleForStatus(element.attrs.status);
        const relations = (element.relations && typeof element.relations === 'object')
          ? (element.relations as OpeningRelations)
          : undefined;
        const tentative = relations?.source === 'tag_projected' && typeof relations?.confidence === 'number' && relations.confidence < 0.72;
        const { stroke, fill } = styleForType(element, statusStroke);
        const strokeWidth = selected ? 3 : 2;

        if (!element.attrs.visible && !(tentative && showLowConfidenceProjectedOpenings)) return null;

        if (element.geometry.kind === 'segment') {
          return (
            <Line
              key={element.id}
              id={element.id}
              points={[element.geometry.x1, element.geometry.y1, element.geometry.x2, element.geometry.y2]}
              stroke={stroke}
              strokeWidth={Math.max(strokeWidth, element.geometry.thicknessPx)}
              opacity={tentative ? 0.35 : 1}
              draggable={!element.attrs.locked}
              onClick={() => onSelect(element.id)}
              onTap={() => onSelect(element.id)}
              onDragEnd={(e) => onDragEnd(element.id, e)}
              onTransformEnd={(e) => onTransformEnd(element.id, e)}
            />
          );
        }

        if (element.geometry.kind !== 'rect') return null;

        return (
          <Fragment key={element.id}>
            <Rect
              id={element.id}
              x={element.geometry.x}
              y={element.geometry.y}
              width={element.geometry.width}
              height={element.geometry.height}
              rotation={element.geometry.rotationDeg}
              stroke={stroke}
              strokeWidth={strokeWidth}
              fill={selected ? 'rgba(56,189,248,0.15)' : fill}
              opacity={tentative ? 0.4 : 1}
              dash={tentative ? [6, 4] : undefined}
              cornerRadius={element.type === 'door' || element.type === 'window' ? 4 : 2}
              draggable={!element.attrs.locked}
              onClick={() => onSelect(element.id)}
              onTap={() => onSelect(element.id)}
              onDragEnd={(e) => onDragEnd(element.id, e)}
              onTransformEnd={(e) => onTransformEnd(element.id, e)}
            />
            {selected && (
              <Circle
                x={element.geometry.x}
                y={element.geometry.y}
                radius={4}
                fill={stroke}
                listening={false}
              />
            )}
          </Fragment>
        );
      })}
    </Fragment>
  );
}
