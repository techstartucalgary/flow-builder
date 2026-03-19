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
  onSetScalePxPerFt: (value: string) => void;
  onSetCeilingHeightFt: (value: string) => void;
  onSetReferenceFloorAreaSqFt: (value: string) => void;
  onOpenScaleCalibration: () => void;
  onPrimaryAction: () => void;
  onBlockerAction: (blocker: ProjectViewerWorkflow['blockers'][number]) => void;
  onReviewAction: (action: ProjectWorkflowReviewAction) => void;
}

function formatSqFt(value: number): string {
  return value > 0 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

function formatDelta(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function roomClosureLabel(status: TakeoffData['roomClosureStatus']): string {
  switch (status) {
    case 'closed':
      return 'Closed';
    case 'ambiguous':
      return 'Ambiguous';
    default:
      return 'Open';
  }
}

function toneForReadiness(status: 'ready' | 'missing' | 'draft'): 'good' | 'warn' | 'accent' {
  if (status === 'ready') return 'good';
  if (status === 'missing') return 'warn';
  return 'accent';
}

function toneForConfidence(confidence: TakeoffData['takeoffConfidence']): 'good' | 'warn' | 'danger' {
  if (confidence === 'high') return 'good';
  if (confidence === 'medium') return 'warn';
  return 'danger';
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
  onSetScalePxPerFt,
  onSetCeilingHeightFt,
  onSetReferenceFloorAreaSqFt,
  onOpenScaleCalibration,
  onPrimaryAction,
  onBlockerAction,
  onReviewAction,
}: WorkflowRailProps) {
  return (
    <aside className={`flex min-h-0 shrink-0 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 ${mode === 'annotate' ? 'w-[clamp(20rem,24vw,24rem)]' : 'w-[clamp(24rem,30vw,34rem)]'}`}>
      <section className="ws-panel-elevated shrink-0 overflow-hidden">
        <div className="border-b border-[var(--ws-border)] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="ws-section-header">Workflow</div>
            <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
              {workflow.currentStep}
            </span>
          </div>
          <div className="mt-2 text-sm text-[var(--ws-text-secondary)]">
            {mode === 'annotate'
              ? 'Prepare the page, fix blockers, and keep geometry trustworthy before generating.'
              : 'Review the latest results, inspect confidence, and jump back into QA only when needed.'}
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">Primary Action</div>
                <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                  {workflow.primaryAction.disabledReason || 'Use the next clear step for this page.'}
                </div>
              </div>
              <button
                type="button"
                onClick={onPrimaryAction}
                disabled={workflow.primaryAction.disabled}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 transition hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {workflow.primaryAction.label}
              </button>
            </div>
            {generating ? (
              <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.08] px-3 py-3 text-sm text-cyan-100">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{overlayStatus}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">Readiness</div>
              <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                {workflow.readiness.filter((item) => item.status === 'ready').length}/{workflow.readiness.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {workflow.readiness.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-white">{item.label}</div>
                    <span className="ws-chip" data-tone={toneForReadiness(item.status)}>{item.value}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{item.description}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="workflow-scale-px-per-ft" className="block text-xs text-[var(--ws-text-secondary)]">
                    Scale (px/ft)
                  </label>
                  <button
                    type="button"
                    onClick={onOpenScaleCalibration}
                    className="text-[11px] font-medium text-cyan-200 transition hover:text-white"
                  >
                    Calibrate on plan
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
                    className="w-full rounded-xl border border-[var(--ws-border)] bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="workflow-ceiling-height-ft" className="mb-1.5 block text-xs text-[var(--ws-text-secondary)]">
                    Ceiling Height (ft)
                  </label>
                  <input
                    id="workflow-ceiling-height-ft"
                    type="number"
                    min={1}
                    step={0.5}
                    placeholder="e.g. 9"
                    value={ceilingHeightFt}
                    onChange={(event) => onSetCeilingHeightFt(event.target.value)}
                    className="w-full rounded-xl border border-[var(--ws-border)] bg-white/5 px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="workflow-reference-floor-area" className="mb-1.5 block text-xs text-[var(--ws-text-secondary)]">
                    Reference Floor Area
                  </label>
                  <input
                    id="workflow-reference-floor-area"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Optional"
                    value={referenceFloorAreaSqFt}
                    onChange={(event) => onSetReferenceFloorAreaSqFt(event.target.value)}
                    className="w-full rounded-xl border border-[var(--ws-border)] bg-white/5 px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">Blocking Issues</div>
              <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                {workflow.blockerCount > 0 ? `${workflow.blockerCount} open` : 'Clear'}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {workflow.blockers.length ? workflow.blockers.map((blocker) => (
                <div key={blocker.id} className="rounded-xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{blocker.title}</div>
                      <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{blocker.description}</div>
                    </div>
                    <span className="ws-chip" data-tone={blocker.tone}>{blocker.tone}</span>
                  </div>
                  {blocker.actionLabel ? (
                    <button
                      type="button"
                      onClick={() => onBlockerAction(blocker)}
                      className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                    >
                      {blocker.actionLabel}
                    </button>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-3 text-sm text-emerald-100">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                    <span>This page is ready for a clean run and focused review.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="ws-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[var(--ws-border)] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="ws-section-header">{mode === 'annotate' ? 'Latest Results' : 'Review Summary'}</div>
            <div className="flex items-center gap-2">
              <span className="ws-chip" data-tone={generated && takeoff.geometrySource === 'annotation_document' ? 'good' : 'accent'}>
                {takeoffSourceDisplay}
              </span>
              {generated ? (
                <span className="ws-chip" data-tone={toneForConfidence(takeoff.takeoffConfidence)}>
                  {takeoff.takeoffConfidence}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!generated ? (
            <div className="rounded-2xl border border-dashed border-[var(--ws-border-strong)] bg-white/[0.02] px-4 py-5">
              <div className="text-sm font-medium text-white">Ready to analyze</div>
              <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                Run takeoff to calculate floor area, board quantities, and room-level review signals for this page.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70">Floor Area</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{formatSqFt(takeoff.floorArea)}</div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                </div>
                <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Sheets</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{takeoff.sheetsRequired}</div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                    {takeoff.estimateReady ? 'ready estimate' : 'draft estimate'}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Net Wall Board</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{formatSqFt(takeoff.netWallBoard)}</div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                </div>
                <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Closure</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{roomClosureLabel(takeoff.roomClosureStatus)}</div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                    {takeoff.unclosedGapCount} gap{takeoff.unclosedGapCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              {reviewActions.length ? (
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">Continue QA</div>
                      <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                        Jump to the highest-impact geometry that still needs review.
                      </div>
                    </div>
                    <span className="ws-chip" data-tone="accent">{reviewActions.length} queued</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {reviewActions.map((action) => (
                      <button
                        key={action.key}
                        type="button"
                        onClick={() => onReviewAction(action)}
                        className="rounded-xl border border-cyan-400/20 bg-black/10 px-3 py-2.5 text-left transition hover:border-cyan-300/40 hover:bg-cyan-500/[0.08]"
                      >
                        <div className="text-sm font-medium text-white">{action.label}</div>
                        <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{action.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {takeoffError ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
                    <span>{takeoffError}</span>
                  </div>
                </div>
              ) : null}

              <details className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4" open={mode === 'review'}>
                <summary className="cursor-pointer list-none text-sm font-medium text-white">
                  Warnings and guidance
                </summary>
                <div className="mt-3 space-y-2">
                  {reviewWarnings.length ? reviewWarnings.map((warning) => (
                    <div key={warning} className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-3 text-sm text-amber-100">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                        <span>{warning}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-3 text-sm text-emerald-100">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                        <span>The current result is aligned with the saved page state and has no outstanding review warnings.</span>
                      </div>
                    </div>
                  )}
                </div>
              </details>

              <details className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-white">
                  Run summary
                </summary>
                <div className="mt-3 space-y-3 text-sm text-[var(--ws-text-secondary)]">
                  <div className="rounded-xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                    <div className="font-medium text-white">{runComparisonMessage || 'Current run diagnostics'}</div>
                    <p className="mt-1">{runComparisonReason || 'This run used the latest pinned geometry revision for the current page.'}</p>
                    {metricDeltas ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div>Floor area: {formatDelta(metricDeltas.floorArea)}</div>
                        <div>Linear feet: {formatDelta(metricDeltas.totalLinearFt)}</div>
                        <div>Opening deduction: {formatDelta(metricDeltas.openingDeduction)}</div>
                        <div>Net wall board: {formatDelta(metricDeltas.netWallBoard)}</div>
                        <div>Sheets: {metricDeltas.sheetsRequired >= 0 ? '+' : ''}{metricDeltas.sheetsRequired}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Source</div>
                      <div className="mt-2 font-medium text-white">{takeoffSourceDisplay}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Estimate</div>
                      <div className="mt-2 font-medium text-white">{takeoff.estimateReady ? 'Ready' : 'Draft'}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Openings</div>
                      <div className="mt-2 font-medium text-white">{takeoff.doors} doors / {takeoff.windows} windows</div>
                    </div>
                    <div className="rounded-xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Unmatched</div>
                      <div className="mt-2 font-medium text-white">{takeoff.unmatchedOpeningCount}</div>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
