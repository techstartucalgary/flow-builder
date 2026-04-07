'use client';

interface PageWorkflowStatus {
  visited: boolean;
  hasScale: boolean;
  hasAnnotationDoc: boolean;
  generated: boolean;
  estimateReady: boolean;
  saveStatus: 'saved' | 'unsaved' | 'syncing' | 'error';
}

interface SheetRailProps {
  numPages: number;
  pageNumber: number;
  pageStatuses: Record<number, PageWorkflowStatus>;
  onSelectPage: (page: number) => void;
  saveTone: (status: PageWorkflowStatus['saveStatus']) => 'good' | 'warn' | 'accent' | 'danger';
  saveLabel: (status: PageWorkflowStatus['saveStatus']) => string;
  sheetStatusTone: (status: PageWorkflowStatus | undefined) => 'good' | 'warn' | 'accent' | 'danger';
  sheetStatusLabel: (status: PageWorkflowStatus | undefined) => string;
}

export default function SheetRail({
  numPages,
  pageNumber,
  pageStatuses,
  onSelectPage,
  saveTone,
  saveLabel,
  sheetStatusTone,
  sheetStatusLabel,
}: SheetRailProps) {
  return (
    <aside className="ws-panel-flat flex w-56 shrink-0 flex-col overflow-hidden">
      <div className="border-b border-[var(--ws-divider)] px-4 py-4">
        <div className="ws-section-header">Sheet Navigator</div>
        <div className="mt-2 text-sm text-[var(--ws-text-secondary)]">
          Move through the set and keep each page’s readiness visible.
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-2">
          {Array.from({ length: numPages }, (_, index) => {
            const page = index + 1;
            const status = pageStatuses[page];
            const isCurrentPage = page === pageNumber;

            return (
              <button
                key={page}
                type="button"
                onClick={() => onSelectPage(page)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  isCurrentPage
                    ? 'border-cyan-400/40 bg-cyan-500/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'border-transparent bg-white/[0.02] hover:border-[var(--ws-border)] hover:bg-white/[0.04]'
                }`}
                aria-current={isCurrentPage ? 'page' : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border text-[11px] font-semibold ${
                        isCurrentPage
                          ? 'border-cyan-300/50 bg-cyan-200/15 text-cyan-100'
                          : 'border-[var(--ws-border)] text-[var(--ws-text-secondary)]'
                      }`}>
                        {page}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">Sheet {page}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--ws-text-muted)]">
                          {status?.hasAnnotationDoc ? 'Geometry loaded' : 'Geometry not started'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-[var(--ws-text-muted)]">
                      {status?.hasScale ? 'Scale captured' : 'Scale pending'}
                    </div>
                  </div>
                  <span className="ws-chip" data-tone={sheetStatusTone(status)}>
                    {sheetStatusLabel(status)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ws-text-secondary)]">
                  <span className="ws-chip">{status?.generated ? 'Takeoff ready' : 'No run yet'}</span>
                  {status?.saveStatus && status.saveStatus !== 'saved' ? (
                    <span className="ws-chip" data-tone={saveTone(status.saveStatus)}>
                      {saveLabel(status.saveStatus)}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
