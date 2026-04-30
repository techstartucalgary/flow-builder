'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Settings, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type WorkflowStep = 'material-cost' | 'derived-materials' | 'rfq-scope';

interface WorkflowWorkspaceShellProps {
  projectId: string;
  currentStep: WorkflowStep;
  onBack: () => void;
  leftRail: ReactNode;
  centerRail: ReactNode;
  rightRail: ReactNode;
}

const STEP_LABELS: Record<WorkflowStep, string> = {
  'material-cost': 'Step 1 of 3',
  'derived-materials': 'Step 2 of 3',
  'rfq-scope': 'Step 3 of 3',
};

const STEP_ORDER: WorkflowStep[] = ['material-cost', 'derived-materials', 'rfq-scope'];
const STEP_TITLES: Record<WorkflowStep, string> = {
  'material-cost': 'Material Cost',
  'derived-materials': 'Derived Materials',
  'rfq-scope': 'RFQ Scope',
};
const STEP_ROUTES: Record<WorkflowStep, string> = {
  'material-cost': 'material-cost-table',
  'derived-materials': 'materials-review',
  'rfq-scope': 'rfq-scope',
};

export default function WorkflowWorkspaceShell({
  projectId,
  currentStep,
  onBack,
  leftRail,
  centerRail,
  rightRail,
}: WorkflowWorkspaceShellProps) {
  const router = useRouter();
  const [projectName, setProjectName] = useState(`Project ${projectId.slice(0, 8)}`);

  useEffect(() => {
    let cancelled = false;

    const loadProjectName = async () => {
      const { data } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .maybeSingle();

      if (!cancelled && data && typeof data.name === 'string' && data.name.trim()) {
        setProjectName(data.name);
      }
    };

    void loadProjectName();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--ws-bg)] text-[var(--ws-text)]">
      <div className="flex h-full flex-col gap-3 px-3 py-3">
        <header className="project-viewer-topbar ws-panel-elevated shrink-0 px-4 py-3">
          <div className="flex min-h-[3.25rem] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ws-border)] bg-white/[0.045] text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-[var(--ws-text)]"
                aria-label="Back"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                <img src="/images/FlowBuildrCroppedLogo.png" alt="" className="h-8 w-8 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] uppercase tracking-[0.18em] text-[var(--ws-text-muted)]">
                  FlowBuildr - Takeoff Workspace
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-white">
                    Project: {projectName}
                  </h1>
                  <span className="ws-chip" data-tone="good">Saved</span>
                  <span className="ws-chip" data-tone="accent">{STEP_LABELS[currentStep]}</span>
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
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/projects/${projectId}`)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-white"
                >
                  Annotate
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition"
                >
                  Generate RFQ
                </button>
              </div>
            </div>
          </div>

          <div className="workflow-stepper">
            {STEP_ORDER.map((step, index) => (
              <button
                key={step}
                type="button"
                data-current={step === currentStep ? 'true' : 'false'}
                onClick={() => router.push(`/dashboard/projects/${projectId}/${STEP_ROUTES[step]}`)}
                className="workflow-step"
              >
                <div className="workflow-step-number">Step {index + 1}</div>
                <div className="workflow-step-title">{STEP_TITLES[step]}</div>
              </button>
            ))}
          </div>
        </header>

        <div className="project-viewer-grid min-h-0 flex-1">
          <aside className="project-measurements-rail ws-panel-flat flex min-h-0 flex-col overflow-hidden">
            {leftRail}
          </aside>

          <section className="project-viewer-center min-w-0">
            {centerRail}
          </section>

          <aside className="project-actions-rail ws-panel-flat flex min-h-0 flex-col overflow-hidden">
            {rightRail}
          </aside>
        </div>
      </div>
    </div>
  );
}
