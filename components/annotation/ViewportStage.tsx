'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Layer, Line, Stage, Text } from 'react-konva';
import type Konva from 'konva';

import { safeClone } from '@/lib/clone';
import { clamp, worldFromScreen } from '@/lib/geometry';
import { isObjectUrl, normalizeBaseImageUrl } from '@/lib/imageUrl';
import { snapPointToWalls, snapToGrid, snapWallEndpointAngle } from '@/lib/snapping';
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

function elementBounds(element: AnnotationElement) {
  if (element.geometry.kind === 'segment') {
    const halfThickness = Math.max(12, element.geometry.thicknessPx) / 2;
    return {
      minX: Math.min(element.geometry.x1, element.geometry.x2) - halfThickness,
      minY: Math.min(element.geometry.y1, element.geometry.y2) - halfThickness,
      maxX: Math.max(element.geometry.x1, element.geometry.x2) + halfThickness,
      maxY: Math.max(element.geometry.y1, element.geometry.y2) + halfThickness,
    };
  }

  return {
    minX: element.geometry.x,
    minY: element.geometry.y,
    maxX: element.geometry.x + element.geometry.width,
    maxY: element.geometry.y + element.geometry.height,
  };
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
  const gridEnabled = useAnnotationEditorStore((s) => s.gridEnabled);
  const gridSize = useAnnotationEditorStore((s) => s.gridSize);
  const wallSnapEnabled = useAnnotationEditorStore((s) => s.wallSnapEnabled);
  const wallSnapThreshold = useAnnotationEditorStore((s) => s.wallSnapThreshold);
  const focusRequest = useAnnotationEditorStore((s) => s.focusRequest);
  const setCamera = useAnnotationEditorStore((s) => s.setCamera);
  const setSelection = useAnnotationEditorStore((s) => s.setSelection);
  const clearFocusRequest = useAnnotationEditorStore((s) => s.clearFocusRequest);
  const createElementAt = useAnnotationEditorStore((s) => s.createElementAt);
  const moveElementBy = useAnnotationEditorStore((s) => s.moveElementBy);
  const updateElement = useAnnotationEditorStore((s) => s.updateElement);
  const [pointerWorld, setPointerWorld] = useState<{ x: number; y: number } | null>(null);
  const [endpointSnapGuide, setEndpointSnapGuide] = useState<Array<{ id: string; points: number[] }>>([]);
  const [marqueeDraft, setMarqueeDraft] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
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

  const placementFeedback = useMemo(() => {
    if (!pointerWorld) return null;
    if (toolMode !== 'door' && toolMode !== 'window' && toolMode !== 'room') return null;

    let point = pointerWorld;
    const guides: Array<{ id: string; points: number[] }> = [];
    let hostWallId: string | undefined;

    if (gridEnabled) {
      const snappedGridPoint = snapToGrid(point.x, point.y, gridSize);
      if (snappedGridPoint.x !== point.x || snappedGridPoint.y !== point.y) {
        guides.push({
          id: 'grid-snap',
          points: [point.x, point.y, snappedGridPoint.x, snappedGridPoint.y],
        });
        point = snappedGridPoint;
      }
    }

    if (wallSnapEnabled && (toolMode === 'door' || toolMode === 'window')) {
      const walls = entities.byType.wall.map((wallId) => entities.byId[wallId]);
      const wallSnap = snapPointToWalls(point.x, point.y, walls, wallSnapThreshold);
      if (wallSnap.snapped) {
        point = { x: wallSnap.x, y: wallSnap.y };
        hostWallId = wallSnap.wallId;
        if (wallSnap.guidePoints) {
          guides.push({ id: `host-wall-${wallSnap.wallId ?? 'preview'}`, points: wallSnap.guidePoints });
        }
      }
    }

    return { point, guides, hostWallId };
  }, [
    entities.byId,
    entities.byType.wall,
    gridEnabled,
    gridSize,
    pointerWorld,
    toolMode,
    wallSnapEnabled,
    wallSnapThreshold,
  ]);

  const activeSnapGuides = useMemo(() => {
    const guides: Array<{ id: string; points: number[] }> = [];
    if (placementFeedback?.guides.length) guides.push(...placementFeedback.guides);
    if (endpointSnapGuide.length) guides.push(...endpointSnapGuide);
    return guides;
  }, [endpointSnapGuide, placementFeedback]);

  const previewHostWall = useMemo(() => {
    if (!placementFeedback?.hostWallId) return null;
    const wall = entities.byId[placementFeedback.hostWallId];
    if (!wall || wall.type !== 'wall' || wall.geometry.kind !== 'segment') return null;
    return wall;
  }, [entities.byId, placementFeedback?.hostWallId]);

  const marqueeBounds = useMemo(() => {
    if (!marqueeDraft) return null;
    return {
      minX: Math.min(marqueeDraft.start.x, marqueeDraft.end.x),
      minY: Math.min(marqueeDraft.start.y, marqueeDraft.end.y),
      maxX: Math.max(marqueeDraft.start.x, marqueeDraft.end.x),
      maxY: Math.max(marqueeDraft.start.y, marqueeDraft.end.y),
    };
  }, [marqueeDraft]);

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
    if (clickedOnEmpty && toolMode === 'select' && e.evt.shiftKey) {
      const point = stageRef.current.getPointerPosition();
      if (!point) return;
      const world = worldFromScreen(point.x, point.y, camera.panX, camera.panY, camera.zoom);
      setMarqueeDraft({ start: world, end: world });
      return;
    }

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
      const placementPoint = placementFeedback?.point ?? world;
      createElementAt(toolMode as AnnotationElementType, placementPoint.x, placementPoint.y);
    }
  }

  function onStageMouseMove() {
    const stage = stageRef.current;
    if (!stage) return;
    const point = stage.getPointerPosition();
    if (!point) return;
    const world = worldFromScreen(point.x, point.y, camera.panX, camera.panY, camera.zoom);
    setPointerWorld(world);
    if (marqueeDraft) {
      setMarqueeDraft((current) => current ? { ...current, end: world } : current);
    }
  }

  function onStageMouseUp() {
    if (!marqueeBounds) return;

    const intersectingIds = displayElements
      .filter((element) => {
        const bounds = elementBounds(element);
        return !(
          bounds.maxX < marqueeBounds.minX
          || bounds.minX > marqueeBounds.maxX
          || bounds.maxY < marqueeBounds.minY
          || bounds.minY > marqueeBounds.maxY
        );
      })
      .map((element) => element.id);

    setSelection(Array.from(new Set([...selection, ...intersectingIds])));
    setMarqueeDraft(null);
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

  function syncCameraToStage(node: Konva.Stage) {
    const nextPanX = node.x();
    const nextPanY = node.y();
    if (camera.panX === nextPanX && camera.panY === nextPanY) return;
    setCamera({ panX: nextPanX, panY: nextPanY });
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
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onMouseLeave={() => setPointerWorld(null)}
          onWheel={onWheel}
          draggable={toolMode === 'select' && !marqueeDraft}
          onDragMove={(e) => {
            const stage = e.target.getStage();
            if (stage) syncCameraToStage(stage);
          }}
          onDragEnd={(e) => {
            const stage = e.target.getStage();
            if (stage) syncCameraToStage(stage);
          }}
        >
          <Layer>
            <AnnotationRenderLayer
              elements={displayElements}
              selectedIds={selection}
              preset={viewPreset}
              issuesByElementId={renderHints.highlightIssues ? issuesByElementId : undefined}
              onSelect={(id, additive) => {
                if (!additive) {
                  setSelection([id]);
                  return;
                }
                setSelection(
                  selection.includes(id)
                    ? selection.filter((selectedId) => selectedId !== id)
                    : [...selection, id],
                );
              }}
              onDragEnd={onDragEnd}
              onTransformEnd={onTransformEnd}
            />
            <SnapGuideOverlay guides={activeSnapGuides} />
          </Layer>
          {marqueeBounds ? (
            <Layer listening={false}>
              <Line
                points={[
                  marqueeBounds.minX,
                  marqueeBounds.minY,
                  marqueeBounds.maxX,
                  marqueeBounds.minY,
                  marqueeBounds.maxX,
                  marqueeBounds.maxY,
                  marqueeBounds.minX,
                  marqueeBounds.maxY,
                  marqueeBounds.minX,
                  marqueeBounds.minY,
                ]}
                stroke="#22d3ee"
                strokeWidth={2}
                dash={[8, 4]}
                fill="rgba(34, 211, 238, 0.12)"
                closed
              />
            </Layer>
          ) : null}
          {previewHostWall ? (
            <Layer listening={false}>
              <Line
                points={[
                  previewHostWall.geometry.x1,
                  previewHostWall.geometry.y1,
                  previewHostWall.geometry.x2,
                  previewHostWall.geometry.y2,
                ]}
                stroke="#fbbf24"
                strokeWidth={Math.max(6, previewHostWall.geometry.thicknessPx + 4)}
                opacity={0.38}
              />
              {placementFeedback ? (
                <Circle
                  x={placementFeedback.point.x}
                  y={placementFeedback.point.y}
                  radius={8}
                  fill="#fbbf24"
                  opacity={0.9}
                />
              ) : null}
            </Layer>
          ) : null}
          {placementFeedback && (toolMode === 'door' || toolMode === 'window' || toolMode === 'room') ? (
            <Layer listening={false}>
              <Circle
                x={placementFeedback.point.x}
                y={placementFeedback.point.y}
                radius={6}
                fill={toolMode === 'door' ? '#fb7185' : toolMode === 'window' ? '#60a5fa' : '#22d3ee'}
                opacity={0.9}
              />
            </Layer>
          ) : null}
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
                  id: 'calibration-segment',
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
                const anchor = endpoint === 'start'
                  ? { x: wall.geometry.x2, y: wall.geometry.y2 }
                  : { x: wall.geometry.x1, y: wall.geometry.y1 };
                const snapped = snapWallEndpointAngle(anchor.x, anchor.y, x, y);
                const nextX = snapped.x;
                const nextY = snapped.y;
                if (endpoint === 'start') {
                  next.geometry.x1 = nextX;
                  next.geometry.y1 = nextY;
                } else {
                  next.geometry.x2 = nextX;
                  next.geometry.y2 = nextY;
                }
                next.attrs.status = 'edited';
                setEndpointSnapGuide(snapped.guidePoints ? [{ id: 'wall-angle-snap', points: snapped.guidePoints }] : []);
                updateElement(next);
              }}
              onWallEndpointCommit={() => setEndpointSnapGuide([])}
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
