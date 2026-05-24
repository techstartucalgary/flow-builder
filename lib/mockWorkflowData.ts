import type { TakeoffData } from '@/lib/parseTakeoff';

export type CostRow = {
  id: string;
  item: string;
  derivedQuantity: number;
  unit: string;
  unitCost: number;
  laborCost: number;
  markupPct: number;
};

export type DerivedMaterialRow = {
  id: string;
  materialName: string;
  derivedQuantity: number;
  unit: string;
  sourceMeasurement: string;
  status: 'Ready' | 'Draft';
  /** ID of the CostRow this material was derived from (used for cost lookup in PDF export). */
  costRowId?: string;
};

export type RfqScopeRow = {
  id: string;
  item: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
  category: 'wall' | 'door' | 'window' | 'floor';
  /** ID of the source CostRow — used to look up unit/labor/markup in the PDF export. */
  costRowId?: string;
};

export type WorkflowSheet = {
  id: string;
  code: string;
  name: string;
  status: 'Selected' | 'Ready';
};

export type SavedRfqSummary = {
  createdAt: string;
  sheetCode: string;
  sheetName: string;
  lineItemCount: number;
  quantityTotal: number;
};

export const materialCostColumns = ['Item', 'Derived Quantity', 'Unit', 'Unit Cost', 'Labor Cost', 'Markup', 'Total'] as const;
export const derivedMaterialColumns = ['Material Name', 'Derived Quantity', 'Unit', 'Source Measurement', 'Status'] as const;
export const rfqScopeColumns = ['Item', 'Description', 'Quantity', 'Unit', 'Notes'] as const;
export const rfqScopeActions = ['Filter', 'Sort', 'More'] as const;
export const rfqScopeFilters = ['All', 'Walls', 'Doors', 'Windows', 'Flooring'] as const;
export const rfqScopeSorts = ['Default', 'Quantity (High-Low)', 'Quantity (Low-High)', 'Item (A-Z)'] as const;

// ---------------------------------------------------------------------------
// Mock / placeholder data (used as fallback when no takeoff has been run yet)
// ---------------------------------------------------------------------------

export const mockCostRows: CostRow[] = [
  { id: 'exterior-walls',  item: 'Exterior Walls',  derivedQuantity: 320, unit: 'sq ft',  unitCost: 8.5,   laborCost: 2.4,  markupPct: 10 },
  { id: 'interior-walls',  item: 'Interior Walls',  derivedQuantity: 120, unit: 'sq ft',  unitCost: 5.75,  laborCost: 2.1,  markupPct: 10 },
  { id: 'swing-doors',     item: 'Swing Doors',     derivedQuantity: 30,  unit: 'each',   unitCost: 240,   laborCost: 65,   markupPct: 8  },
  { id: 'sliding-doors',   item: 'Sliding Doors',   derivedQuantity: 8,   unit: 'each',   unitCost: 325,   laborCost: 70,   markupPct: 8  },
  { id: 'type-a-windows',  item: 'Type A Windows',  derivedQuantity: 18,  unit: 'each',   unitCost: 180,   laborCost: 45,   markupPct: 8  },
  { id: 'type-b-windows',  item: 'Type B Windows',  derivedQuantity: 12,  unit: 'each',   unitCost: 220,   laborCost: 55,   markupPct: 8  },
  { id: 'bedrooms',        item: 'Bedrooms',        derivedQuantity: 5,   unit: 'room',   unitCost: 1400,  laborCost: 420,  markupPct: 12 },
  { id: 'bathrooms',       item: 'Bathrooms',       derivedQuantity: 4,   unit: 'room',   unitCost: 1850,  laborCost: 510,  markupPct: 12 },
  { id: 'living-kitchen',  item: 'Living/Kitchen',  derivedQuantity: 3,   unit: 'room',   unitCost: 2600,  laborCost: 730,  markupPct: 12 },
];

