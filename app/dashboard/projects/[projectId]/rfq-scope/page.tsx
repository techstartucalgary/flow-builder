'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDownWideNarrow, Ellipsis, SlidersHorizontal } from 'lucide-react';
import WorkflowWorkspaceShell from '@/components/project-workflow/WorkflowWorkspaceShell';
import {
  buildRfqScopeFromMaterials,
  mockRfqScopeRows,
  mockSheets,
  readSavedMaterials,
  readSavedRfqSummary,
  rfqScopeActions,
  rfqScopeColumns,
  rfqScopeFilters,
  rfqScopeSorts,
  type DerivedMaterialRow,
  type RfqScopeRow,
  type SavedRfqSummary,
  type WorkflowSheet,
  writeSavedRfqSummary,
} from '@/lib/mockWorkflowData';

type SortMode = (typeof rfqScopeSorts)[number];
type FilterMode = (typeof rfqScopeFilters)[number];

function createDefaultSheets(): WorkflowSheet[] {
  return mockSheets.map((sheet) => ({ ...sheet }));
}

function createDefaultScopeRows(): RfqScopeRow[] {
  return mockRfqScopeRows.map((row) => ({ ...row }));
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function RfqScopePage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const [sheets, setSheets] = useState<WorkflowSheet[]>(createDefaultSheets);
  const [rows, setRows] = useState<RfqScopeRow[]>(createDefaultScopeRows);
  const [filterMode, setFilterMode] = useState<FilterMode>('All');
  const [sortMode, setSortMode] = useState<SortMode>('Default');
  const [showMorePanel, setShowMorePanel] = useState(false);
  const [summary, setSummary] = useState<SavedRfqSummary | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [previewAt, setPreviewAt] = useState<string | null>(null);

  useEffect(() => {
    const savedMaterials = readSavedMaterials(projectId);
    if (!savedMaterials?.length) return;
    setRows(buildRfqScopeFromMaterials(savedMaterials as DerivedMaterialRow[]));
  }, [projectId]);

  useEffect(() => {
    const savedSummary = readSavedRfqSummary(projectId);
    if (savedSummary) {
      setSummary(savedSummary);
    }
  }, [projectId]);

  const selectedSheet = useMemo(
    () => sheets.find((sheet) => sheet.status === 'Selected') ?? sheets[0],
    [sheets],
  );

  const visibleRows = useMemo(() => {
    let next = [...rows];

    if (filterMode !== 'All') {
      const categoryMap: Record<Exclude<FilterMode, 'All'>, RfqScopeRow['category']> = {
        Walls: 'wall',
        Doors: 'door',
        Windows: 'window',
        Flooring: 'floor',
      };
      next = next.filter((row) => row.category === categoryMap[filterMode]);
    }

    if (sortMode === 'Quantity (High-Low)') {
      next.sort((a, b) => b.quantity - a.quantity);
    } else if (sortMode === 'Quantity (Low-High)') {
      next.sort((a, b) => a.quantity - b.quantity);
    } else if (sortMode === 'Item (A-Z)') {
      next.sort((a, b) => a.item.localeCompare(b.item));
    }

    return next;
  }, [filterMode, rows, sortMode]);

  const totalQuantity = useMemo(
    () => Number(visibleRows.reduce((sum, row) => sum + row.quantity, 0).toFixed(2)),
    [visibleRows],
  );

  const updateSheet = (sheetId: string) => {
    setSheets((previous) => previous.map((sheet) => ({
      ...sheet,
      status: sheet.id === sheetId ? 'Selected' : 'Ready',
    })));
  };

  const updateRowField = (rowId: string, field: 'item' | 'description' | 'unit' | 'notes', value: string) => {
    setRows((previous) => previous.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const updateRowQuantity = (rowId: string, value: string) => {
    setRows((previous) => previous.map((row) => (row.id === rowId ? { ...row, quantity: toNumber(value) } : row)));
  };

  const handleGenerateRfq = () => {
    const now = new Date();
    const nextSummary: SavedRfqSummary = {
      createdAt: now.toLocaleString(),
      sheetCode: selectedSheet.code,
      sheetName: selectedSheet.name,
      lineItemCount: visibleRows.length,
      quantityTotal: totalQuantity,
    };
    setSummary(nextSummary);
    writeSavedRfqSummary(projectId, nextSummary);
  };

  const cycleFilter = () => {
    const currentIndex = rfqScopeFilters.indexOf(filterMode);
    const nextIndex = (currentIndex + 1) % rfqScopeFilters.length;
    setFilterMode(rfqScopeFilters[nextIndex]);
  };

  const cycleSort = () => {
    const currentIndex = rfqScopeSorts.indexOf(sortMode);
    const nextIndex = (currentIndex + 1) % rfqScopeSorts.length;
    setSortMode(rfqScopeSorts[nextIndex]);
  };

  return (
    <WorkflowWorkspaceShell
      projectId={projectId}
      currentStep="rfq-scope"
      onBack={() => router.push(`/dashboard/projects/${projectId}/materials-review`)}
      leftRail={(
        <>
          <div className="border-b border-[var(--ws-divider)] px-4 py-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">RFQ Sections</h2>
            <div className="mt-1 text-xs text-[var(--ws-text-muted)]">Follow this order for clean output</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 dark-scrollbar">
            <div className="space-y-2">
              <div className="rounded-lg border border-[var(--ws-border)] bg-white/[0.04] px-3 py-2.5 text-sm text-white">
                1. Select sheet
              </div>
              <div className="rounded-lg border border-[var(--ws-border)] bg-white/[0.04] px-3 py-2.5 text-sm text-white">
                2. Review/edit scope rows
              </div>
              <div className="rounded-lg border border-[var(--ws-border)] bg-white/[0.04] px-3 py-2.5 text-sm text-white">
                3. Preview then generate RFQ
              </div>
            </div>
          </div>
        </>
      )}
      centerRail={(
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <section className="ws-panel-flat px-4 py-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sheets.map((sheet) => {
                const selected = sheet.status === 'Selected';
                return (
                  <button
                    key={sheet.id}
                    type="button"
                    onClick={() => updateSheet(sheet.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-cyan-300/50 bg-cyan-400/15'
                        : 'border-[var(--ws-border)] bg-white/[0.02] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">{sheet.code}</div>
                      <span className="ws-chip" data-tone={selected ? 'accent' : 'good'}>
                        {selected ? 'Selected' : 'Ready'}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-[var(--ws-text-secondary)]">{sheet.name}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ws-panel-flat flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ws-divider)] px-4 py-3">
              <h2 className="text-base font-semibold text-white">RFQ Scope for {selectedSheet.code}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={cycleFilter}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--ws-border)] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-[var(--ws-text-secondary)] transition hover:bg-white/[0.08] hover:text-white"
                  title={rfqScopeActions[0]}
                >
                  <SlidersHorizontal size={13} />
                  Filter
                </button>
                <button
                  type="button"
                  onClick={cycleSort}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--ws-border)] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-[var(--ws-text-secondary)] transition hover:bg-white/[0.08] hover:text-white"
                  title={rfqScopeActions[1]}
                >
                  <ArrowDownWideNarrow size={13} />
                  Sort
                </button>
                <button
                  type="button"
                  onClick={() => setShowMorePanel((previous) => !previous)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--ws-border)] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-[var(--ws-text-secondary)] transition hover:bg-white/[0.08] hover:text-white"
                  title={rfqScopeActions[2]}
                >
                  <Ellipsis size={13} />
                  More
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ws-divider)] bg-white/[0.02] px-4 py-3 text-xs">
              <label className="text-[var(--ws-text-muted)]" htmlFor="rfq-filter">Filter</label>
              <select
                id="rfq-filter"
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as FilterMode)}
                className="rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2 py-1.5 text-xs text-white outline-none transition focus:border-cyan-400/60"
              >
                {rfqScopeFilters.map((filter) => (
                  <option key={filter} value={filter}>{filter}</option>
                ))}
              </select>

              <label className="ml-2 text-[var(--ws-text-muted)]" htmlFor="rfq-sort">Sort</label>
              <select
                id="rfq-sort"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2 py-1.5 text-xs text-white outline-none transition focus:border-cyan-400/60"
              >
                {rfqScopeSorts.map((sort) => (
                  <option key={sort} value={sort}>{sort}</option>
                ))}
              </select>
            </div>

            {showMorePanel ? (
              <div className="border-b border-[var(--ws-divider)] bg-cyan-500/[0.07] px-4 py-3 text-sm text-cyan-100">
                Additional RFQ controls can be wired here later (bid package groups, vendor pools, alternates).
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto dark-scrollbar">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="bg-white/[0.03]">
                  <tr>
                    {rfqScopeColumns.map((column) => (
                      <th key={column} className="border-b border-[var(--ws-divider)] px-4 py-3 font-semibold text-[var(--ws-text-secondary)]">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id} className="odd:bg-white/[0.012]">
                      <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                        <input
                          type="text"
                          value={row.item}
                          onChange={(event) => updateRowField(row.id, 'item', event.target.value)}
                          className="w-full min-w-40 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                        />
                      </td>
                      <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(event) => updateRowField(row.id, 'description', event.target.value)}
                          className="w-full min-w-44 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                        />
                      </td>
                      <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.quantity}
                          onChange={(event) => updateRowQuantity(row.id, event.target.value)}
                          className="w-24 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                        />
                      </td>
                      <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                        <input
                          type="text"
                          value={row.unit}
                          onChange={(event) => updateRowField(row.id, 'unit', event.target.value)}
                          className="w-24 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                        />
                      </td>
                      <td className="border-b border-[var(--ws-divider)] px-4 py-3">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(event) => updateRowField(row.id, 'notes', event.target.value)}
                          className="w-full min-w-44 rounded-lg border border-[var(--ws-border)] bg-slate-950/70 px-2.5 py-1.5 text-sm text-white outline-none transition focus:border-cyan-400/60"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      rightRail={(
        <>
          <div className="border-b border-[var(--ws-divider)] px-4 py-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">RFQ Summary + Actions</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5 dark-scrollbar">
            <section className="action-card">
              <div className="action-card-title">Current Scope</div>
              <div className="mt-4 space-y-3">
                <div className="summary-row">
                  <span>Selected sheet</span>
                  <strong>{selectedSheet.code}</strong>
                </div>
                <div className="summary-row">
                  <span>Line item count</span>
                  <strong>{visibleRows.length}</strong>
                </div>
                <div className="summary-row">
                  <span>Total quantity</span>
                  <strong>{totalQuantity}</strong>
                </div>
                <div className="summary-row">
                  <span>Generation status</span>
                  <strong>{summary ? 'Generated' : 'Draft'}</strong>
                </div>
                <div className="summary-row">
                  <span>Last generated</span>
                  <strong>{summary?.createdAt ?? 'Not generated yet'}</strong>
                </div>
              </div>
            </section>

            <section className="mt-4 workflow-action-stack">
              <button
                type="button"
                onClick={() => setPreviewAt(new Date().toLocaleString())}
                className="workflow-action-btn workflow-action-btn-secondary"
              >
                Preview RFQ
              </button>
              <button type="button" onClick={handleGenerateRfq} className="workflow-action-btn workflow-action-btn-primary">
                Generate RFQ
              </button>
            </section>

            <button
              type="button"
              onClick={() => setDraftSavedAt(new Date().toLocaleString())}
              className="mt-2 w-full workflow-action-link"
            >
              Save Draft
            </button>

            {draftSavedAt ? (
              <section className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
                Draft saved at {draftSavedAt}
              </section>
            ) : null}

            {previewAt ? (
              <section className="mt-3 rounded-xl border border-blue-300/20 bg-blue-500/10 px-3 py-3 text-sm text-blue-100">
                RFQ preview prepared at {previewAt}
              </section>
            ) : null}

            {summary ? (
              <section className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-500/[0.08] px-3 py-3 text-sm text-emerald-100">
                RFQ generated for {summary.sheetCode} at {summary.createdAt}
              </section>
            ) : null}
          </div>
        </>
      )}
    />
  );
}
