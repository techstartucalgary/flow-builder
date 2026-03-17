'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Stage, Text } from 'react-konva';
import type Konva from 'konva';

import { safeClone } from '@/lib/clone';
import { clamp, worldFromScreen } from '@/lib/geometry';
import { isObjectUrl, normalizeBaseImageUrl } from '@/lib/imageUrl';
import type {
  AnnotationElement,
  AnnotationElementType,
  AnnotationIssue,
  AnnotationRenderHints,
  CVTag,
  EditorViewPreset,
} from '@/types/annotation';
import { useAnnotationEditorStore } from '@/stores/useAnnotationEditorStore';
import AnnotationRenderLayer from '@/components/annotation/AnnotationRenderLayer';
import InteractionLayer from '@/components/annotation/InteractionLayer';
import SelectionTransformer from '@/components/annotation/SelectionTransformer';
import SnapGuideOverlay from '@/components/annotation/SnapGuideOverlay';

interface ViewportStageProps {
  baseImageUrl: string;
  widthPx: number;
  heightPx: number;
  showBaseImage: boolean;
  showTags: boolean;
  tags: CVTag[];
  matchedTagIds: Set<string>;
  displayElements: AnnotationElement[];
  viewPreset: EditorViewPreset;
  renderHints: AnnotationRenderHints;
  issuesByElementId: Set<string>;
  issues: AnnotationIssue[];
  onIssueSelect: (issue: AnnotationIssue) => void;
  calibrationDraft?: {
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
  };
  onCalibrationPoint?: (point: { x: number; y: number }) => void;
}