export const mockDerivedMaterials: DerivedMaterialRow[] = [
  { id: 'concrete-block-exterior', materialName: 'Concrete Block - Exterior',  derivedQuantity: 320,  unit: 'sq ft',   sourceMeasurement: 'Exterior walls',              status: 'Ready' },
  { id: 'drywall-sf-interior',     materialName: 'Drywall SF - Interior',       derivedQuantity: 120,  unit: 'sq ft',   sourceMeasurement: 'Interior walls',              status: 'Ready' },
  { id: 'linear-ft-interior-6',    materialName: 'Linear Ft - Interior 6"',     derivedQuantity: 72,   unit: 'lin ft',  sourceMeasurement: 'Interior walls',              status: 'Ready' },
  { id: 'door-units-swing',        materialName: 'Door Units - Swing',          derivedQuantity: 30,   unit: 'units',   sourceMeasurement: 'Swing doors',                 status: 'Ready' },
  { id: 'window-units-type-a',     materialName: 'Window Units - Type A',       derivedQuantity: 18,   unit: 'units',   sourceMeasurement: 'Type A windows',              status: 'Ready' },
  { id: 'flooring-sf-bedrooms',    materialName: 'Flooring SF - Bedrooms',      derivedQuantity: 750,  unit: 'sq ft',   sourceMeasurement: 'Bedrooms',                    status: 'Ready' },
  { id: 'flooring-sf-interior',    materialName: 'Flooring SF - Interior',      derivedQuantity: 1460, unit: 'sq ft',   sourceMeasurement: 'Living/Kitchen + Bathrooms',  status: 'Ready' },
];

export const mockRfqScopeRows: RfqScopeRow[] = [
  { id: 'rfq-exterior-wall', item: 'Exterior Wall',  description: 'Concrete Block - 12"', quantity: 320, unit: 'sq ft', notes: 'Main perimeter wall run', category: 'wall' },
  { id: 'rfq-interior-wall', item: 'Interior Wall',  description: 'Drywall - 6"',         quantity: 120, unit: 'sq ft', notes: 'Partition scope',         category: 'wall' },
  { id: 'rfq-door-a',        item: 'Door Type A',    description: 'Hollow Metal',          quantity: 6,   unit: 'each',  notes: 'Level 2 corridor',        category: 'door' },
  { id: 'rfq-door-b',        item: 'Door Type B',    description: 'Hollow Metal',          quantity: 6,   unit: 'each',  notes: 'Typical detail B',        category: 'door' },
  { id: 'rfq-door-c',        item: 'Door Type C',    description: 'Hollow Metal',          quantity: 6,   unit: 'each',  notes: 'Lobby sequence',          category: 'door' },
  { id: 'rfq-door-d',        item: 'Door Type D',    description: 'Hollow Metal',          quantity: 6,   unit: 'each',  notes: 'Service entry',           category: 'door' },
  { id: 'rfq-door-e',        item: 'Door Type E',    description: 'Hollow Metal',          quantity: 6,   unit: 'each',  notes: 'Mechanical room',         category: 'door' },
];

export const mockSheets: WorkflowSheet[] = [
  { id: 'a102', code: 'A102', name: 'Upper Floor Plan', status: 'Selected' },
  { id: 'a200', code: 'A200', name: 'Roof Plan',        status: 'Ready'    },
  { id: 'a301', code: 'A301', name: 'Exterior Shell',   status: 'Ready'    },
  { id: 'as02', code: 'AS02', name: 'Interior Shell',   status: 'Ready'    },
];

// ---------------------------------------------------------------------------
// Stale-data detection
//
// Both the cost-table and materials-review pages auto-save on every render,
// including the very first mount when rows are still placeholder data.
// These sets let us detect that a saved blob is stale mock data so we can
// replace it cleanly when a real takeoff arrives.
// ---------------------------------------------------------------------------

/** Cost row IDs that belong exclusively to the mock/placeholder data set. */
const MOCK_COST_IDS = new Set([
  'exterior-walls', 'interior-walls', 'swing-doors', 'sliding-doors',
  'type-a-windows', 'type-b-windows', 'bedrooms', 'bathrooms', 'living-kitchen',
]);

