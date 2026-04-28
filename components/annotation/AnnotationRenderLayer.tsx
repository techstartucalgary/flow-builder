'use client';

import { Fragment } from 'react';
import { Circle, Line, Rect } from 'react-konva';

import { computeOpeningOverlayGeometry, getHostWallForOpening } from '@/lib/openingGeometry';
import type { AnnotationElement, EditorViewPreset, OpeningRelations, RoomRelations } from '@/types/annotation';

interface AnnotationRenderLayerProps {
  elements: AnnotationElement[];
  wallsById: Record<string, AnnotationElement>;
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

const ROOM_PALETTE = [
  { stroke: '#22d3ee', fill: 'rgba(34,211,238,0.18)' },
  { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.18)' },
  { stroke: '#fb7185', fill: 'rgba(251,113,133,0.16)' },
  { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.16)' },
  { stroke: '#34d399', fill: 'rgba(52,211,153,0.17)' },
  { stroke: '#60a5fa', fill: 'rgba(96,165,250,0.17)' },
  { stroke: '#f472b6', fill: 'rgba(244,114,182,0.16)' },
  { stroke: '#fb923c', fill: 'rgba(251,146,60,0.16)' },
  { stroke: '#2dd4bf', fill: 'rgba(45,212,191,0.17)' },
  { stroke: '#c084fc', fill: 'rgba(192,132,252,0.16)' },
  { stroke: '#bef264', fill: 'rgba(190,242,100,0.13)' },
  { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.17)' },
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function roomPaletteFor(element: AnnotationElement) {
  const key = `${element.attrs.name || ''}:${element.id}`;
  return ROOM_PALETTE[hashString(key) % ROOM_PALETTE.length];
}

function styleForType(element: AnnotationElement, baseStroke: string) {
  if (element.type === 'room') {
    const relations = element.relations as RoomRelations | undefined;
    const roomStyle = roomPaletteFor(element);
    const spaceType = relations?.spaceType ?? 'counted_room';
    const countInRoomSchedule = typeof relations?.countInRoomSchedule === 'boolean'
      ? relations.countInRoomSchedule
      : spaceType === 'counted_room';
    if (!countInRoomSchedule) {
      if (spaceType === 'mechanical') {
        return { stroke: '#fca5a5', fill: 'rgba(252,165,165,0.10)' };
      }
      if (spaceType === 'storage') {
        return { stroke: '#fdba74', fill: 'rgba(253,186,116,0.10)' };
      }
      if (spaceType === 'service') {
        return { stroke: '#c4b5fd', fill: 'rgba(196,181,253,0.10)' };
      }
      if (spaceType === 'circulation') {
        return { stroke: '#93c5fd', fill: 'rgba(147,197,253,0.10)' };
      }
      return { stroke: '#cbd5e1', fill: 'rgba(148,163,184,0.09)' };
    }
    return roomStyle;
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
    const baseStroke = element.type === 'door' ? '#fb7185' : '#60a5fa';
    const baseFill = element.type === 'door' ? 'rgba(251,113,133,0.22)' : 'rgba(96,165,250,0.22)';
    if (source === 'gap_verified') {
      return {
        stroke: baseStroke,
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
        stroke: baseStroke,
        fill: baseFill,
        strokeWidth: selected ? 3 : 2,
        opacity: 0.95,
        dash: [6, 4],
        shadowColor: hasIssue ? '#f59e0b' : undefined,
        shadowBlur: hasIssue ? 12 : 0,
      };
    }
    return {
      stroke: baseStroke,
      fill: baseFill,
      strokeWidth: selected ? 3 : 2,
      opacity: 0.92,
      dash: source === 'symbol_projected' ? [10, 6] : [8, 5],
      shadowColor: hasIssue ? '#f59e0b' : undefined,
      shadowBlur: hasIssue ? 12 : 0,
    };
  }

  return {
    ...base,
    strokeWidth: selected ? 3 : 2,
    opacity: element.type === 'wall' ? 0.65 : 0.45,
    dash: element.type === 'room' ? (() => {
      const relations = element.relations as RoomRelations | undefined;
      const spaceType = relations?.spaceType ?? 'counted_room';
      const countInRoomSchedule = typeof relations?.countInRoomSchedule === 'boolean'
        ? relations.countInRoomSchedule
        : spaceType === 'counted_room';
      return countInRoomSchedule ? undefined : [10, 6];
    })() : undefined as number[] | undefined,
    shadowColor: hasIssue ? '#f59e0b' : undefined,
    shadowBlur: hasIssue ? 8 : 0,
  };
}

export default function AnnotationRenderLayer({
  elements,
  wallsById,
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
        const openingHostWall = (
          (element.type === 'door' || element.type === 'window')
          && element.geometry.kind === 'rect'
        ) ? getHostWallForOpening(element, wallsById) : null;
        const openingOverlay = (
          openingHostWall
          && (element.type === 'door' || element.type === 'window')
          && element.geometry.kind === 'rect'
        ) ? computeOpeningOverlayGeometry(element, openingHostWall) : null;
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
                fill={selected && element.type !== 'room' ? 'rgba(56,189,248,0.22)' : fill}
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
              x={openingOverlay ? openingOverlay.centerX : element.geometry.x}
              y={openingOverlay ? openingOverlay.centerY : element.geometry.y}
              width={openingOverlay ? openingOverlay.width : element.geometry.width}
              height={openingOverlay ? openingOverlay.height : element.geometry.height}
              rotation={openingOverlay ? openingOverlay.rotationDeg : element.geometry.rotationDeg}
              offsetX={openingOverlay ? openingOverlay.width / 2 : 0}
              offsetY={openingOverlay ? openingOverlay.height / 2 : 0}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={dash}
              shadowColor={shadowColor}
              shadowBlur={shadowBlur}
              fill={selected ? 'rgba(56,189,248,0.15)' : fill}
              cornerRadius={element.type === 'door' || element.type === 'window'
                ? (openingOverlay ? Math.max(4, Math.min(8, openingOverlay.height / 2)) : 4)
                : 2}
              draggable={!element.attrs.locked}
              onClick={(e) => onSelect(element.id, Boolean(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey))}
              onTap={() => onSelect(element.id)}
              onDragEnd={(e) => onDragEnd(element.id, e)}
              onTransformEnd={(e) => onTransformEnd(element.id, e)}
            />
            {selected && (
              <Circle
                x={openingOverlay ? openingOverlay.centerX : element.geometry.x}
                y={openingOverlay ? openingOverlay.centerY : element.geometry.y}
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