export default function ViewportStage({
  baseImageUrl,
  widthPx,
  heightPx,
  showBaseImage,
  showTags,
  tags,
  matchedTagIds,
  displayElements,
  viewPreset,
  renderHints,
  issuesByElementId,
  calibrationDraft,
  onCalibrationPoint,
}: ViewportStageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [container, setContainer] = useState({ width: 0, height: 0 });
  const [normalizedBaseImageUrl, setNormalizedBaseImageUrl] = useState(baseImageUrl);
  const [baseImageReady, setBaseImageReady] = useState(!showBaseImage || !baseImageUrl);
  const readinessLoggedRef = useRef(false);

  const document = useAnnotationEditorStore((s) => s.document);
  const entities = useAnnotationEditorStore((s) => s.entities);
  const selection = useAnnotationEditorStore((s) => s.selection);
  const toolMode = useAnnotationEditorStore((s) => s.toolMode);
  const camera = useAnnotationEditorStore((s) => s.camera);
  const focusRequest = useAnnotationEditorStore((s) => s.focusRequest);
  const setCamera = useAnnotationEditorStore((s) => s.setCamera);
  const setSelection = useAnnotationEditorStore((s) => s.setSelection);
  const clearFocusRequest = useAnnotationEditorStore((s) => s.clearFocusRequest);
  const createElementAt = useAnnotationEditorStore((s) => s.createElementAt);
  const moveElementBy = useAnnotationEditorStore((s) => s.moveElementBy);
  const updateElement = useAnnotationEditorStore((s) => s.updateElement);
  const displayedElementIds = useMemo(() => new Set(displayElements.map((element) => element.id)), [displayElements]);
  const hasVisibleSelection = useMemo(
    () => selection.some((id) => displayedElementIds.has(id)),
    [displayedElementIds, selection],
  );

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
    readinessLoggedRef.current = false;
  }, [baseImageUrl, heightPx, widthPx, document?.documentId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrlToRevoke: string | null = null;

    if (!showBaseImage || !baseImageUrl) {
      setNormalizedBaseImageUrl(baseImageUrl);
      setBaseImageReady(true);
      return () => {
        cancelled = true;
      };
    }

    setBaseImageReady(false);
    void normalizeBaseImageUrl(baseImageUrl).then((nextUrl) => {
      if (cancelled) {
        if (isObjectUrl(nextUrl)) {
          URL.revokeObjectURL(nextUrl);
        }
        return;
      }
      objectUrlToRevoke = isObjectUrl(nextUrl) ? nextUrl : null;
      setNormalizedBaseImageUrl(nextUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
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

  useEffect(() => {
    if (!focusRequest || !container.width || !container.height) return;

    const targetElements = focusRequest.elementIds
      .map((id) => entities.byId[id])
      .filter((element): element is AnnotationElement => Boolean(element));

    if (!targetElements.length) {
      clearFocusRequest();
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const element of targetElements) {
      if (element.geometry.kind === 'segment') {
        const halfThickness = Math.max(12, element.geometry.thicknessPx) / 2;
        minX = Math.min(minX, element.geometry.x1, element.geometry.x2) - halfThickness;
        minY = Math.min(minY, element.geometry.y1, element.geometry.y2) - halfThickness;
        maxX = Math.max(maxX, element.geometry.x1, element.geometry.x2) + halfThickness;
        maxY = Math.max(maxY, element.geometry.y1, element.geometry.y2) + halfThickness;
      } else {
        minX = Math.min(minX, element.geometry.x);
        minY = Math.min(minY, element.geometry.y);
        maxX = Math.max(maxX, element.geometry.x + element.geometry.width);
        maxY = Math.max(maxY, element.geometry.y + element.geometry.height);
      }
    }

    const padding = focusRequest.paddingPx ?? 96;
    const boundsWidth = Math.max(96, maxX - minX);
    const boundsHeight = Math.max(96, maxY - minY);
    const fitZoom = clamp(
      Math.min(
        (container.width - padding * 2) / boundsWidth,
        (container.height - padding * 2) / boundsHeight,
      ),
      camera.minZoom,
      camera.maxZoom,
    );

    setCamera({
      zoom: fitZoom,
      panX: container.width / 2 - ((minX + maxX) / 2) * fitZoom,
      panY: container.height / 2 - ((minY + maxY) / 2) * fitZoom,
    });
    clearFocusRequest();
  }, [
    camera.maxZoom,
    camera.minZoom,
    clearFocusRequest,
    container.height,
    container.width,
    entities.byId,
    focusRequest,
    setCamera,
  ]);

  const selectedWall = useMemo(() => {
    if (!selection.length) return null;
    const el = entities.byId[selection[0]];
    if (!el || !displayedElementIds.has(el.id)) return null;
    if (!el || el.type !== 'wall' || el.geometry.kind !== 'segment') return null;
    return el;
  }, [displayedElementIds, entities.byId, selection]);

  const isViewportReady = container.width > 0 && container.height > 0 && widthPx > 0 && heightPx > 0;
  const shouldMountStage = isViewportReady && (!showBaseImage || baseImageReady);
  const stageKey = useMemo(() => {
    const documentId = document?.documentId || 'annotation-stage';
    return `stage:${widthPx}x${heightPx}:${documentId}`;
  }, [document?.documentId, heightPx, widthPx]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    if (!isViewportReady) {
      if (!readinessLoggedRef.current) {
        console.debug('[annotation-editor] viewport not ready', {
          containerWidth: container.width,
          containerHeight: container.height,
          widthPx,
          heightPx,
        });
      }
      return;
    }

    if (!readinessLoggedRef.current && (!showBaseImage || baseImageReady)) {
      readinessLoggedRef.current = true;
      console.debug('[annotation-editor] viewport ready', {
        containerWidth: container.width,
        containerHeight: container.height,
        widthPx,
        heightPx,
        baseImageMode: showBaseImage
          ? (normalizedBaseImageUrl.startsWith('blob:') ? 'blob' : normalizedBaseImageUrl.startsWith('data:') ? 'data' : 'url')
          : 'disabled',
      });
    }
  }, [baseImageReady, container.height, container.width, heightPx, isViewportReady, normalizedBaseImageUrl, showBaseImage, widthPx]);

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

    if (toolMode === 'calibrate') {
      const point = stageRef.current.getPointerPosition();
      if (!point || !onCalibrationPoint) return;
      const world = worldFromScreen(point.x, point.y, camera.panX, camera.panY, camera.zoom);
      onCalibrationPoint(world);
      return;
    }

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
    <div ref={wrapRef} className="relative w-full h-full rounded-lg border border-white/10 bg-[#0a0f1a] overflow-hidden">
      {showBaseImage && normalizedBaseImageUrl && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={normalizedBaseImageUrl}
            alt=""
            draggable={false}
            className="absolute top-0 left-0 select-none max-w-none"
            onLoad={() => setBaseImageReady(true)}
            onError={() => setBaseImageReady(true)}
            style={{
              width: `${widthPx}px`,
              height: `${heightPx}px`,
              transform: `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      )}
      {!shouldMountStage ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-gray-400">
          Initializing editor viewport…
        </div>
      ) : (
        <Stage
          key={stageKey}
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
            <AnnotationRenderLayer
              elements={displayElements}
              selectedIds={selection}
              preset={viewPreset}
              issuesByElementId={renderHints.highlightIssues ? issuesByElementId : undefined}
              onSelect={(id) => setSelection([id])}
              onDragEnd={onDragEnd}
              onTransformEnd={onTransformEnd}
            />
            <SnapGuideOverlay guides={[]} />
          </Layer>
          {calibrationDraft?.start ? (
            <Layer listening={false}>
              <Circle
                x={calibrationDraft.start.x}
                y={calibrationDraft.start.y}
                radius={7}
                fill="#22d3ee"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              {calibrationDraft.end ? (
                <>
                  <Circle
                    x={calibrationDraft.end.x}
                    y={calibrationDraft.end.y}
                    radius={7}
                    fill="#22d3ee"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                  <Text
                    x={(calibrationDraft.start.x + calibrationDraft.end.x) / 2 + 10}
                    y={(calibrationDraft.start.y + calibrationDraft.end.y) / 2 - 20}
                    text={`${Math.hypot(
                      calibrationDraft.end.x - calibrationDraft.start.x,
                      calibrationDraft.end.y - calibrationDraft.start.y,
                    ).toFixed(1)} px`}
                    fontSize={14}
                    fill="#dbeafe"
                  />
                </>
              ) : null}
              <SnapGuideOverlay
                guides={calibrationDraft.end ? [{
                  points: [
                    calibrationDraft.start.x,
                    calibrationDraft.start.y,
                    calibrationDraft.end.x,
                    calibrationDraft.end.y,
                  ],
                }] : []}
              />
            </Layer>
          ) : null}
          {showTags && tags.length > 0 && (
            <Layer listening={false}>
              {tags.map((tag) => {
                const matched = matchedTagIds.has(tag.id);
                const color = viewPreset === 'tags_qa'
                  ? (matched ? (tag.tag_class === 'door' ? '#f472b6' : '#22d3ee') : '#f59e0b')
                  : (tag.tag_class === 'door' ? '#fb7185' : '#60a5fa');
                const radius = Math.max(8, tag.radius);
                const opacity = viewPreset === 'openings_qa' ? 0.42 : viewPreset === 'tags_qa' ? 1 : 0.78;
                return (
                  <Fragment key={tag.id}>
                    <Circle
                      x={tag.center[0]}
                      y={tag.center[1]}
                      radius={radius}
                      stroke={color}
                      strokeWidth={viewPreset === 'tags_qa' && matched ? 2.5 : 2}
                      dash={viewPreset === 'tags_qa' && !matched ? [4, 3] : [6, 4]}
                      opacity={opacity}
                    />
                    <Text
                      x={tag.center[0] + radius + 4}
                      y={tag.center[1] - 8}
                      text={tag.id}
                      fontSize={14}
                      fill={color}
                      opacity={opacity}
                    />
                  </Fragment>
                );
              })}
            </Layer>
          )}
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
              enabled={hasVisibleSelection && (!selectedWall || toolMode !== 'wall')}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