/** Material row IDs produced by the legacy blueprint resolvers (mock data). */
const MOCK_MATERIAL_IDS = new Set([
  'concrete-block-exterior', 'drywall-sf-interior', 'linear-ft-interior-6',
  'door-units-swing', 'window-units-type-a', 'flooring-sf-bedrooms', 'flooring-sf-interior',
]);

/** True when every row in the array came from the mock/placeholder cost set. */
export function areMockCostRows(rows: CostRow[]): boolean {
  return rows.length > 0 && rows.every((r) => MOCK_COST_IDS.has(r.id));
}

/** True when every row in the array came from the mock/placeholder materials set. */
export function areMockMaterials(rows: DerivedMaterialRow[]): boolean {
  return rows.length > 0 && rows.every((r) => MOCK_MATERIAL_IDS.has(r.id));
}

// ---------------------------------------------------------------------------
// Legacy blueprint resolvers (kept for backward-compat with mock cost rows)
// ---------------------------------------------------------------------------

// MOCK_SOURCE_IDS is an alias for MOCK_COST_IDS used inside buildMaterialsFromCostRows
const MOCK_SOURCE_IDS = MOCK_COST_IDS;

const materialBlueprints: Array<{
  id: string;
  costRowId: string;
  materialName: string;
  unit: string;
  sourceMeasurement: string;
  status: 'Ready' | 'Draft';
  resolver: (costMap: Map<string, CostRow>) => number;
}> = [
  {
    id: 'concrete-block-exterior',
    costRowId: 'exterior-walls',
    materialName: 'Concrete Block - Exterior',
    unit: 'sq ft',
    sourceMeasurement: 'Exterior walls',
    status: 'Ready',
    resolver: (m) => m.get('exterior-walls')?.derivedQuantity ?? 0,
  },
  {
    id: 'drywall-sf-interior',
    costRowId: 'interior-walls',
    materialName: 'Drywall SF - Interior',
    unit: 'sq ft',
    sourceMeasurement: 'Interior walls',
    status: 'Ready',
    resolver: (m) => m.get('interior-walls')?.derivedQuantity ?? 0,
  },
  {
    id: 'linear-ft-interior-6',
    costRowId: 'interior-walls',
    materialName: 'Linear Ft - Interior 6"',
    unit: 'lin ft',
    sourceMeasurement: 'Interior walls',
    status: 'Ready',
    resolver: (m) => (m.get('interior-walls')?.derivedQuantity ?? 0) * 0.6,
  },
  {
    id: 'door-units-swing',
    costRowId: 'swing-doors',
    materialName: 'Door Units - Swing',
    unit: 'units',
    sourceMeasurement: 'Swing doors',
    status: 'Ready',
    resolver: (m) => m.get('swing-doors')?.derivedQuantity ?? 0,
  },
  {
    id: 'window-units-type-a',
    costRowId: 'type-a-windows',
    materialName: 'Window Units - Type A',
    unit: 'units',
    sourceMeasurement: 'Type A windows',
    status: 'Ready',
    resolver: (m) => m.get('type-a-windows')?.derivedQuantity ?? 0,
  },
  {
    id: 'flooring-sf-bedrooms',
    costRowId: 'bedrooms',
    materialName: 'Flooring SF - Bedrooms',
    unit: 'sq ft',
    sourceMeasurement: 'Bedrooms',
    status: 'Ready',
    resolver: (m) => (m.get('bedrooms')?.derivedQuantity ?? 0) * 150,
  },
  {
    id: 'flooring-sf-interior',
    costRowId: 'living-kitchen',
    materialName: 'Flooring SF - Interior',
    unit: 'sq ft',
    sourceMeasurement: 'Living/Kitchen + Bathrooms',
    status: 'Ready',
    resolver: (m) =>
      ((m.get('living-kitchen')?.derivedQuantity ?? 0) * 320) +
      ((m.get('bathrooms')?.derivedQuantity ?? 0) * 125),
  },
];

// ---------------------------------------------------------------------------
// Takeoff → cost row conversion
// ---------------------------------------------------------------------------

