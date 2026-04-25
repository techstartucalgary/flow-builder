'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, FileText, Loader2, Ruler } from 'lucide-react';

import type { TakeoffData } from '@/lib/parseTakeoff';
import type {
  ProjectViewerWorkflow,
  ProjectWorkflowReviewAction,
  WorkspaceMode,
} from '@/hooks/useProjectViewerWorkflow';

type TakeoffDeltaSummary = {
  floorArea: number;
  totalLinearFt: number;
  openingDeduction: number;
  netWallBoard: number;
  sheetsRequired: number;
};

interface SelectionSummary {
  label: string;
  count: number;
  details: string[];
}

interface WorkflowRailProps {
  mode: WorkspaceMode;
  workflow: ProjectViewerWorkflow;
  generating: boolean;
  generated: boolean;
  overlayStatus: string;
  takeoff: TakeoffData;
  takeoffSourceDisplay: string;
  scalePxPerFt: string;
  ceilingHeightFt: string;
  referenceFloorAreaSqFt: string;
  runComparisonMessage: string | null;
  runComparisonReason: string | null;
  metricDeltas: TakeoffDeltaSummary | null;
  takeoffError: string | null;
  reviewWarnings: string[];
  reviewActions: ProjectWorkflowReviewAction[];
  selectionSummary: SelectionSummary;
  onSetScalePxPerFt: (value: string) => void;
  onSetCeilingHeightFt: (value: string) => void;
  onSetReferenceFloorAreaSqFt: (value: string) => void;
  onOpenScaleCalibration: () => void;
  onPrimaryAction: () => void;
  onBlockerAction: (blocker: ProjectViewerWorkflow['blockers'][number]) => void;
  onReviewAction: (action: ProjectWorkflowReviewAction) => void;
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMoney(value: number | null): string {
  return value === null
    ? 'Pending'
    : value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function toneForReadiness(status: 'ready' | 'missing' | 'draft'): 'good' | 'warn' | 'accent' {
  if (status === 'ready') return 'good';
  if (status === 'missing') return 'warn';
  return 'accent';
}

function formatDelta(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function WorkflowRail({
  mode,
  workflow,
  generating,
  generated,
  overlayStatus,
  takeoff,
  takeoffSourceDisplay,
  scalePxPerFt,
  ceilingHeightFt,
  referenceFloorAreaSqFt,
  runComparisonMessage,
  runComparisonReason,
  metricDeltas,
  takeoffError,
  reviewWarnings,
  reviewActions,
  selectionSummary,
  onSetScalePxPerFt,
  onSetCeilingHeightFt,
  onSetReferenceFloorAreaSqFt,
  onOpenScaleCalibration,
  onPrimaryAction,
  onBlockerAction,
  onReviewAction,
}: WorkflowRailProps) {
  const readyCount = workflow.readiness.filter((item) => item.status === 'ready').length;

  return (
    <aside className="project-actions-rail ws-panel-flat flex min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[var(--ws-divider)] px-4 py-3">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Details & Actions</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5 dark-scrollbar">
        <section className="action-card">
          {mode === 'annotate' ? (
            <>
              <div className="action-card-title">Selection</div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <span className="text-sm text-[var(--ws-text-secondary)]">Selected:</span>
                <span className="text-right text-sm font-medium text-white">{selectionSummary.label}</span>
              </div>
              <div className="mt-3 space-y-2">
                {selectionSummary.details.map((detail) => {
                  const separatorIndex = detail.indexOf(':');
                  const hasPair = separatorIndex > -1;
                  return (
                    <div key={detail} className={hasPair ? 'flex justify-between gap-3 text-sm' : 'text-sm text-[var(--ws-text-secondary)]'}>
                      {hasPair ? (
                        <>
                          <span className="text-[var(--ws-text-secondary)]">{detail.slice(0, separatorIndex)}</span>
                          <span className="text-right text-white">{detail.slice(separatorIndex + 1).trim()}</span>
                        </>
                      ) : detail}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="action-card-title">Estimate Summary</div>
              <div className="mt-4 space-y-3">
                <div className="summary-row">
                  <span>Total Estimated Cost:</span>
                  <strong>{formatMoney(takeoff.totalCostUsd)}</strong>
                </div>
                <div className="summary-row">
                  <span>Project Status:</span>
                  <strong>{generated ? (takeoff.estimateReady ? 'Ready for Review' : 'Draft') : 'No Run'}</strong>
                </div>
                <div className="summary-row">
                  <span>Source:</span>
                  <strong>{takeoffSourceDisplay}</strong>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="action-card mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="action-card-title">Readiness</div>
            <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
              {readyCount}/{workflow.readiness.length} ready
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {workflow.readiness.map((item) => (
              <div key={item.id} className="readiness-item">
                <CheckCircle2
                  size={16}
                  className={item.status === 'ready' ? 'text-emerald-300' : item.status === 'missing' ? 'text-amber-300' : 'text-cyan-300'}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white">{item.label}</span>
                    <span className="ws-chip" data-tone={toneForReadiness(item.status)}>{item.value}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">Next Action</div>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={workflow.primaryAction.disabled}
            className="primary-action-button"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {workflow.primaryAction.label}
          </button>
          {workflow.primaryAction.disabledReason ? (
            <div className="mt-2 text-xs text-[var(--ws-text-secondary)]">{workflow.primaryAction.disabledReason}</div>
          ) : null}
          {generating ? (
            <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-50">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span>{overlayStatus}</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-5 border-t border-[var(--ws-divider)] pt-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">Inputs</div>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="workflow-scale-px-per-ft" className="text-xs text-[var(--ws-text-secondary)]">Scale (px/ft)</label>
                <button type="button" onClick={onOpenScaleCalibration} className="text-[11px] font-semibold text-cyan-200 hover:text-white">
                  Calibrate
                </button>
              </div>
              <div className="relative">
                <Ruler size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-text-muted)]" />
                <input
                  id="workflow-scale-px-per-ft"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="e.g. 50"
                  value={scalePxPerFt}
                  onChange={(event) => onSetScalePxPerFt(event.target.value)}
                  className="rail-input pl-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="workflow-ceiling-height-ft" className="mb-1.5 block text-xs text-[var(--ws-text-secondary)]">Ceiling</label>
                <input
                  id="workflow-ceiling-height-ft"
                  type="number"
                  min={1}
                  step={0.5}
                  value={ceilingHeightFt}
                  onChange={(event) => onSetCeilingHeightFt(event.target.value)}
                  className="rail-input"
                />
              </div>
              <div>
                <label htmlFor="workflow-reference-floor-area" className="mb-1.5 block text-xs text-[var(--ws-text-secondary)]">Ref area</label>
                <input
                  id="workflow-reference-floor-area"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Optional"
                  value={referenceFloorAreaSqFt}
                  onChange={(event) => onSetReferenceFloorAreaSqFt(event.target.value)}
                  className="rail-input"
                />
              </div>
            </div>
          </div>
        </section>

        {workflow.blockers.length || takeoffError ? (
          <section className="mt-5 border-t border-[var(--ws-divider)] pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">Blocking Issues</div>
              <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                {workflow.blockerCount} open
              </span>
            </div>
            <div className="space-y-2">
              {workflow.blockers.map((blocker) => (
                <div key={blocker.id} className="issue-row">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">{blocker.title}</div>
                    <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{blocker.description}</div>
                    {blocker.actionLabel ? (
                      <button
                        type="button"
                        onClick={() => onBlockerAction(blocker)}
                        className="mt-2 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
                      >
                        {blocker.actionLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {generated ? (
          <section className="mt-5 border-t border-[var(--ws-divider)] pt-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">Latest Result</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="metric-tile">
                <span>Floor Area</span>
                <strong>{formatNumber(takeoff.floorArea)}</strong>
                <small>sq ft</small>
              </div>
              <div className="metric-tile">
                <span>Sheets</span>
                <strong>{takeoff.sheetsRequired}</strong>
                <small>{takeoff.estimateReady ? 'ready' : 'draft'}</small>
              </div>
              <div className="metric-tile">
                <span>Openings</span>
                <strong>{takeoff.doors + takeoff.windows}</strong>
                <small>{takeoff.doors} D / {takeoff.windows} W</small>
              </div>
              <div className="metric-tile">
                <span>Net Board</span>
                <strong>{formatNumber(takeoff.netWallBoard)}</strong>
                <small>sq ft</small>
              </div>
            </div>
            {runComparisonMessage ? (
              <div className="mt-3 rounded-xl border border-[var(--ws-border)] bg-black/15 px-3 py-2 text-xs text-[var(--ws-text-secondary)]">
                <div className="font-medium text-white">{runComparisonMessage}</div>
                {runComparisonReason ? <div className="mt-1">{runComparisonReason}</div> : null}
                {metricDeltas ? (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <span>Area {formatDelta(metricDeltas.floorArea)}</span>
                    <span>LF {formatDelta(metricDeltas.totalLinearFt)}</span>
                    <span>Deduct {formatDelta(metricDeltas.openingDeduction)}</span>
                    <span>Sheets {metricDeltas.sheetsRequired >= 0 ? '+' : ''}{metricDeltas.sheetsRequired}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {mode === 'review' && reviewActions.length ? (
          <section className="mt-5 border-t border-[var(--ws-divider)] pt-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">Review Actions</div>
            <div className="space-y-2">
              {reviewActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => onReviewAction(action)}
                  className="w-full rounded-xl border border-[var(--ws-border)] bg-white/[0.035] px-3 py-2 text-left transition hover:border-cyan-300/40 hover:bg-cyan-500/[0.08]"
                >
                  <div className="text-sm font-medium text-white">{action.label}</div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{action.description}</div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {reviewWarnings.length ? (
          <section className="mt-5 border-t border-[var(--ws-divider)] pt-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">Warnings</div>
            <div className="space-y-2">
              {reviewWarnings.slice(0, 4).map((warning) => (
                <div key={warning} className="issue-row">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-300" />
                  <span className="text-xs text-amber-50/90">{warning}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
