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
};

export type RfqScopeRow = {
  id: string;
  item: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
  category: 'wall' | 'door' | 'window' | 'floor';
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

export const mockCostRows: CostRow[] = [
  { id: 'exterior-walls', item: 'Exterior Walls', derivedQuantity: 320, unit: 'sq ft', unitCost: 8.5, laborCost: 2.4, markupPct: 10 },
  { id: 'interior-walls', item: 'Interior Walls', derivedQuantity: 120, unit: 'sq ft', unitCost: 5.75, laborCost: 2.1, markupPct: 10 },
  { id: 'swing-doors', item: 'Swing Doors', derivedQuantity: 30, unit: 'each', unitCost: 240, laborCost: 65, markupPct: 8 },
  { id: 'sliding-doors', item: 'Sliding Doors', derivedQuantity: 8, unit: 'each', unitCost: 325, laborCost: 70, markupPct: 8 },
  { id: 'type-a-windows', item: 'Type A Windows', derivedQuantity: 18, unit: 'each', unitCost: 180, laborCost: 45, markupPct: 8 },
  { id: 'type-b-windows', item: 'Type B Windows', derivedQuantity: 12, unit: 'each', unitCost: 220, laborCost: 55, markupPct: 8 },
  { id: 'bedrooms', item: 'Bedrooms', derivedQuantity: 5, unit: 'room', unitCost: 1400, laborCost: 420, markupPct: 12 },
  { id: 'bathrooms', item: 'Bathrooms', derivedQuantity: 4, unit: 'room', unitCost: 1850, laborCost: 510, markupPct: 12 },
  { id: 'living-kitchen', item: 'Living/Kitchen', derivedQuantity: 3, unit: 'room', unitCost: 2600, laborCost: 730, markupPct: 12 },
];

export const mockDerivedMaterials: DerivedMaterialRow[] = [
  { id: 'concrete-block-exterior', materialName: 'Concrete Block - Exterior', derivedQuantity: 320, unit: 'sq ft', sourceMeasurement: 'Exterior walls', status: 'Ready' },
  { id: 'drywall-sf-interior', materialName: 'Drywall SF - Interior', derivedQuantity: 120, unit: 'sq ft', sourceMeasurement: 'Interior walls', status: 'Ready' },
  { id: 'linear-ft-interior-6', materialName: 'Linear Ft - Interior 6"', derivedQuantity: 72, unit: 'lin ft', sourceMeasurement: 'Interior walls', status: 'Ready' },
  { id: 'door-units-swing', materialName: 'Door Units - Swing', derivedQuantity: 30, unit: 'units', sourceMeasurement: 'Swing doors', status: 'Ready' },
  { id: 'window-units-type-a', materialName: 'Window Units - Type A', derivedQuantity: 18, unit: 'units', sourceMeasurement: 'Type A windows', status: 'Ready' },
  { id: 'flooring-sf-bedrooms', materialName: 'Flooring SF - Bedrooms', derivedQuantity: 750, unit: 'sq ft', sourceMeasurement: 'Bedrooms', status: 'Ready' },
  { id: 'flooring-sf-interior', materialName: 'Flooring SF - Interior', derivedQuantity: 1460, unit: 'sq ft', sourceMeasurement: 'Living/Kitchen + Bathrooms', status: 'Ready' },
];

export const mockRfqScopeRows: RfqScopeRow[] = [
  { id: 'rfq-exterior-wall', item: 'Exterior Wall', description: 'Concrete Block - 12"', quantity: 320, unit: 'sq ft', notes: 'Main perimeter wall run', category: 'wall' },
  { id: 'rfq-interior-wall', item: 'Interior Wall', description: 'Drywall - 6"', quantity: 120, unit: 'sq ft', notes: 'Partition scope', category: 'wall' },
  { id: 'rfq-door-a', item: 'Door Type A', description: 'Hollow Metal', quantity: 6, unit: 'each', notes: 'Level 2 corridor', category: 'door' },
  { id: 'rfq-door-b', item: 'Door Type B', description: 'Hollow Metal', quantity: 6, unit: 'each', notes: 'Typical detail B', category: 'door' },
  { id: 'rfq-door-c', item: 'Door Type C', description: 'Hollow Metal', quantity: 6, unit: 'each', notes: 'Lobby sequence', category: 'door' },
  { id: 'rfq-door-d', item: 'Door Type D', description: 'Hollow Metal', quantity: 6, unit: 'each', notes: 'Service entry', category: 'door' },
  { id: 'rfq-door-e', item: 'Door Type E', description: 'Hollow Metal', quantity: 6, unit: 'each', notes: 'Mechanical room', category: 'door' },
];

export const mockSheets: WorkflowSheet[] = [
  { id: 'a102', code: 'A102', name: 'Upper Floor Plan', status: 'Selected' },
  { id: 'a200', code: 'A200', name: 'Roof Plan', status: 'Ready' },
  { id: 'a301', code: 'A301', name: 'Exterior Shell', status: 'Ready' },
  { id: 'as02', code: 'AS02', name: 'Interior Shell', status: 'Ready' },
];

const materialBlueprints: Array<{
  id: string;
  materialName: string;
  unit: string;
  sourceMeasurement: string;
  status: 'Ready' | 'Draft';
  resolver: (costMap: Map<string, CostRow>) => number;
}> = [
  {
    id: 'concrete-block-exterior',
    materialName: 'Concrete Block - Exterior',
    unit: 'sq ft',
    sourceMeasurement: 'Exterior walls',
    status: 'Ready',
    resolver: (costMap) => costMap.get('exterior-walls')?.derivedQuantity ?? 0,
  },
  {
    id: 'drywall-sf-interior',
    materialName: 'Drywall SF - Interior',
    unit: 'sq ft',
    sourceMeasurement: 'Interior walls',
    status: 'Ready',
    resolver: (costMap) => costMap.get('interior-walls')?.derivedQuantity ?? 0,
  },
  {
    id: 'linear-ft-interior-6',
    materialName: 'Linear Ft - Interior 6"',
    unit: 'lin ft',
    sourceMeasurement: 'Interior walls',
    status: 'Ready',
    resolver: (costMap) => (costMap.get('interior-walls')?.derivedQuantity ?? 0) * 0.6,
  },
  {
    id: 'door-units-swing',
    materialName: 'Door Units - Swing',
    unit: 'units',
    sourceMeasurement: 'Swing doors',
    status: 'Ready',
    resolver: (costMap) => costMap.get('swing-doors')?.derivedQuantity ?? 0,
  },
  {
    id: 'window-units-type-a',
    materialName: 'Window Units - Type A',
    unit: 'units',
    sourceMeasurement: 'Type A windows',
    status: 'Ready',
    resolver: (costMap) => costMap.get('type-a-windows')?.derivedQuantity ?? 0,
  },
  {
    id: 'flooring-sf-bedrooms',
    materialName: 'Flooring SF - Bedrooms',
    unit: 'sq ft',
    sourceMeasurement: 'Bedrooms',
    status: 'Ready',
    resolver: (costMap) => (costMap.get('bedrooms')?.derivedQuantity ?? 0) * 150,
  },
  {
    id: 'flooring-sf-interior',
    materialName: 'Flooring SF - Interior',
    unit: 'sq ft',
    sourceMeasurement: 'Living/Kitchen + Bathrooms',
    status: 'Ready',
    resolver: (costMap) => ((costMap.get('living-kitchen')?.derivedQuantity ?? 0) * 320) + ((costMap.get('bathrooms')?.derivedQuantity ?? 0) * 125),
  },
];

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

export function buildMaterialsFromCostRows(rows: CostRow[]): DerivedMaterialRow[] {
  const costMap = new Map(rows.map((row) => [row.id, row]));
  return materialBlueprints.map((blueprint) => ({
    id: blueprint.id,
    materialName: blueprint.materialName,
    unit: blueprint.unit,
    sourceMeasurement: blueprint.sourceMeasurement,
    status: blueprint.status,
    derivedQuantity: Number(blueprint.resolver(costMap).toFixed(2)),
  }));
}

export function buildRfqScopeFromMaterials(materials: DerivedMaterialRow[]): RfqScopeRow[] {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const swingCount = materialMap.get('door-units-swing')?.derivedQuantity ?? 30;
  const eachDoorTypeQty = Math.max(1, Number((swingCount / 5).toFixed(0)));

  return mockRfqScopeRows.map((row) => {
    if (row.id === 'rfq-exterior-wall') {
      return {
        ...row,
        quantity: materialMap.get('concrete-block-exterior')?.derivedQuantity ?? row.quantity,
      };
    }

    if (row.id === 'rfq-interior-wall') {
      return {
        ...row,
        quantity: materialMap.get('drywall-sf-interior')?.derivedQuantity ?? row.quantity,
      };
    }

    if (row.category === 'door') {
      return {
        ...row,
        quantity: eachDoorTypeQty,
      };
    }

    return row;
  });
}

function workflowStorageKey(projectId: string, suffix: string): string {
  return `flowbuildr:workflow:${projectId}:${suffix}`;
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function readSavedCostRows(projectId: string): CostRow[] | null {
  if (typeof window === 'undefined') return null;
  const parsed = safeParse<Array<Partial<CostRow> & { quantity?: number }>>(window.localStorage.getItem(workflowStorageKey(projectId, 'costRows')));
  if (!parsed || !Array.isArray(parsed)) return null;

  return parsed.map((row) => ({
    id: row.id ?? '',
    item: row.item ?? '',
    derivedQuantity: typeof row.derivedQuantity === 'number' ? row.derivedQuantity : (row.quantity ?? 0),
    unit: row.unit ?? 'each',
    unitCost: typeof row.unitCost === 'number' ? row.unitCost : 0,
    laborCost: typeof row.laborCost === 'number' ? row.laborCost : 0,
    markupPct: typeof row.markupPct === 'number' ? row.markupPct : 0,
  })).filter((row) => row.id && row.item);
}

export function writeSavedCostRows(projectId: string, rows: CostRow[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workflowStorageKey(projectId, 'costRows'), JSON.stringify(rows));
}

export function readSavedMaterials(projectId: string): DerivedMaterialRow[] | null {
  if (typeof window === 'undefined') return null;
  const parsed = safeParse<DerivedMaterialRow[]>(window.localStorage.getItem(workflowStorageKey(projectId, 'materials')));
  return parsed && Array.isArray(parsed) ? parsed : null;
}

export function writeSavedMaterials(projectId: string, rows: DerivedMaterialRow[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workflowStorageKey(projectId, 'materials'), JSON.stringify(rows));
}

export function readSavedRfqSummary(projectId: string): SavedRfqSummary | null {
  if (typeof window === 'undefined') return null;
  return safeParse<SavedRfqSummary>(window.localStorage.getItem(workflowStorageKey(projectId, 'rfqSummary')));
}

export function writeSavedRfqSummary(projectId: string, summary: SavedRfqSummary): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(workflowStorageKey(projectId, 'rfqSummary'), JSON.stringify(summary));
}
