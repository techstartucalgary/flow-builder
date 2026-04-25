'use client';

import { ChevronLeft, Settings, Share2 } from 'lucide-react';

import type { WorkspaceMode, WorkflowTone } from '@/hooks/useProjectViewerWorkflow';

interface ProjectViewerHeaderProps {
  projectName: string;
  saveLabel: string;
  saveTone: WorkflowTone;
  blockerCount: number;
  workspaceMode: WorkspaceMode;
  canReview: boolean;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onBack: () => void;
}

export default function ProjectViewerHeader({
  projectName,
  saveLabel,
  saveTone,
  blockerCount,
  workspaceMode,
  canReview,
  onWorkspaceModeChange,
  onBack,
}: ProjectViewerHeaderProps) {
  return (
    <header className="project-viewer-topbar ws-panel-elevated shrink-0 px-4 py-3">
      <div className="flex min-h-[3.25rem] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ws-border)] bg-white/[0.045] text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-[var(--ws-text)]"
            aria-label="Back to projects"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            <img
              src="/images/FlowBuildrCroppedLogo.png"
              alt=""
              className="h-8 w-8 object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">
              FlowBuildr - Takeoff Workspace
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-white">
                Project: {projectName}
              </h1>
              <span className="ws-chip" data-tone={saveTone}>{saveLabel}</span>
              <span className="ws-chip" data-tone={blockerCount > 0 ? 'warn' : 'good'}>
                {blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}` : 'Ready'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--ws-text-secondary)] transition hover:bg-white/[0.06] hover:text-white md:inline-flex"
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-500/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500/30"
          >
            <Share2 size={16} />
            Share
          </button>

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
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
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
