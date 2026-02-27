'use client';

import { Circle, Line } from 'react-konva';

import type { WallElement } from '@/types/annotation';

interface InteractionLayerProps {
  selectedWall: WallElement | null;
  onWallEndpointChange: (id: string, endpoint: 'start' | 'end', x: number, y: number) => void;
}

export default function InteractionLayer({ selectedWall, onWallEndpointChange }: InteractionLayerProps) {
  if (!selectedWall) return null;

  const seg = selectedWall.geometry;

  return (
    <>
      <Line
        points={[seg.x1, seg.y1, seg.x2, seg.y2]}
        stroke="#facc15"
        strokeWidth={2}
        dash={[6, 4]}
        listening={false}
      />
      <Circle
        x={seg.x1}
        y={seg.y1}
        radius={7}
        fill="#facc15"
        draggable
        onDragMove={(e) => onWallEndpointChange(selectedWall.id, 'start', e.target.x(), e.target.y())}
      />
      <Circle
        x={seg.x2}
        y={seg.y2}
        radius={7}
        fill="#facc15"
        draggable
        onDragMove={(e) => onWallEndpointChange(selectedWall.id, 'end', e.target.x(), e.target.y())}
      />
    </>
  );
}
