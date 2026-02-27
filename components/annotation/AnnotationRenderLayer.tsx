'use client';

import { Fragment } from 'react';
import { Circle, Line, Rect, Text } from 'react-konva';

import type { AnnotationElement } from '@/types/annotation';

interface AnnotationRenderLayerProps {
  elements: AnnotationElement[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onDragEnd: (id: string, event: any) => void;
  onTransformEnd: (id: string, event: any) => void;
}

function styleForStatus(status: AnnotationElement['attrs']['status']) {
  if (status === 'edited') return '#22c55e';
  if (status === 'new') return '#a855f7';
  return '#22d3ee';
}

export default function AnnotationRenderLayer({
  elements,
  selectedIds,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: AnnotationRenderLayerProps) {
  return (
    <Fragment>
      {elements.map((element) => {
        const selected = selectedIds.includes(element.id);
        const stroke = styleForStatus(element.attrs.status);
        const strokeWidth = selected ? 3 : 2;

        if (!element.attrs.visible) return null;

        if (element.geometry.kind === 'segment') {
          return (
            <Line
              key={element.id}
              id={element.id}
              points={[element.geometry.x1, element.geometry.y1, element.geometry.x2, element.geometry.y2]}
              stroke={stroke}
              strokeWidth={Math.max(strokeWidth, element.type === 'dimension' ? 2 : element.geometry.thicknessPx)}
              opacity={element.type === 'dimension' ? 0.8 : 1}
              draggable={!element.attrs.locked}
              onClick={() => onSelect(element.id)}
              onTap={() => onSelect(element.id)}
              onDragEnd={(e) => onDragEnd(element.id, e)}
              onTransformEnd={(e) => onTransformEnd(element.id, e)}
            />
          );
        }

        if (element.geometry.kind === 'text') {
          return (
            <Text
              key={element.id}
              id={element.id}
              x={element.geometry.x}
              y={element.geometry.y}
              width={element.geometry.width}
              height={element.geometry.height}
              text={element.geometry.text}
              fontSize={element.geometry.fontSize}
              fill={stroke}
              rotation={element.geometry.rotationDeg}
              draggable={!element.attrs.locked}
              onClick={() => onSelect(element.id)}
              onTap={() => onSelect(element.id)}
              onDragEnd={(e) => onDragEnd(element.id, e)}
              onTransformEnd={(e) => onTransformEnd(element.id, e)}
            />
          );
        }

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
              fill={selected ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.02)'}
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
