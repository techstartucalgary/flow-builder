'use client';

import { Circle, Line } from 'react-konva';

import type { RoomElement, WallElement } from '@/types/annotation';

interface InteractionLayerProps {
  selectedWall: WallElement | null;
  selectedRoom: RoomElement | null;
  onWallEndpointChange: (id: string, endpoint: 'start' | 'end', x: number, y: number) => void;
  onWallEndpointCommit: () => void;
  onRoomPointChange: (id: string, pointIndex: number, x: number, y: number) => void;
  onRoomPointCommit: () => void;
}

export default function InteractionLayer({
  selectedWall,
  selectedRoom,
  onWallEndpointChange,
  onWallEndpointCommit,
  onRoomPointChange,
  onRoomPointCommit,
}: InteractionLayerProps) {
  if (!selectedWall && !selectedRoom) return null;

  if (selectedRoom?.geometry.kind === 'polygon') {
    const points = selectedRoom.geometry.points;

    return (
      <>
        <Line
          points={points.flatMap(([x, y]) => [x, y])}
          closed
          stroke="#facc15"
          strokeWidth={2}
          dash={[6, 4]}
          listening={false}
        />
        {points.map(([x, y], index) => (
          <Circle
            key={`${selectedRoom.id}-point-${x.toFixed(2)}-${y.toFixed(2)}`}
            x={x}
            y={y}
            radius={7}
            fill="#facc15"
            stroke="#111827"
            strokeWidth={1.5}
            draggable
            onDragMove={(e) => onRoomPointChange(selectedRoom.id, index, e.target.x(), e.target.y())}
            onDragEnd={onRoomPointCommit}
          />
        ))}
      </>
    );
  }

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
        onDragEnd={onWallEndpointCommit}
      />
      <Circle
        x={seg.x2}
        y={seg.y2}
        radius={7}
        fill="#facc15"
        draggable
        onDragMove={(e) => onWallEndpointChange(selectedWall.id, 'end', e.target.x(), e.target.y())}
        onDragEnd={onWallEndpointCommit}
      />
    </>
  );
}
