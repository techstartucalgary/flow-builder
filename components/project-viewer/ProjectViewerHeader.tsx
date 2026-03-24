'use client';

import { ChevronLeft } from 'lucide-react';

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
  isPdf: _isPdf,
  pageNumber: _pageNumber,
  numPages: _numPages,
  annotationRevision: _annotationRevision,
  saveLabel,
  saveTone,
  currentStep: _currentStep,
  blockerCount,
  workspaceMode,
  canReview: _canReview,
  onWorkspaceModeChange,
  onBack,
  onPreviousPage: _onPreviousPage,
  onNextPage: _onNextPage,
}: ProjectViewerHeaderProps) {
  return (
    <header className="ws-panel-elevated sticky top-0 z-20 shrink-0 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ws-border)] bg-white/5 text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-[var(--ws-text)]"
            aria-label="Back to projects"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 space-y-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">
              {workspaceMode === 'annotate' ? 'Annotation mode' : 'Review mode'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-white">{projectName}</h1>
              <span className="ws-chip" data-tone={saveTone}>{saveLabel}</span>
              <span className="ws-chip" data-tone={blockerCount > 0 ? 'warn' : 'good'}>
                {blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}` : 'Ready'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="inline-flex rounded-2xl border border-[var(--ws-border)] bg-black/20 p-1">
            {(['annotate', 'review'] as const).map((mode) => {
              const active = workspaceMode === mode;
              const disabled = mode === 'review' && !_canReview;
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
    </header>
  );
}
