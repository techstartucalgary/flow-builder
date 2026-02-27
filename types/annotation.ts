export type AnnotationElementType =
  | 'wall'
  | 'door'
  | 'window'
  | 'room';

export type AnnotationStatus = 'auto' | 'edited' | 'new';

export type ToolMode =
  | 'select'
  | 'wall'
  | 'door'
  | 'window'
  | 'room'
  | 'delete';

export interface BaseElementAttrs {
  name?: string;
  confidence?: number;
  status: AnnotationStatus;
  locked: boolean;
  visible: boolean;
  notes?: string;
}

export interface SegmentGeometry {
  kind: 'segment';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessPx: number;
  rotationDeg: number;
}

export interface RectGeometry {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export type ElementGeometry = SegmentGeometry | RectGeometry;

export type OpeningSource = 'gap_matched' | 'tag_projected';

export interface OpeningRelations {
  hostWallId?: string;
  source?: OpeningSource;
  confidence?: number;
  tagIds?: string[];
}

export interface BaseAnnotationElement {
  id: string;
  type: AnnotationElementType;
  geometry: ElementGeometry;
  attrs: BaseElementAttrs;
  relations?: OpeningRelations | Record<string, unknown>;
}

export interface WallElement extends BaseAnnotationElement {
  type: 'wall';
  geometry: SegmentGeometry;
}

export interface DoorElement extends BaseAnnotationElement {
  type: 'door';
  geometry: RectGeometry;
}

export interface WindowElement extends BaseAnnotationElement {
  type: 'window';
  geometry: RectGeometry;
}

export interface RoomElement extends BaseAnnotationElement {
  type: 'room';
  geometry: RectGeometry;
}

export type AnnotationElement =
  | WallElement
  | DoorElement
  | WindowElement
  | RoomElement;

export interface AnnotationIssue {
  id: string;
  elementId: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface AnnotationLayers {
  wall: boolean;
  door: boolean;
  window: boolean;
  room: boolean;
}

export interface BaseImageRef {
  sourceUrl: string;
  widthPx: number;
  heightPx: number;
  scalePxPerFt?: number;
}

export interface AnnotationDocumentMeta {
  schemaVersion: number;
  source: 'cv_takeoff' | 'manual' | 'merged';
  createdAt: string;
  updatedAt: string;
  revision: number;
  coordinateSpaceId?: string;
}

export interface AnnotationDocument {
  documentId: string;
  projectId: string;
  page: number;
  baseImage: BaseImageRef;
  meta: AnnotationDocumentMeta;
  layers: AnnotationLayers;
  elements: AnnotationElement[];
  issues: AnnotationIssue[];
}

export interface EditorCameraState {
  zoom: number;
  panX: number;
  panY: number;
  minZoom: number;
  maxZoom: number;
}

export interface RevisionEvent {
  id: string;
  revisionId?: number;
  parentRevisionId?: number;
  actorId?: string;
  timestamp: string;
  operations: AnnotationOperation[];
}

export interface AnnotationOperation {
  kind: 'create' | 'delete' | 'update';
  elementId: string;
  element?: AnnotationElement;
  before?: AnnotationElement;
  after?: AnnotationElement;
}

export interface PersistedAnnotationSnapshot {
  document: AnnotationDocument;
  base_revision: number;
}

export interface AnnotationStorePayload {
  status: 'ok';
  document: AnnotationDocument | null;
  latest_revision: number;
}

export interface RevisionBatchPayload {
  parent_revision_id: number;
  actor_id?: string;
  events: RevisionEvent[];
}

export interface RevisionsResponse {
  status: 'ok';
  latest_revision: number;
  events: RevisionEvent[];
}

export interface CVWallSegment {
  id: string;
  start: [number, number];
  end: [number, number];
  thickness: number;
  visual_thickness: number;
  length_px: number;
}

export interface CVTag {
  id: string;
  tag_class: 'door' | 'window';
  center: [number, number];
  radius: number;
  confidence?: number;
}

export interface CVCropMetadata {
  left: number;
  top: number;
  right: number;
  bottom: number;
  dpi: number;
  page_number: number;
}

export interface CVOpening {
  id: string;
  tag_class: 'door' | 'window';
  bbox: [number, number, number, number];
  center: [number, number];
  wall_id?: string | null;
  tag_ids?: string[];
  source?: OpeningSource;
  confidence?: number;
}

export interface CVTakeoffResultPayload {
  walls: CVWallSegment[];
  openings?: CVOpening[];
  tags: CVTag[];
  metadata: {
    image_width: number;
    image_height: number;
    scale_px_per_ft?: number;
    coordinate_space_id?: string;
    crop?: CVCropMetadata;
  };
  preview_image?: string | null;
}

export interface EditorEntities {
  byId: Record<string, AnnotationElement>;
  byType: Record<AnnotationElementType, string[]>;
}

export interface EditorTagOverlayState {
  showTags: boolean;
  tags: CVTag[];
  coordinateSpaceId?: string;
}

export interface ProjectedOpeningVisibilityState {
  projectedOpeningMinConfidence: number;
  showLowConfidenceProjectedOpenings: boolean;
}
