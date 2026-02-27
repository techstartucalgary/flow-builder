'use client';

import { Line } from 'react-konva';

interface SnapGuideOverlayProps {
  guides: Array<{ points: number[] }>;
}

export default function SnapGuideOverlay({ guides }: SnapGuideOverlayProps) {
  return (
    <>
      {guides.map((guide, idx) => (
        <Line
          key={`guide-${idx}`}
          points={guide.points}
          stroke="#38bdf8"
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      ))}
    </>
  );
}
