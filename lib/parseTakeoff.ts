/**
 * Parse raw takeoff analysis text into structured metrics.
 * Structured backend fields are preferred; text parsing is fallback only.
 */

export type FloorAreaMethod =
  | 'enclosed_regions'
  | 'legacy_convex_hull_fallback'
  | 'missing_scale'
  | 'failed';

export type GeometrySource =
  | 'annotation_document'
  | 'cv_pipeline';

export type TakeoffConfidence =
  | 'high'
  | 'medium'
  | 'low';

export type RoomClosureStatus =
  | 'closed'
  | 'open'
  | 'ambiguous';

const CEILING_HEIGHT_FT = 9;
const WASTE_FACTOR = 0.15;
const SHEET_SIZE_SQFT = 48;

export interface TakeoffData {
  floorArea: number;
  floorAreaMethod: FloorAreaMethod;
  referenceFloorArea: number;
  referenceAreaDeltaSqFt: number;
  referenceAreaDeltaPct: number;
  grossWallBoard: number;
  netWallBoard: number;
  ceilingBoard: number;
  netBoardArea: number;
  wasteSqFt: number;
  areaWithWaste: number;
  sheetsRequired: number;
  ceilingHeightFt: number;
  sheetSizeSqFt: number;
  totalLinearFt: number;
  openingDeduction: number;
  doors: number;
  windows: number;
  geometrySource: GeometrySource;
  geometryRevisionUsed: number;
  geometryHash: string;
  takeoffConfidence: TakeoffConfidence;
  roomClosureStatus: RoomClosureStatus;
  unclosedGapCount: number;
  largestBoundaryGapFt: number;
  unmatchedOpeningCount: number;
  normalizedWallCount: number;
  normalizedOpeningCount: number;
  waste: number;
  summary: string;
}

export const EMPTY_TAKEOFF: TakeoffData = {
  floorArea: 0,
  floorAreaMethod: 'failed',
  referenceFloorArea: 0,
  referenceAreaDeltaSqFt: 0,
  referenceAreaDeltaPct: 0,
  grossWallBoard: 0,
  netWallBoard: 0,
  ceilingBoard: 0,
  netBoardArea: 0,
  wasteSqFt: 0,
  areaWithWaste: 0,
  sheetsRequired: 0,
  ceilingHeightFt: CEILING_HEIGHT_FT,
  sheetSizeSqFt: SHEET_SIZE_SQFT,
  totalLinearFt: 0,
  openingDeduction: 0,
  doors: 0,
  windows: 0,
  geometrySource: 'cv_pipeline',
  geometryRevisionUsed: 0,
  geometryHash: '',
  takeoffConfidence: 'low',
  roomClosureStatus: 'open',
  unclosedGapCount: 0,
  largestBoundaryGapFt: 0,
  unmatchedOpeningCount: 0,
  normalizedWallCount: 0,
  normalizedOpeningCount: 0,
  waste: Math.round(WASTE_FACTOR * 100),
  summary: '',
};

type TakeoffResponse = Record<string, unknown>;

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isFloorAreaMethod(value: unknown): value is FloorAreaMethod {
  return value === 'enclosed_regions'
    || value === 'legacy_convex_hull_fallback'
    || value === 'missing_scale'
    || value === 'failed';
}

function isGeometrySource(value: unknown): value is GeometrySource {
  return value === 'annotation_document'
    || value === 'cv_pipeline';
}

function isTakeoffConfidence(value: unknown): value is TakeoffConfidence {
  return value === 'high'
    || value === 'medium'
    || value === 'low';
}

function isRoomClosureStatus(value: unknown): value is RoomClosureStatus {
  return value === 'closed'
    || value === 'open'
    || value === 'ambiguous';
}

