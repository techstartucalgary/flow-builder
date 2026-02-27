'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import type Konva from 'konva';

import { safeClone } from '@/lib/clone';
import { clamp, worldFromScreen } from '@/lib/geometry';
import type { AnnotationElement, AnnotationElementType, AnnotationIssue } from '@/types/annotation';
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';
import AnnotationRenderLayer from '@/components/annotation/AnnotationRenderLayer';
import FloorplanImageLayer from '@/components/annotation/FloorplanImageLayer';
import InteractionLayer from '@/components/annotation/InteractionLayer';
import SelectionTransformer from '@/components/annotation/SelectionTransformer';
import SnapGuideOverlay from '@/components/annotation/SnapGuideOverlay';

interface ViewportStageProps {
  baseImageUrl: string;
  widthPx: number;
  heightPx: number;
  showBaseImage: boolean;
  issues: AnnotationIssue[];
  onIssueSelect: (issue: AnnotationIssue) => void;
}

export default function ViewportStage({ baseImageUrl, widthPx, heightPx, showBaseImage }: ViewportStageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [container, setContainer] = useState({ width: 0, height: 0 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  const document = useAnnotationEditorStore((s) => s.document);
  const entities = useAnnotationEditorStore((s) => s.entities);
  const selection = useAnnotationEditorStore((s) => s.selection);
  const toolMode = useAnnotationEditorStore((s) => s.toolMode);
  const camera = useAnnotationEditorStore((s) => s.camera);
  const setCamera = useAnnotationEditorStore((s) => s.setCamera);
  const setSelection = useAnnotationEditorStore((s) => s.setSelection);
  const createElementAt = useAnnotationEditorStore((s) => s.createElementAt);
  const moveElementBy = useAnnotationEditorStore((s) => s.moveElementBy);
  const updateElement = useAnnotationEditorStore((s) => s.updateElement);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setContainer({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!showBaseImage || !baseImageUrl) {
      setBgImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBgImage(img);
    img.src = baseImageUrl;
  }, [baseImageUrl, showBaseImage]);

  useEffect(() => {
    if (!container.width || !container.height) return;
    const fitX = container.width / widthPx;
    const fitY = container.height / heightPx;
    const fitZoom = Math.min(fitX, fitY);
    if (fitZoom > 0) {
      setCamera({
        zoom: fitZoom,
        panX: (container.width - widthPx * fitZoom) / 2,
        panY: (container.height - heightPx * fitZoom) / 2,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container.width, container.height, widthPx, heightPx]);

  const visibleElements = useMemo(() => {
    if (!document) return [] as AnnotationElement[];
    return document.elements.filter((element) => document.layers[element.type]);
  }, [document]);

  const selectedWall = useMemo(() => {
    if (!selection.length) return null;
    const el = entities.byId[selection[0]];
    if (!el || el.type !== 'wall' || el.geometry.kind !== 'segment') return null;
    return el;
  }, [entities.byId, selection]);

  function onDragEnd(id: string, e: any) {
    const el = entities.byId[id];
    if (!el) return;

    const node = e.target;
    if (el.geometry.kind === 'segment') {
      const dx = node.x();
      const dy = node.y();
      node.position({ x: 0, y: 0 });
      moveElementBy(id, dx, dy);
      return;
    }

    const next = safeClone(el);
    if (next.geometry.kind === 'segment') return;
    next.geometry.x = node.x();
    next.geometry.y = node.y();
    next.attrs.status = 'edited';
    updateElement(next);
  }

  function onTransformEnd(id: string, e: any) {
    const el = entities.byId[id];
    if (!el || el.geometry.kind === 'segment') return;

    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const next = safeClone(el);
    if (next.geometry.kind === 'segment') return;
    next.geometry.x = node.x();
    next.geometry.y = node.y();
    next.geometry.rotationDeg = node.rotation();
    next.geometry.width = Math.max(4, next.geometry.width * scaleX);
    next.geometry.height = Math.max(4, next.geometry.height * scaleY);
    next.attrs.status = 'edited';

    node.scaleX(1);
    node.scaleY(1);
    updateElement(next);
  }

  function onStageMouseDown(e: any) {
    if (!stageRef.current) return;

    const clickedOnEmpty = e.target === stageRef.current;
    if (clickedOnEmpty && toolMode === 'select') {
      setSelection([]);
      return;
    }

    if (!clickedOnEmpty) return;

    if (toolMode === 'delete') return;

    if (toolMode !== 'select') {
      const point = stageRef.current.getPointerPosition();
      if (!point) return;
      const world = worldFromScreen(point.x, point.y, camera.panX, camera.panY, camera.zoom);
      createElementAt(toolMode as AnnotationElementType, world.x, world.y);
    }
  }

  function onWheel(e: any) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = camera.zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.04;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = clamp(direction > 0 ? oldScale * scaleBy : oldScale / scaleBy, camera.minZoom, camera.maxZoom);

    const mousePointTo = {
      x: (pointer.x - camera.panX) / oldScale,
      y: (pointer.y - camera.panY) / oldScale,
    };

    const newPan = {
      panX: pointer.x - mousePointTo.x * newScale,
      panY: pointer.y - mousePointTo.y * newScale,
    };

    setCamera({ zoom: newScale, ...newPan });
  }

  return (
    <div ref={wrapRef} className="w-full h-full rounded-lg border border-white/10 bg-[#0a0f1a] overflow-hidden">
      <Stage
        ref={stageRef}
        width={container.width}
        height={container.height}
        x={camera.panX}
        y={camera.panY}
        scaleX={camera.zoom}
        scaleY={camera.zoom}
        onMouseDown={onStageMouseDown}
        onWheel={onWheel}
        draggable={toolMode === 'select'}
        onDragEnd={(e) => setCamera({ panX: e.target.x(), panY: e.target.y() })}
      >
        <Layer>
          <FloorplanImageLayer image={bgImage} width={widthPx} height={heightPx} />
        </Layer>
        <Layer>
          <AnnotationRenderLayer
            elements={visibleElements}
            selectedIds={selection}
            onSelect={(id) => setSelection([id])}
            onDragEnd={onDragEnd}
            onTransformEnd={onTransformEnd}
          />
          <SnapGuideOverlay guides={[]} />
        </Layer>
        <Layer>
          <InteractionLayer
            selectedWall={selectedWall}
            onWallEndpointChange={(id, endpoint, x, y) => {
              const wall = entities.byId[id];
              if (!wall || wall.type !== 'wall' || wall.geometry.kind !== 'segment') return;
              const next = safeClone(wall);
              if (endpoint === 'start') {
                next.geometry.x1 = x;
                next.geometry.y1 = y;
              } else {
                next.geometry.x2 = x;
                next.geometry.y2 = y;
              }
              next.attrs.status = 'edited';
              updateElement(next);
            }}
          />
          <SelectionTransformer
            stageRef={stageRef}
            selectedIds={selection}
            enabled={selection.length > 0 && (!selectedWall || toolMode !== 'wall')}
          />
        </Layer>
      </Stage>
    </div>
  );
}
