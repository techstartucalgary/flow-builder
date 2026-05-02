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

export async function downloadRfqPdf(params: {
  projectId: string;
  sheetCode: string;
  sheetName: string;
  rows: RfqScopeRow[];
  totalQuantity: number;
}): Promise<void> {
  const { projectId, sheetCode, sheetName, rows } = params;

  // ── Load cost data ────────────────────────────────────────────────────────
  const savedCostRows = readSavedCostRows(projectId) ?? [];
  // RFQ row ids are prefixed with 'rfq-', cost row ids are the bare id
  const costMap = new Map(savedCostRows.map((r) => [r.id, r]));

  // Build a cost-enriched cost rows array aligned to the visible RFQ rows
  // so we can compute totals for the summary section.
  // Use row.costRowId (threaded from blueprint/passthrough resolvers) so the
  // lookup works for both mock blueprint rows (concrete-block-exterior → exterior-walls)
  // and real takeoff passthrough rows (perimeter-walls → perimeter-walls).
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

  // ── PDF setup ─────────────────────────────────────────────────────────────
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 297mm landscape
  const margin = 14;

  // ── Header ────────────────────────────────────────────────────────────────
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('REQUEST FOR QUOTATION', margin, y);

  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Project: ${projectId}`, margin, y);

  y += 6;
  doc.text(`Sheet: ${sheetCode} \u2013 ${sheetName}`, margin, y);

  y += 6;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(`Date: ${dateStr}`, margin, y);

  y += 5;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);

  // ── Table body ────────────────────────────────────────────────────────────
  // Each row is a plain array: [#, Item, Description, Qty, Unit, UnitCost, Labor, Markup%, Total]
  // Category headers span all 9 columns using jspdf-autotable's cell object format.
  type TableRow = (string | number | { content: string; colSpan: number; styles: Record<string, unknown> })[];

  const body: TableRow[] = [];
  let counter = 1;

  for (const cat of CATEGORY_ORDER) {
    const catRows = rows.filter((r) => r.category === cat);
    if (catRows.length === 0) continue;

    // Category header — single cell spanning all 9 columns
    body.push([
      {
        content: CATEGORY_LABELS[cat],
        colSpan: 9,
        styles: {
          fillColor: [226, 232, 240],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8.5,
          cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        },
      },
    ]);

    for (const row of catRows) {
      const lookupId = row.costRowId ?? row.id.replace(/^rfq-/, '');
      const cost = costMap.get(lookupId);
      const total = lineTotal(row.quantity, cost);

      body.push([
        counter++,
        row.item,
        row.description,
        row.quantity,
        row.unit,
        cost ? USD.format(cost.unitCost) : '—',
        cost ? USD.format(cost.laborCost) : '—',
        cost ? `${cost.markupPct}%` : '—',
        total > 0 ? USD.format(total) : '—',
      ]);
    }
  }

  autoTable(doc, {
    startY: y + 4,
    margin: { left: margin, right: margin },
    head: [[
      { content: '#',          styles: { halign: 'center', cellWidth: 9 } },
      { content: 'Item',       styles: { cellWidth: 35 } },
      { content: 'Description',styles: { cellWidth: 'auto' } },
      { content: 'Qty',        styles: { halign: 'right', cellWidth: 18 } },
      { content: 'Unit',       styles: { halign: 'center', cellWidth: 16 } },
      { content: 'Unit Cost',  styles: { halign: 'right', cellWidth: 24 } },
      { content: 'Labor/Unit', styles: { halign: 'right', cellWidth: 24 } },
      { content: 'Markup',     styles: { halign: 'center', cellWidth: 18 } },
      { content: 'Line Total', styles: { halign: 'right', cellWidth: 26 } },
    ]],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: body as any,
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
      8: { halign: 'right' },
    },
  });

  // ── Cost summary ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? doc.internal.pageSize.getHeight() - 50;
  let sy = finalY + 8;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(margin, sy, pageW - margin, sy);

  sy += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Cost Summary', margin, sy);

  const labelX = margin + 60;
  const valueX = margin + 110;

  const summaryRows: [string, string][] = [
    ['Material Subtotal',  USD.format(matSubtotal)],
    ['Labor Subtotal',     USD.format(labSubtotal)],
    ['Markup Amount',      USD.format(markupAmount)],
    ['Grand Total',        USD.format(grandTotal)],
  ];

  for (const [label, value] of summaryRows) {
    sy += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(label, labelX, sy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(value, valueX, sy, { align: 'right' });
  }

  // Grand total rule
  sy += 2;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(labelX, sy, valueX, sy);

  // ── Download ──────────────────────────────────────────────────────────────
  const fileDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`rfq_${projectId}_${fileDateStr}.pdf`);
}