const TAKEOFF_ROW_DEFAULTS: Record<string, { unitCost: number; laborCost: number; markupPct: number }> = {
  'perimeter-walls':    { unitCost: 8.50,  laborCost: 2.40, markupPct: 10 },
  'partition-walls':    { unitCost: 5.75,  laborCost: 2.10, markupPct: 10 },
  'unclassified-walls': { unitCost: 7.00,  laborCost: 2.20, markupPct: 10 },
  'net-wall-board':     { unitCost: 7.00,  laborCost: 2.40, markupPct: 10 },
  'ceiling-drywall':    { unitCost: 6.00,  laborCost: 3.50, markupPct: 10 },
  'drywall-sheets':     { unitCost: 24.00, laborCost: 0.00, markupPct: 10 },
  'doors':              { unitCost: 240,   laborCost: 65,   markupPct: 8  },
  'windows':            { unitCost: 180,   laborCost: 45,   markupPct: 8  },
};
const FLOORING_DEFAULTS = { unitCost: 0, laborCost: 0, markupPct: 10 };

/**
 * Convert a completed TakeoffData into an initial set of CostRows with real
 * quantities sourced directly from the CV pipeline measurements.
 * Only rows with quantity > 0 are included.
 */
export function buildCostRowsFromTakeoff(takeoff: TakeoffData): CostRow[] {
  const rows: CostRow[] = [];

  function push(id: string, item: string, qty: number, unit: string) {
    if (qty <= 0) return;
    const d = TAKEOFF_ROW_DEFAULTS[id] ?? { unitCost: 0, laborCost: 0, markupPct: 10 };
    rows.push({ id, item, derivedQuantity: round2(qty), unit, ...d });
  }

  push('perimeter-walls',    'Perimeter Walls',       takeoff.perimeterBoardSqFt, 'sq ft');
  push('partition-walls',    'Partition Walls',        takeoff.partitionBoardSqFt, 'sq ft');
  push('unclassified-walls', 'Unclassified Walls',     takeoff.unknownBoardSqFt,   'sq ft');
  push('ceiling-drywall',    'Ceiling Drywall',        takeoff.ceilingBoard,       'sq ft');
  push('doors',              'Doors',                  takeoff.doors,              'each');
  push('windows',            'Windows',                takeoff.windows,            'each');
  push('drywall-sheets',     'Drywall Sheets (4×12)',  takeoff.sheetsRequired,     'sheets');

  for (const [material, summary] of Object.entries(takeoff.flooringByMaterial)) {
    if (summary.area_sqft > 0) {
      const label = material.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      rows.push({
        id: `flooring-${material}`,
        item: `Flooring – ${label}`,
        derivedQuantity: round2(summary.area_sqft),
        unit: 'sq ft',
        ...FLOORING_DEFAULTS,
      });
    }
  }

  // Fallback: no surface breakdown but net wall board is known
  const hasWallRows = rows.some((r) =>
    r.id === 'perimeter-walls' || r.id === 'partition-walls' || r.id === 'unclassified-walls',
  );
  if (!hasWallRows && takeoff.netWallBoard > 0) {
    push('net-wall-board', 'Net Wall Drywall', takeoff.netWallBoard, 'sq ft');
  }

  return rows;
}

/**
 * Called from the project viewer when the builder clicks "Continue to Review".
 *
 * Saves the raw takeoff snapshot AND writes (or cleanly merges) cost rows:
 *
 *   • No prior data              → write fresh takeoff rows
 *   • Prior data is stale mock   → replace entirely, clear stale materials too
 *   • Prior data has real rows   → update quantities, keep user's pricing
 */
