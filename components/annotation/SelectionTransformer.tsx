'use client';

import { useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';
import type Konva from 'konva';

interface SelectionTransformerProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  selectedIds: string[];
  enabled: boolean;
}

export default function SelectionTransformer({ stageRef, selectedIds, enabled }: SelectionTransformerProps) {
  const trRef = useRef<Konva.Transformer | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    const transformer = trRef.current;
    if (!stage || !transformer) return;

    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((node): node is Konva.Node => Boolean(node));

    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [enabled, selectedIds, stageRef]);

  if (!enabled) return null;

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      enabledAnchors={[
        'top-left',
        'top-center',
        'top-right',
        'middle-left',
        'middle-right',
        'bottom-left',
        'bottom-center',
        'bottom-right',
      ]}
      boundBoxFunc={(_, newBox) => {
        if (newBox.width < 8 || newBox.height < 8) return _;
        return newBox;
      }}
    />
  );
}
