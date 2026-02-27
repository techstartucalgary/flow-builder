'use client';

import { Image as KonvaImage } from 'react-konva';

interface FloorplanImageLayerProps {
  image: HTMLImageElement | null;
  width: number;
  height: number;
}

export default function FloorplanImageLayer({ image, width, height }: FloorplanImageLayerProps) {
  if (!image) return null;
  return <KonvaImage image={image} x={0} y={0} width={width} height={height} listening={false} />;
}
