'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Database, DoorOpen, Paintbrush, Ruler, Square, House, type LucideIcon } from 'lucide-react';
import WorkflowWorkspaceShell from '@/components/project-workflow/WorkflowWorkspaceShell';
import {
  buildCostRowsFromTakeoff,
  buildMaterialsFromCostRows,
  calculateCostRowTotal,
  calculateLaborSubtotal,
  calculateMarkupSubtotal,
  calculateMaterialSubtotal,
  calculateProjectTotal,
  materialCostColumns,
  mockCostRows,
  type CostRow,
  readSavedCostRows,
  readSavedTakeoffSnapshot,
  writeSavedCostRows,
  writeSavedMaterials,
} from '@/lib/mockWorkflowData';

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COST_GROUPS: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'walls', label: 'Walls', icon: Ruler },
  { id: 'doors', label: 'Doors', icon: DoorOpen },
  { id: 'windows', label: 'Windows', icon: Square },
  { id: 'rooms', label: 'Rooms/Areas', icon: House },
  { id: 'finishes', label: 'Finishes', icon: Paintbrush },
];

function createDefaultRows(): CostRow[] {
  return mockCostRows.map((row) => ({ ...row }));
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function MaterialCostTablePage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const [rows, setRows] = useState<CostRow[]>(createDefaultRows);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    // Priority 1: user's previously saved cost rows
    const savedRows = readSavedCostRows(projectId);
    if (savedRows?.length) {
      setRows(savedRows);
      return;
    }
    // Priority 2: rows derived from the most recent takeoff snapshot
    // (written by the project viewer when the builder clicks "Continue to Review")
    const snapshot = readSavedTakeoffSnapshot(projectId);
    if (snapshot) {
      const takeoffRows = buildCostRowsFromTakeoff(snapshot);
      if (takeoffRows.length > 0) {
        setRows(takeoffRows);
        return;
      }
    }
    // Priority 3: mock data (already set as initial state via createDefaultRows)
  }, [projectId]);

  useEffect(() => {
    writeSavedCostRows(projectId, rows);
  }, [projectId, rows]);

  const materialSubtotal = useMemo(() => calculateMaterialSubtotal(rows), [rows]);
  const laborSubtotal = useMemo(() => calculateLaborSubtotal(rows), [rows]);
  const markupAmount = useMemo(() => calculateMarkupSubtotal(rows), [rows]);
  const finalEstimateTotal = useMemo(() => calculateProjectTotal(rows), [rows]);

  const updateField = (rowId: string, field: 'unit' | 'derivedQuantity' | 'unitCost' | 'laborCost' | 'markupPct', value: string) => {
    setRows((previous) => previous.map((row) => {
      if (row.id !== rowId) return row;
      if (field === 'unit') return { ...row, unit: value };
      return { ...row, [field]: toNumber(value) };
    }));
  };

  const handleSaveDraft = () => {
    writeSavedCostRows(projectId, rows);
    writeSavedMaterials(projectId, buildMaterialsFromCostRows(rows));
    setSavedAt(new Date().toLocaleString());
  };

  const handleContinue = () => {
    writeSavedCostRows(projectId, rows);
    writeSavedMaterials(projectId, buildMaterialsFromCostRows(rows));
    router.push(`/dashboard/projects/${projectId}/materials-review`);
  };

  return (
    <WorkflowWorkspaceShell
      projectId={projectId}
      currentStep="material-cost"
      onBack={() => router.push(`/dashboard/projects/${projectId}`)}
      leftRail={(
        <>
          <div className="border-b border-[var(--ws-divider)] px-4 py-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Cost Inputs</h2>
            <div className="mt-1 text-xs text-[var(--ws-text-muted)]">Takeoff-linked categories</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 dark-scrollbar">
            <div className="space-y-2">
              {COST_GROUPS.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.id} className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2.5 text-sm font-medium text-white">
                    <Icon size={15} className="text-cyan-200" />
                    <span>{group.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      centerRail={(
        <section className="ws-panel-flat flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-[var(--ws-divider)] px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Material Cost Table</h2>
            <div className="mt-1 text-xs text-[var(--ws-text-muted)]">Editable stub pricing with takeoff-derived quantities</div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto dark-scrollbar">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-white/[0.03]">
                <tr>
                  {materialCostColumns.map((column) => (
                    <th key={column} className="border-b border-[var(--ws-divider)] px-4 py-3 font-semibold text-[var(--ws-text-secondary)]">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="odd:bg-white/[0.012]">
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3 font-medium text-white">{row.item}</td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.derivedQuantity}
                          onChange={(event) => updateField(row.id, 'derivedQuantity', event.target.value)}
                          className="w-28 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                        />
                        <span className="ws-chip" data-tone="accent">
                          <Database size={12} />
                          Takeoff
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(event) => updateField(row.id, 'unit', event.target.value)}
                        className="w-24 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unitCost}
                        onChange={(event) => updateField(row.id, 'unitCost', event.target.value)}
                        className="w-28 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.laborCost}
                        onChange={(event) => updateField(row.id, 'laborCost', event.target.value)}
                        className="w-28 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={row.markupPct}
                        onChange={(event) => updateField(row.id, 'markupPct', event.target.value)}
                        className="w-24 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3 font-semibold text-cyan-100">
                      {CURRENCY_FORMATTER.format(calculateCostRowTotal(row))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      rightRail={(
        <>
          <div className="border-b border-[var(--ws-divider)] px-4 py-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Cost Summary</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5 dark-scrollbar">
            <section className="action-card">
              <div className="action-card-title">Estimate Breakdown</div>
              <div className="mt-4 space-y-3">
                <div className="summary-row">
                  <span>Material subtotal</span>
                  <strong>{CURRENCY_FORMATTER.format(materialSubtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>Labor subtotal</span>
                  <strong>{CURRENCY_FORMATTER.format(laborSubtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>Markup amount</span>
                  <strong>{CURRENCY_FORMATTER.format(markupAmount)}</strong>
                </div>
                <div className="summary-row">
                  <span>Final estimate total</span>
                  <strong>{CURRENCY_FORMATTER.format(finalEstimateTotal)}</strong>
                </div>
              </div>
            </section>

            <section className="mt-4">
              <div className="mb-3 rounded-xl border border-cyan-300/18 bg-cyan-500/8 px-3 py-2 text-xs text-cyan-100">
                Next: review derived materials before generating RFQ scope.
              </div>
              <div className="workflow-action-stack">
                <button
                  type="button"
                  onClick={handleContinue}
                  className="workflow-action-btn workflow-action-btn-primary"
                >
                  Continue to Derived Materials
                </button>
              </div>
              <button type="button" onClick={handleSaveDraft} className="mt-2 w-full workflow-action-link">
                Save Draft
              </button>
              {savedAt ? (
                <div className="mt-2 text-xs text-[var(--ws-text-secondary)]">Draft saved at {savedAt}</div>
              ) : null}
            </section>
          </div>
        </>
      )}
    />
  );
}