export function mapStructuredTakeoff(data: TakeoffResponse): TakeoffData | null {
  const hasStructured =
    typeof data.floor_area_sqft === 'number'
    || typeof data.net_wall_board_sqft === 'number'
    || typeof data.sheets_required === 'number'
    || typeof data.cv_doors === 'number'
    || typeof data.cv_windows === 'number';

  if (!hasStructured) {
    return null;
  }

  const floorArea = asNumber(data.floor_area_sqft)
    ?? asNumber(data.total_area_sqft)
    ?? 0;
  const netWallBoard = asNumber(data.net_wall_board_sqft)
    ?? asNumber(data.net_drywall_sqft)
    ?? 0;
  const grossWallBoard = asNumber(data.gross_wall_board_sqft)
    ?? asNumber(data.gross_drywall_sqft)
    ?? 0;
  const openingDeduction = asNumber(data.opening_deduction_sqft) ?? 0;
  const ceilingBoard = asNumber(data.ceiling_board_sqft) ?? 0;
  const netBoardArea = asNumber(data.net_board_area_sqft) ?? (netWallBoard + ceilingBoard);
  const wasteFactor = asNumber(data.waste_factor) ?? WASTE_FACTOR;
  const wasteSqFt = asNumber(data.waste_sqft) ?? (netBoardArea * wasteFactor);
  const areaWithWaste = asNumber(data.area_with_waste_sqft) ?? (netBoardArea + wasteSqFt);
  const sheetSizeSqFt = asNumber(data.sheet_size_sqft) ?? SHEET_SIZE_SQFT;
  const sheetsRequired = asNumber(data.sheets_required) ?? (
    areaWithWaste > 0 && sheetSizeSqFt > 0 ? Math.ceil(areaWithWaste / sheetSizeSqFt) : 0
  );

  return {
    floorArea,
    floorAreaMethod: isFloorAreaMethod(data.floor_area_method) ? data.floor_area_method : 'failed',
    referenceFloorArea: asNumber(data.reference_floor_area_sqft) ?? 0,
    referenceAreaDeltaSqFt: asNumber(data.reference_area_delta_sqft) ?? 0,
    referenceAreaDeltaPct: asNumber(data.reference_area_delta_pct) ?? 0,
    grossWallBoard,
    netWallBoard,
    ceilingBoard,
    netBoardArea,
    wasteSqFt,
    areaWithWaste,
    sheetsRequired,
    ceilingHeightFt: asNumber(data.ceiling_height_ft) ?? CEILING_HEIGHT_FT,
    sheetSizeSqFt,
    totalLinearFt: asNumber(data.total_linear_ft) ?? 0,
    openingDeduction,
    doors: asNumber(data.cv_doors) ?? 0,
    windows: asNumber(data.cv_windows) ?? 0,
    geometrySource: isGeometrySource(data.geometry_source) ? data.geometry_source : 'cv_pipeline',
    geometryRevisionUsed: asNumber(data.geometry_revision_used) ?? 0,
    geometryHash: asString(data.geometry_hash) ?? '',
    takeoffConfidence: isTakeoffConfidence(data.takeoff_confidence) ? data.takeoff_confidence : 'low',
    roomClosureStatus: isRoomClosureStatus(data.room_closure_status) ? data.room_closure_status : 'open',
    unclosedGapCount: asNumber(data.unclosed_gap_count) ?? 0,
    largestBoundaryGapFt: asNumber(data.largest_boundary_gap_ft) ?? 0,
    unmatchedOpeningCount: asNumber(data.unmatched_opening_count) ?? 0,
    normalizedWallCount: asNumber(data.normalized_wall_count) ?? 0,
    normalizedOpeningCount: asNumber(data.normalized_opening_count) ?? 0,
    waste: Math.round(wasteFactor * 100),
    summary: asString(data.analysis) ?? '',
  };
}

/** Normalize smart quotes and strip markdown bold markers. */
function normalize(s: string): string {
  return s
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/\*\*/g, '');
}

