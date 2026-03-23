'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { WorkspaceMode, WorkflowStep, WorkflowTone } from '@/hooks/useProjectViewerWorkflow';

interface ProjectViewerHeaderProps {
  projectName: string;
  isPdf: boolean;
  pageNumber: number;
  numPages: number;
  annotationRevision?: number;
  saveLabel: string;
  saveTone: WorkflowTone;
  currentStep: WorkflowStep;
  blockerCount: number;
  workspaceMode: WorkspaceMode;
  canReview: boolean;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onBack: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export default function ProjectViewerHeader({
  projectName,
  isPdf,
  pageNumber,
  numPages,
  annotationRevision,
  saveLabel,
  saveTone,
  currentStep,
  blockerCount,
  workspaceMode,
  canReview,
  onWorkspaceModeChange,
  onBack,
  onPreviousPage,
  onNextPage,
}: ProjectViewerHeaderProps) {
  return (
    <header className="ws-panel-elevated sticky top-0 z-20 shrink-0 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ws-border)] bg-white/5 text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-[var(--ws-text)]"
            aria-label="Back to projects"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">
              <span>Project Workspace</span>
              <span className="h-1 w-1 rounded-full bg-[var(--ws-text-muted)]" />
              <span>{workspaceMode === 'annotate' ? 'Annotation Mode' : 'Review Mode'}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-white">{projectName}</h1>
              <span className="ws-chip" data-tone={saveTone}>{saveLabel}</span>
              <span className="ws-chip" data-tone={blockerCount > 0 ? 'warn' : 'good'}>
                {blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}` : 'Clear to run'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ws-text-secondary)]">
              <span className="ws-chip">{isPdf ? 'PDF plan' : 'Image plan'}</span>
              <span className="ws-chip">Sheet {pageNumber}</span>
              {annotationRevision ? <span className="ws-chip">Revision {annotationRevision}</span> : null}
              <span className="ws-chip" data-tone="accent">Current step: {currentStep}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {isPdf && numPages > 1 ? (
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--ws-border)] bg-black/20 px-2 py-1.5">
              <button
                onClick={onPreviousPage}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                disabled={pageNumber <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="min-w-[5.5rem] text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Sheet</div>
                <div className="mt-0.5 text-sm font-medium text-white">{pageNumber} / {numPages}</div>
              </div>
              <button
                onClick={onNextPage}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                disabled={pageNumber >= numPages}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}

          <div className="inline-flex rounded-2xl border border-[var(--ws-border)] bg-black/20 p-1">
            {(['annotate', 'review'] as const).map((mode) => {
              const active = workspaceMode === mode;
              const disabled = mode === 'review' && !canReview;
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => onWorkspaceModeChange(mode)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-white text-slate-950'
                      : 'text-[var(--ws-text-secondary)] hover:bg-white/10 hover:text-white'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {mode === 'annotate' ? 'Annotate' : 'Review Result'}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--ws-divider)] pt-3 text-xs text-[var(--ws-text-secondary)]">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">Focus</span>
        <span className="ws-chip" data-active="true">
          {workspaceMode === 'annotate'
            ? 'Resolve geometry and unblock the next clean run'
            : 'Verify the latest takeoff against the live plan'}
        </span>
        {canReview ? (
          <span className="ws-chip" data-tone="accent">
            Review available
          </span>
        ) : (
          <span className="ws-chip">Run takeoff to unlock review</span>
        )}
      </div>
    </header>
  );
}
