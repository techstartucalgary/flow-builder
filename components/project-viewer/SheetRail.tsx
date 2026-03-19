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
    <aside className="ws-panel flex w-52 shrink-0 flex-col overflow-hidden">
      <div className="border-b border-[var(--ws-border)] px-3 py-3">
        <div className="ws-section-header">Sheets</div>
        <div className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Navigate the drawing set and keep track of page readiness.
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
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
                    ? 'border-cyan-400/50 bg-cyan-500/[0.12]'
                    : 'border-[var(--ws-border)] bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">Sheet {page}</div>
                    <div className="mt-1 text-[11px] text-[var(--ws-text-muted)]">
                      {status?.hasScale ? 'Scale captured' : 'Scale pending'}
                    </div>
                  </div>
                  <span className="ws-chip" data-tone={sheetStatusTone(status)}>
                    {sheetStatusLabel(status)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ws-text-secondary)]">
                  <span className="ws-chip">{status?.hasAnnotationDoc ? 'Geometry' : 'No doc'}</span>
                  <span className="ws-chip">{status?.generated ? 'Takeoff run' : 'Not run'}</span>
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