/** Convert dimension string like 42'-10" or 42'-10 1/2" to decimal feet. */
function dimToFeet(s: string): number {
  const n = normalize(s);
  const m = n.match(/(\d+)'\s*-?\s*(\d+)(?:\s+(\d+)\/(\d+))?\s*"/);
  if (!m) {
    const feetOnly = n.match(/(\d+)'/);
    return feetOnly ? parseInt(feetOnly[1], 10) : 0;
  }
  const feet = parseInt(m[1], 10);
  let inches = parseInt(m[2], 10);
  if (m[3] && m[4]) {
    inches += parseInt(m[3], 10) / parseInt(m[4], 10);
  }
  return feet + inches / 12;
}

function countTags(block: string): number {
  const tags = new Set<string>();
  const re = /Tag\s+(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    tags.add(match[1]);
  }
  return tags.size;
}

function countBullets(block: string): number {
  return block.split('\n').filter((line) => /^\s*[\*-]\s+\w/.test(line)).length;
}

export function parseTakeoff(raw: string): TakeoffData {
  const text = normalize(raw);

  let floorArea = 0;
  const areaPatterns = [
    /Floor area:\s*([0-9,.]+)/i,
    /Total Area:\s*([0-9,.]+)/i,
    /TOTAL\s+(?:BASEMENT\s+)?(?:DEVELOPMENT|AREA)[:\s]*([0-9,]+)\s*SQ/i,
    /(\d{1,3}(?:,\d{3})+)\s*SQ(?:UARE)?\.?\s*F(?:EE)?T/i,
    /(\d{3,6})\s*SQ(?:UARE)?\.?\s*F(?:EE)?T/i,
  ];
  for (const pattern of areaPatterns) {
    const match = text.match(pattern);
    if (match) {
      floorArea = parseFloat(match[1].replace(/,/g, ''));
      if (floorArea > 0) {
        break;
      }
    }
  }

  let doors = 0;
  const doorSection = text.match(/Door\s+Schedule[\s\S]*?(?=###|\n##|$)/i);
  if (doorSection) {
    const doorTags = new Set<string>();
    const re = /Tag\s+(\d{3})/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(doorSection[0])) !== null) {
      doorTags.add(match[1]);
    }
    doors = doorTags.size;
    if (doors === 0) {
      doors = countBullets(doorSection[0]);
    }
  }

  let windows = 0;
  const windowSection = text.match(/Window\s+Schedule[\s\S]*?(?=Door\s+Schedule|###|\n##|$)/i);
  if (windowSection) {
    windows = countTags(windowSection[0]);
    if (windows === 0) {
      windows = countBullets(windowSection[0]);
    }
  }

  let totalLinearFt = 0;
  const widthMatch = text.match(/Overall\s+Width[^:]*:\s*([^\n]+)/i);
  const depthMatch = text.match(/Overall\s+Depth[^:]*:\s*([^\n]+)/i);
  if (widthMatch && depthMatch) {
    totalLinearFt = 2 * (dimToFeet(widthMatch[1]) + dimToFeet(depthMatch[1]));
  }

  if (totalLinearFt === 0) {
    const allDims: number[] = [];
    const dimRe = /(\d{2,3})'\s*-?\s*(\d{1,2})(?:\s+\d+\/\d+)?\s*"/g;
    let match: RegExpExecArray | null;
    while ((match = dimRe.exec(text)) !== null) {
      const feet = parseInt(match[1], 10) + parseInt(match[2], 10) / 12;
      if (feet > 10) {
        allDims.push(feet);
      }
    }
    if (allDims.length >= 2) {
      allDims.sort((a, b) => b - a);
      totalLinearFt = 2 * (allDims[0] + allDims[1]);
    }
  }

  const grossWallBoard = totalLinearFt * CEILING_HEIGHT_FT * 2;
  const openingDeduction = doors * 21 + windows * 12;
  const netWallBoard = Math.max(0, Math.round(grossWallBoard - openingDeduction));
  const ceilingBoard = floorArea > 0 ? floorArea : 0;
  const netBoardArea = netWallBoard + ceilingBoard;
  const wasteSqFt = Math.round(netBoardArea * WASTE_FACTOR);
  const areaWithWaste = netBoardArea + wasteSqFt;
  const sheetsRequired = areaWithWaste > 0 ? Math.ceil(areaWithWaste / SHEET_SIZE_SQFT) : 0;

  return {
    floorArea,
    floorAreaMethod: floorArea > 0 ? 'legacy_convex_hull_fallback' : 'failed',
    referenceFloorArea: 0,
    referenceAreaDeltaSqFt: 0,
    referenceAreaDeltaPct: 0,
    grossWallBoard,
    netWallBoard,
    ceilingBoard,
    netBoardArea,
    wasteSqFt,
    areaWithWaste,
    sheetsRequired,
    ceilingHeightFt: CEILING_HEIGHT_FT,
    sheetSizeSqFt: SHEET_SIZE_SQFT,
    totalLinearFt,
    openingDeduction,
    doors,
    windows,
    geometrySource: 'cv_pipeline',
    geometryRevisionUsed: 0,
    geometryHash: '',
    takeoffConfidence: 'low',
    roomClosureStatus: 'open',
    unclosedGapCount: 0,
    largestBoundaryGapFt: 0,
    unmatchedOpeningCount: 0,
    normalizedWallCount: 0,
    normalizedOpeningCount: 0,
    waste: Math.round(WASTE_FACTOR * 100),
    summary: raw,
  };
}
