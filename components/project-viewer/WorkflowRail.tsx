'use client';

import { useState } from 'react';
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
  const [inputsOpen, setInputsOpen] = useState(false);
  const readyCount = workflow.readiness.filter((item) => item.status === 'ready').length;

  if (mode === 'annotate') {
    return (
      <aside className="flex min-h-0 w-[clamp(18rem,22vw,21rem)] shrink-0 flex-col overflow-x-hidden overflow-y-auto pr-1">
        <section className="ws-panel-flat shrink-0 overflow-hidden">
          <div className="border-b border-[var(--ws-divider)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="ws-section-header">Next action</div>
                <div className="mt-2 text-base font-semibold text-white">{workflow.primaryAction.label}</div>
                <div className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                  {workflow.primaryAction.disabledReason || 'Keep the geometry clean, then run from here when the page is ready.'}
                </div>
              </div>
              <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                {workflow.blockerCount > 0 ? `${workflow.blockerCount} blocker${workflow.blockerCount === 1 ? '' : 's'}` : 'Ready'}
              </span>
            </div>
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={workflow.primaryAction.disabled}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {workflow.primaryAction.label}
            </button>
            {generating ? (
              <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/[0.08] px-3 py-3 text-sm text-cyan-50">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{overlayStatus}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="ws-section-header">Readiness</div>
              <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                {readyCount}/{workflow.readiness.length} ready
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {workflow.readiness.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">{item.label}</div>
                    <span className="ws-chip shrink-0" data-tone={toneForReadiness(item.status)}>{item.value}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{item.description}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-[var(--ws-divider)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="ws-section-header">Blockers</div>
                <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                  {workflow.blockerCount > 0 ? `${workflow.blockerCount} open` : 'Clear'}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {workflow.blockers.length ? workflow.blockers.map((blocker) => (
                  <div key={blocker.id} className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                    <div className="text-sm font-medium text-white">{blocker.title}</div>
                    <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{blocker.description}</div>
                    {blocker.actionLabel ? (
                      <button
                        type="button"
                        onClick={() => onBlockerAction(blocker)}
                        className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                      >
                        {blocker.actionLabel}
                      </button>
                    ) : null}
                  </div>
                )) : (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-3 text-sm text-emerald-100">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                      <span>This page is ready for a clean run.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <details
              className="mt-4 rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-3 py-3"
              open={inputsOpen}
              onToggle={(event) => setInputsOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer list-none text-sm font-medium text-white">
                Inputs
              </summary>
              <div className="mt-3 grid gap-3">
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
                      className="w-full rounded-2xl border border-[var(--ws-border)] bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
                      className="w-full rounded-2xl border border-[var(--ws-border)] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
                      className="w-full rounded-2xl border border-[var(--ws-border)] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 w-[clamp(25rem,31vw,34rem)] shrink-0 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1">
      <section className="ws-panel-flat shrink-0 overflow-hidden">
        <div className="border-b border-[var(--ws-divider)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="ws-section-header">Workflow</div>
              <div className="mt-2 text-base font-semibold text-white">{workflow.currentStep}</div>
              <div className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                Read the latest output, verify risk signals, and jump straight back into QA where it matters.
              </div>
            </div>
            <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
              {workflow.blockerCount > 0 ? `${workflow.blockerCount} blocker${workflow.blockerCount === 1 ? '' : 's'}` : 'On track'}
            </span>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="ws-fade-lift rounded-3xl border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(59,130,246,0.12),rgba(15,23,42,0.3))] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/75">Next move</div>
                <div className="mt-2 text-lg font-semibold text-white">{workflow.primaryAction.label}</div>
                <div className="mt-1 text-sm text-cyan-50/80">
                  {workflow.primaryAction.disabledReason || 'Use the current recommended step to keep this sheet moving.'}
                </div>
              </div>
              <button
                type="button"
                onClick={onPrimaryAction}
                disabled={workflow.primaryAction.disabled}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {workflow.primaryAction.label}
              </button>
            </div>
            {generating ? (
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-black/15 px-3 py-3 text-sm text-cyan-50">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{overlayStatus}</span>
                </div>
              </div>
            ) : null}
          </div>

          {generated ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/70">Floor area</div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">{formatSqFt(takeoff.floorArea)}</div>
                <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                  {takeoff.roomClosureStatus === 'closed' ? 'sq ft' : 'sq ft · provisional'}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Sheets</div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">{takeoff.sheetsRequired}</div>
                <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                  {takeoff.estimateReady ? 'ready estimate' : 'draft estimate'}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 border-t border-[var(--ws-divider)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="ws-section-header">Readiness</div>
              <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                {workflow.readiness.filter((item) => item.status === 'ready').length}/{workflow.readiness.length} ready
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {workflow.readiness.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{item.label}</div>
                    <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{item.description}</div>
                  </div>
                  <span className="ws-chip shrink-0" data-tone={toneForReadiness(item.status)}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--ws-divider)] pt-4">
            <div className="ws-section-header">Inputs</div>
            <div className="mt-3 grid gap-3">
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
                    className="w-full rounded-2xl border border-[var(--ws-border)] bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
                    className="w-full rounded-2xl border border-[var(--ws-border)] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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
                    className="w-full rounded-2xl border border-[var(--ws-border)] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-[var(--ws-text-muted)] focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--ws-divider)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="ws-section-header">Blocking Issues</div>
              <span className="ws-chip" data-tone={workflow.blockerCount > 0 ? 'warn' : 'good'}>
                {workflow.blockerCount > 0 ? `${workflow.blockerCount} open` : 'Clear'}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {workflow.blockers.length ? workflow.blockers.map((blocker) => (
                <div key={blocker.id} className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{blocker.title}</div>
                      <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">{blocker.description}</div>
                    </div>
                    <span className="ws-chip shrink-0" data-tone={blocker.tone}>{blocker.tone}</span>
                  </div>
                  {blocker.actionLabel ? (
                    <button
                      type="button"
                      onClick={() => onBlockerAction(blocker)}
                      className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                    >
                      {blocker.actionLabel}
                    </button>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-3 text-sm text-emerald-100">
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

      <section className="ws-panel-flat flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[var(--ws-divider)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="ws-section-header">Review Summary</div>
              <div className="mt-2 text-sm text-[var(--ws-text-secondary)]">
                {generated
                  ? 'Latest takeoff output, confidence, and review queues for this page.'
                  : 'No takeoff has been generated for this page yet.'}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
            <div className="rounded-3xl border border-dashed border-[var(--ws-border-strong)] bg-white/[0.02] px-4 py-5">
              <div className="text-sm font-medium text-white">Ready to analyze</div>
              <p className="mt-1 text-sm text-[var(--ws-text-secondary)]">
                Run takeoff to calculate floor area, board quantities, and room-level review signals for this page.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70">Floor Area</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">{formatSqFt(takeoff.floorArea)}</div>
                  <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">sq ft</div>
                </div>
                <div className="rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--ws-text-muted)]">Sheets</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">{takeoff.sheetsRequired}</div>
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
                <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">Continue QA</div>
                      <div className="mt-1 text-xs text-[var(--ws-text-secondary)]">
                        Jump directly to the highest-impact geometry that still needs attention.
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
                        className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3 text-left transition hover:border-cyan-300/40 hover:bg-cyan-500/[0.08]"
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

              <details className="rounded-3xl border border-[var(--ws-border)] bg-white/[0.03] p-4" open={mode === 'review'}>
                <summary className="cursor-pointer list-none text-sm font-medium text-white">
                  Warnings and guidance
                </summary>
                <div className="mt-3 space-y-2">
                  {reviewWarnings.length ? reviewWarnings.map((warning) => (
                    <div key={warning} className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-3 text-sm text-amber-100">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                        <span>{warning}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-3 text-sm text-emerald-100">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                        <span>The current result is aligned with the saved page state and has no outstanding review warnings.</span>
                      </div>
                    </div>
                  )}
                </div>
              </details>

              <details className="rounded-3xl border border-[var(--ws-border)] bg-white/[0.03] p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-white">
                  Run summary
                </summary>
                <div className="mt-3 space-y-3 text-sm text-[var(--ws-text-secondary)]">
                  <div className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
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
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Source</div>
                      <div className="mt-2 font-medium text-white">{takeoffSourceDisplay}</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Estimate</div>
                      <div className="mt-2 font-medium text-white">{takeoff.estimateReady ? 'Ready' : 'Draft'}</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Openings</div>
                      <div className="mt-2 font-medium text-white">{takeoff.doors} doors / {takeoff.windows} windows</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ws-border)] bg-black/10 px-3 py-3">
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
