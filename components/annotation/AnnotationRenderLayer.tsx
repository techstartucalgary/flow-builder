'use client';

import { Fragment } from 'react';
import { Circle, Line, Rect } from 'react-konva';

import type { AnnotationElement, EditorViewPreset, OpeningRelations, RoomRelations } from '@/types/annotation';

interface AnnotationRenderLayerProps {
  elements: AnnotationElement[];
  selectedIds: string[];
  preset: EditorViewPreset;
  issuesByElementId?: Set<string>;
  onSelect: (id: string, additive?: boolean) => void;
  onDragEnd: (id: string, event: any) => void;
  onTransformEnd: (id: string, event: any) => void;
}

function styleForStatus(status: AnnotationElement['attrs']['status']) {
  if (status === 'edited') return '#22c55e';
  if (status === 'new') return '#a855f7';
  return '#22d3ee';
}

function styleForType(element: AnnotationElement, baseStroke: string) {
  if (element.type === 'room') {
    const relations = element.relations as RoomRelations | undefined;
    const material = relations?.material;
    if (material === 'hardwood') {
      return { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.16)' };
    }
    if (material === 'carpet') {
      return { stroke: '#22c55e', fill: 'rgba(34,197,94,0.16)' };
    }
    if (material === 'tile') {
      return { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.16)' };
    }
    if (material === 'vinyl') {
      return { stroke: '#e879f9', fill: 'rgba(232,121,249,0.16)' };
    }
    if (material === 'laminate') {
      return { stroke: '#f97316', fill: 'rgba(249,115,22,0.16)' };
    }
    return {
      stroke: '#f8fafc',
      fill: 'rgba(148,163,184,0.14)',
    };
  }
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

function styleForPreset(
  element: AnnotationElement,
  preset: EditorViewPreset,
  hasIssue: boolean,
  selected: boolean,
) {
  const statusStroke = styleForStatus(element.attrs.status);
  const base = styleForType(element, statusStroke);
  const relations = element.relations as OpeningRelations | undefined;

  if (preset === 'final') {
    return {
      ...base,
      strokeWidth: selected ? 3 : 2,
      opacity: 1,
      dash: undefined as number[] | undefined,
      shadowColor: hasIssue ? '#f59e0b' : undefined,
      shadowBlur: hasIssue ? 10 : 0,
    };
  }

  if (preset === 'walls_qa') {
    return {
      stroke: element.type === 'wall' ? '#22d3ee' : base.stroke,
      fill: element.type === 'wall' ? 'rgba(34,211,238,0.04)' : base.fill,
      strokeWidth: selected ? 3 : 2,
      opacity: element.type === 'wall' ? 1 : 0.35,
      dash: undefined as number[] | undefined,
      shadowColor: hasIssue ? '#f59e0b' : undefined,
      shadowBlur: hasIssue ? 8 : 0,
    };
  }

  if (preset === 'tags_qa') {
    return {
      ...base,
      fill: element.type === 'door' || element.type === 'window' ? 'rgba(255,255,255,0.06)' : base.fill,
      strokeWidth: selected ? 3 : 2,
      opacity: element.type === 'wall' ? 0.72 : 0.8,
      dash: undefined as number[] | undefined,
      shadowColor: hasIssue ? '#f59e0b' : undefined,
      shadowBlur: hasIssue ? 10 : 0,
    };
  }

  if (element.type === 'door' || element.type === 'window') {
    const source = relations?.source;
    if (source === 'gap_verified') {
      return {
        stroke: element.type === 'door' ? '#fb7185' : '#60a5fa',
        fill: element.type === 'door' ? 'rgba(251,113,133,0.32)' : 'rgba(96,165,250,0.32)',
        strokeWidth: selected ? 3 : 2.5,
        opacity: 1,
        dash: undefined as number[] | undefined,
        shadowColor: hasIssue ? '#f59e0b' : undefined,
        shadowBlur: hasIssue ? 12 : 0,
      };
    }
    if (source === 'gap_verified_tag_classified') {
      return {
        stroke: element.type === 'door' ? '#fda4af' : '#93c5fd',
        fill: element.type === 'door' ? 'rgba(251,113,133,0.2)' : 'rgba(96,165,250,0.2)',
        strokeWidth: selected ? 3 : 2,
        opacity: 0.95,
        dash: [6, 4],
        shadowColor: hasIssue ? '#f59e0b' : undefined,
        shadowBlur: hasIssue ? 12 : 0,
      };
    }
    return {
      stroke: element.type === 'door' ? '#fbbf24' : '#22d3ee',
      fill: element.type === 'door' ? 'rgba(251,191,36,0.14)' : 'rgba(34,211,238,0.14)',
      strokeWidth: selected ? 3 : 2,
      opacity: 0.92,
      dash: [10, 6],
      shadowColor: hasIssue ? '#f59e0b' : undefined,
      shadowBlur: hasIssue ? 12 : 0,
    };
  }

  return {
    ...base,
    strokeWidth: selected ? 3 : 2,
    opacity: element.type === 'wall' ? 0.65 : 0.45,
    dash: undefined as number[] | undefined,
    shadowColor: hasIssue ? '#f59e0b' : undefined,
    shadowBlur: hasIssue ? 8 : 0,
  };
}

export default function AnnotationRenderLayer({
  elements,
  selectedIds,
  preset,
  issuesByElementId,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: AnnotationRenderLayerProps) {
  return (
    <Fragment>
      {elements.map((element) => {
        const selected = selectedIds.includes(element.id);
        const hasIssue = issuesByElementId?.has(element.id) ?? false;
        const { stroke, fill, strokeWidth, opacity, dash, shadowBlur, shadowColor } = styleForPreset(
          element,
          preset,
          hasIssue,
          selected,
        );

        if (!element.attrs.visible) return null;

        if (element.geometry.kind === 'segment') {
          return (
            <Line
              key={element.id}
              id={element.id}
              points={[element.geometry.x1, element.geometry.y1, element.geometry.x2, element.geometry.y2]}
              stroke={stroke}
              strokeWidth={Math.max(strokeWidth, element.geometry.thicknessPx)}
              opacity={opacity}
              dash={dash}
              shadowColor={shadowColor}
              shadowBlur={shadowBlur}
              draggable={!element.attrs.locked}
              onClick={(e) => onSelect(element.id, Boolean(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey))}
              onTap={() => onSelect(element.id)}
              onDragEnd={(e) => onDragEnd(element.id, e)}
              onTransformEnd={(e) => onTransformEnd(element.id, e)}
            />
          );
        }

        if (element.geometry.kind === 'polygon') {
          const points = element.geometry.points.flatMap(([x, y]) => [x, y]);
          return (
            <Fragment key={element.id}>
              <Line
                id={element.id}
                points={points}
                closed
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                dash={dash}
                shadowColor={shadowColor}
                shadowBlur={shadowBlur}
                fill={selected ? 'rgba(56,189,248,0.22)' : fill}
                draggable={!element.attrs.locked}
                onClick={(e) => onSelect(element.id, Boolean(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey))}
                onTap={() => onSelect(element.id)}
                onDragEnd={(e) => onDragEnd(element.id, e)}
                onTransformEnd={(e) => onTransformEnd(element.id, e)}
              />
              {selected ? (
                <Circle
                  x={element.geometry.points[0]?.[0] ?? 0}
                  y={element.geometry.points[0]?.[1] ?? 0}
                  radius={4}
                  fill={stroke}
                  listening={false}
                />
              ) : null}
            </Fragment>
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
              opacity={opacity}
              dash={dash}
              shadowColor={shadowColor}
              shadowBlur={shadowBlur}
              fill={selected ? 'rgba(56,189,248,0.15)' : fill}
              cornerRadius={element.type === 'door' || element.type === 'window' ? 4 : 2}
              draggable={!element.attrs.locked}
              onClick={(e) => onSelect(element.id, Boolean(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey))}
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