export function syncTakeoffToCostTable(projectId: string, takeoff: TakeoffData): void {
  writeSavedTakeoffSnapshot(projectId, takeoff);

  const freshRows = buildCostRowsFromTakeoff(takeoff);
  if (freshRows.length === 0) return;

  const existingRows = readSavedCostRows(projectId);

  // No prior data → write fresh rows
  if (!existingRows?.length) {
    writeSavedCostRows(projectId, freshRows);
    return;
  }

  // Stale mock data → replace entirely and purge stale derived materials so
  // downstream pages don't read the old placeholders from localStorage.
  if (areMockCostRows(existingRows)) {
    writeSavedCostRows(projectId, freshRows);
    _evictStaleMockMaterials(projectId);
    return;
  }

  // Real rows from a previous takeoff → merge: update quantities, keep pricing.
  const freshMap = new Map(freshRows.map((r) => [r.id, r]));
  const existingIdSet = new Set(existingRows.map((r) => r.id));

  const merged: CostRow[] = existingRows.map((row) => {
    const fresh = freshMap.get(row.id);
    return fresh ? { ...row, derivedQuantity: fresh.derivedQuantity } : row;
  });

  for (const freshRow of freshRows) {
    if (!existingIdSet.has(freshRow.id)) merged.push(freshRow);
  }

  writeSavedCostRows(projectId, merged);
  _evictStaleMockMaterials(projectId);
}

