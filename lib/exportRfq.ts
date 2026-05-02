import {
  calculateLaborSubtotal,
  calculateMarkupSubtotal,
  calculateMaterialSubtotal,
  calculateProjectTotal,
  readSavedCostRows,
  type CostRow,
  type RfqScopeRow,
} from '@/lib/mockWorkflowData';

const CATEGORY_ORDER: Array<RfqScopeRow['category']> = ['wall', 'door', 'window', 'floor'];

const CATEGORY_LABELS: Record<RfqScopeRow['category'], string> = {
  wall: 'WALLS',
  door: 'DOORS',
  window: 'WINDOWS',
  floor: 'FLOORING',
};

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function lineTotal(qty: number, cost: CostRow | undefined): number {
  if (!cost) return 0;
  const mat = qty * cost.unitCost;
  const lab = qty * cost.laborCost;
  return mat + lab + (mat + lab) * (cost.markupPct / 100);
}

export async function downloadRfqExcel(params: {
  projectId: string;
  sheetCode: string;
  sheetName: string;
  rows: RfqScopeRow[];
  totalQuantity: number;
}): Promise<void> {
  const { projectId, sheetCode, sheetName, rows } = params;

  // ── Cost data ─────────────────────────────────────────────────────────────
  const savedCostRows = readSavedCostRows(projectId) ?? [];
  const costMap = new Map(savedCostRows.map((r) => [r.id, r]));

  const matchedCostRows: CostRow[] = rows.map((row) => {
    const lookupId = row.costRowId ?? row.id.replace(/^rfq-/, '');
    const cost = costMap.get(lookupId);
    return cost
      ? { ...cost, derivedQuantity: row.quantity }
      : { id: row.id, item: row.item, derivedQuantity: row.quantity, unit: row.unit, unitCost: 0, laborCost: 0, markupPct: 0 };
  });

  const matSubtotal  = calculateMaterialSubtotal(matchedCostRows);
  const labSubtotal  = calculateLaborSubtotal(matchedCostRows);
  const markupAmount = calculateMarkupSubtotal(matchedCostRows);
  const grandTotal   = calculateProjectTotal(matchedCostRows);

  // ── Build sheet data (array of arrays) ───────────────────────────────────
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Rows stored as [#, Item, Description, Qty, Unit, UnitCost, Labor, Markup%, Total]
  // Numeric columns store raw numbers so Excel can format/use them in formulas.
  type Row = (string | number)[];

  const aoa: Row[] = [
    ['REQUEST FOR QUOTATION'],
    [`Project: ${projectId}`],
    [`Sheet: ${sheetCode} \u2013 ${sheetName}`],
    [`Date: ${dateStr}`],
    [],
    ['#', 'Item', 'Description', 'Qty', 'Unit', 'Unit Cost ($)', 'Labor/Unit ($)', 'Markup %', 'Line Total ($)'],
  ];

  let counter = 1;
  for (const cat of CATEGORY_ORDER) {
    const catRows = rows.filter((r) => r.category === cat);
    if (catRows.length === 0) continue;

    aoa.push([CATEGORY_LABELS[cat]]); // category header row

    for (const row of catRows) {
      const lookupId = row.costRowId ?? row.id.replace(/^rfq-/, '');
      const cost = costMap.get(lookupId);
      const total = lineTotal(row.quantity, cost);

      aoa.push([
        counter++,
        row.item,
        row.description,
        row.quantity,
        row.unit,
        cost ? cost.unitCost   : '',
        cost ? cost.laborCost  : '',
        cost ? cost.markupPct  : '',
        total > 0 ? total      : '',
      ]);
    }
  }

  // Cost summary
  aoa.push([]);
  aoa.push(['COST SUMMARY']);
  aoa.push(['Material Subtotal', '', '', '', '', '', '', '', matSubtotal]);
  aoa.push(['Labor Subtotal',    '', '', '', '', '', '', '', labSubtotal]);
  aoa.push(['Markup Amount',     '', '', '', '', '', '', '', markupAmount]);
  aoa.push(['Grand Total',       '', '', '', '', '', '', '', grandTotal]);

  // ── Write workbook ────────────────────────────────────────────────────────
  const XLSX = await import('xlsx');

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths (characters)
  ws['!cols'] = [
    { wch: 5  }, // #
    { wch: 28 }, // Item
    { wch: 32 }, // Description
    { wch: 10 }, // Qty
    { wch: 10 }, // Unit
    { wch: 14 }, // Unit Cost
    { wch: 14 }, // Labor/Unit
    { wch: 10 }, // Markup %
    { wch: 16 }, // Line Total
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RFQ Scope');

  const fileDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(wb, `rfq_${projectId}_${fileDateStr}.xlsx`);
}
