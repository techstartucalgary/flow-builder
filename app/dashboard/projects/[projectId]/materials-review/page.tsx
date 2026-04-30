'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DoorOpen, House, Ruler, Square, type LucideIcon } from 'lucide-react';
import WorkflowWorkspaceShell from '@/components/project-workflow/WorkflowWorkspaceShell';
import {
  buildMaterialsFromCostRows,
  derivedMaterialColumns,
  mockCostRows,
  mockDerivedMaterials,
  type CostRow,
  type DerivedMaterialRow,
  readSavedCostRows,
  readSavedMaterials,
  writeSavedMaterials,
} from '@/lib/mockWorkflowData';

const SOURCE_GROUPS: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'walls', label: 'Walls', icon: Ruler },
  { id: 'doors', label: 'Doors', icon: DoorOpen },
  { id: 'windows', label: 'Windows', icon: Square },
  { id: 'rooms', label: 'Rooms/Areas', icon: House },
];

function createDefaultMaterials(): DerivedMaterialRow[] {
  return mockDerivedMaterials.map((row) => ({ ...row }));
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function MaterialsReviewPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const [rows, setRows] = useState<DerivedMaterialRow[]>(createDefaultMaterials);

  useEffect(() => {
    const savedMaterials = readSavedMaterials(projectId);
    if (savedMaterials?.length) {
      setRows(savedMaterials);
      return;
    }

    const savedCostRows = readSavedCostRows(projectId);
    const costRows: CostRow[] = savedCostRows?.length ? savedCostRows : mockCostRows;
    setRows(buildMaterialsFromCostRows(costRows));
  }, [projectId]);

  useEffect(() => {
    writeSavedMaterials(projectId, rows);
  }, [projectId, rows]);

  const readyCount = useMemo(() => rows.filter((row) => row.status === 'Ready').length, [rows]);
  const incompleteCount = useMemo(() => rows.length - readyCount, [rows.length, readyCount]);

  const updateTextField = (rowId: string, field: 'materialName' | 'unit' | 'sourceMeasurement', value: string) => {
    setRows((previous) => previous.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const updateQuantity = (rowId: string, value: string) => {
    setRows((previous) => previous.map((row) => (row.id === rowId ? { ...row, derivedQuantity: toNumber(value) } : row)));
  };

  const updateStatus = (rowId: string, value: DerivedMaterialRow['status']) => {
    setRows((previous) => previous.map((row) => (row.id === rowId ? { ...row, status: value } : row)));
  };

  const handleContinueToRfq = () => {
    writeSavedMaterials(projectId, rows);
    router.push(`/dashboard/projects/${projectId}/rfq-scope`);
  };

  return (
    <WorkflowWorkspaceShell
      projectId={projectId}
      currentStep="derived-materials"
      onBack={() => router.push(`/dashboard/projects/${projectId}/material-cost-table`)}
      leftRail={(
        <>
          <div className="border-b border-[var(--ws-divider)] px-4 py-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Source Groups</h2>
            <div className="mt-1 text-xs text-[var(--ws-text-muted)]">Derived from takeoff categories</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 dark-scrollbar">
            <div className="space-y-2">
              {SOURCE_GROUPS.map((group) => {
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
            <h2 className="text-lg font-semibold text-white">Derived Materials</h2>
            <div className="mt-1 text-xs text-[var(--ws-text-muted)]">Editable frontend stubs for workflow review</div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto dark-scrollbar">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-white/[0.03]">
                <tr>
                  {derivedMaterialColumns.map((column) => (
                    <th key={column} className="border-b border-[var(--ws-divider)] px-4 py-3 font-semibold text-[var(--ws-text-secondary)]">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="odd:bg-white/[0.012]">
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="text"
                        value={row.materialName}
                        onChange={(event) => updateTextField(row.id, 'materialName', event.target.value)}
                        className="w-full min-w-44 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.derivedQuantity}
                        onChange={(event) => updateQuantity(row.id, event.target.value)}
                        className="w-32 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(event) => updateTextField(row.id, 'unit', event.target.value)}
                        className="w-28 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <input
                        type="text"
                        value={row.sourceMeasurement}
                        onChange={(event) => updateTextField(row.id, 'sourceMeasurement', event.target.value)}
                        className="w-full min-w-44 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                      />
                    </td>
                    <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={row.status}
                          onChange={(event) => updateStatus(row.id, event.target.value as DerivedMaterialRow['status'])}
                          className="rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                        >
                          <option value="Ready">Ready</option>
                          <option value="Draft">Draft</option>
                        </select>
                        {row.status === 'Ready' ? <span className="ws-chip" data-tone="good">Ready</span> : <span className="ws-chip" data-tone="warn">Missing</span>}
                      </div>
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
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Readiness + Actions</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5 dark-scrollbar">
            <section className="action-card">
              <div className="action-card-title">Status</div>
              <div className="mt-4 space-y-3">
                <div className="summary-row">
                  <span>Total material rows</span>
                  <strong>{rows.length}</strong>
                </div>
                <div className="summary-row">
                  <span>Ready count</span>
                  <strong>{readyCount}</strong>
                </div>
                <div className="summary-row">
                  <span>Missing/incomplete</span>
                  <strong>{incompleteCount}</strong>
                </div>
              </div>
            </section>

            <section className="mt-4 workflow-action-stack">
              <div className="rounded-xl border border-cyan-300/18 bg-cyan-500/8 px-3 py-2 text-xs text-cyan-100">
                Next: generate RFQ scope from these reviewed materials.
              </div>
              <button type="button" onClick={handleContinueToRfq} className="workflow-action-btn workflow-action-btn-primary">
                Generate RFQ
              </button>
            </section>
          </div>
        </>
      )}
    />
  );
}