/** Remove saved materials only when they are still the placeholder mock set. */
function _evictStaleMockMaterials(projectId: string): void {
  if (typeof window === 'undefined') return;
  const saved = readSavedMaterials(projectId);
  if (saved && areMockMaterials(saved)) {
    window.localStorage.removeItem(workflowStorageKey(projectId, 'materials'));
  }
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

export function calculateCostRowMaterialAmount(row: CostRow): number {
  return row.derivedQuantity * row.unitCost;
}

export function calculateCostRowLaborAmount(row: CostRow): number {
  return row.derivedQuantity * row.laborCost;
}

export function calculateCostRowMarkupAmount(row: CostRow): number {
  const base = calculateCostRowMaterialAmount(row) + calculateCostRowLaborAmount(row);
  return base * (row.markupPct / 100);
}

export function calculateCostRowTotal(row: CostRow): number {
  const base = calculateCostRowMaterialAmount(row) + calculateCostRowLaborAmount(row);
  return base + calculateCostRowMarkupAmount(row);
}

export function calculateMaterialSubtotal(rows: CostRow[]): number {
  return rows.reduce((sum, row) => sum + calculateCostRowMaterialAmount(row), 0);
}

export function calculateLaborSubtotal(rows: CostRow[]): number {
  return rows.reduce((sum, row) => sum + calculateCostRowLaborAmount(row), 0);
}

export function calculateMarkupSubtotal(rows: CostRow[]): number {
  return rows.reduce((sum, row) => sum + calculateCostRowMarkupAmount(row), 0);
}

export function calculateProjectTotal(rows: CostRow[]): number {
  return rows.reduce((sum, row) => sum + calculateCostRowTotal(row), 0);
}

// ---------------------------------------------------------------------------
// Derivation: cost rows → material rows
// ---------------------------------------------------------------------------

/**
 * Builds derived material rows from cost rows.
 *
 * • When mock cost IDs are present  → run legacy blueprint resolvers
 *   (preserves transformations like the lin-ft ×0.6 factor).
 * • For every other ID (real takeoff rows) → 1:1 passthrough so quantities
 *   are never silently dropped.
 */
export function buildMaterialsFromCostRows(rows: CostRow[]): DerivedMaterialRow[] {
  const costMap = new Map(rows.map((row) => [row.id, row]));

  const hasMockData = rows.some((r) => MOCK_SOURCE_IDS.has(r.id));

  const blueprintRows: DerivedMaterialRow[] = hasMockData
    ? materialBlueprints.map((bp) => ({
        id: bp.id,
        costRowId: bp.costRowId,
        materialName: bp.materialName,
        unit: bp.unit,
        sourceMeasurement: bp.sourceMeasurement,
        status: bp.status,
        derivedQuantity: round2(bp.resolver(costMap)),
      }))
    : [];

  const passthroughRows: DerivedMaterialRow[] = rows
    .filter((row) => !MOCK_SOURCE_IDS.has(row.id) && row.derivedQuantity > 0)
    .map((row) => ({
      id: row.id,
      costRowId: row.id,
      materialName: row.item,
      unit: row.unit,
      sourceMeasurement: row.item,
      status: 'Ready' as const,
      derivedQuantity: row.derivedQuantity,
    }));

  return [...blueprintRows, ...passthroughRows];
}

// ---------------------------------------------------------------------------
// Derivation: material rows → RFQ scope rows
// ---------------------------------------------------------------------------

function inferRfqCategory(id: string, name: string): RfqScopeRow['category'] {
  const key = `${id} ${name}`.toLowerCase();
  if (key.includes('door'))                          return 'door';
  if (key.includes('window'))                        return 'window';
  if (key.includes('floor') || key.includes('flooring')) return 'floor';
  return 'wall';
}

/**
 * Builds RFQ scope rows from material rows.
 * Fully dynamic — works identically with mock data or real takeoff data.
 * Category is inferred from each row's ID and name.
 */
export function buildRfqScopeFromMaterials(materials: DerivedMaterialRow[]): RfqScopeRow[] {
  return materials
    .filter((m) => m.derivedQuantity > 0)
    .map((m) => ({
      id: `rfq-${m.id}`,
      item: m.materialName,
      description: m.sourceMeasurement,
      quantity: m.derivedQuantity,
      unit: m.unit,
      notes: '',
      category: inferRfqCategory(m.id, m.materialName),
      costRowId: m.costRowId ?? m.id,
    }));
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function workflowStorageKey(projectId: string, suffix: string): string {
  return `flowbuildr:workflow:${projectId}:${suffix}`;
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Cost rows ---

export function readSavedCostRows(projectId: string): CostRow[] | null {
  if (typeof window === 'undefined') return null;
  const parsed = safeParse<Array<Partial<CostRow> & { quantity?: number }>>(
    window.localStorage.getItem(workflowStorageKey(projectId, 'costRows')),
  );
  if (!parsed || !Array.isArray(parsed)) return null;
  return parsed
    .map((row) => ({
      id: row.id ?? '',
      item: row.item ?? '',
      derivedQuantity: typeof row.derivedQuantity === 'number' ? row.derivedQuantity : (row.quantity ?? 0),
      unit: row.unit ?? 'each',
      unitCost:   typeof row.unitCost   === 'number' ? row.unitCost   : 0,
      laborCost:  typeof row.laborCost  === 'number' ? row.laborCost  : 0,
      markupPct:  typeof row.markupPct  === 'number' ? row.markupPct  : 0,
    }))
    .filter((row) => row.id && row.item);
}

export function writeSavedCostRows(projectId: string, rows: CostRow[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workflowStorageKey(projectId, 'costRows'), JSON.stringify(rows));
}

// --- Materials ---

export function readSavedMaterials(projectId: string): DerivedMaterialRow[] | null {
  if (typeof window === 'undefined') return null;
  const parsed = safeParse<DerivedMaterialRow[]>(
    window.localStorage.getItem(workflowStorageKey(projectId, 'materials')),
  );
  return parsed && Array.isArray(parsed) ? parsed : null;
}

export function writeSavedMaterials(projectId: string, rows: DerivedMaterialRow[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workflowStorageKey(projectId, 'materials'), JSON.stringify(rows));
}

// --- RFQ summary ---

export function readSavedRfqSummary(projectId: string): SavedRfqSummary | null {
  if (typeof window === 'undefined') return null;
  return safeParse<SavedRfqSummary>(
    window.localStorage.getItem(workflowStorageKey(projectId, 'rfqSummary')),
  );
}

export function writeSavedRfqSummary(projectId: string, summary: SavedRfqSummary): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workflowStorageKey(projectId, 'rfqSummary'), JSON.stringify(summary));
}

// --- Takeoff snapshot ---

/** Persist the raw takeoff so downstream pages can always read real quantities. */
export function writeSavedTakeoffSnapshot(projectId: string, takeoff: TakeoffData): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workflowStorageKey(projectId, 'takeoffSnapshot'), JSON.stringify(takeoff));
}

/** Read back the most recently saved takeoff snapshot for this project. */
export function readSavedTakeoffSnapshot(projectId: string): TakeoffData | null {
  if (typeof window === 'undefined') return null;
  return safeParse<TakeoffData>(
    window.localStorage.getItem(workflowStorageKey(projectId, 'takeoffSnapshot')),
  );
}
