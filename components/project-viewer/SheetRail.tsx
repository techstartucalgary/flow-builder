'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  fileUrl: string;
  isPdf: boolean;
  onSelectPage: (page: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  sheetStatusTone: (status: PageWorkflowStatus | undefined) => 'good' | 'warn' | 'accent' | 'danger';
  sheetStatusLabel: (status: PageWorkflowStatus | undefined) => string;
}

export default function SheetRail({
  numPages,
  pageNumber,
  pageStatuses,
  fileUrl,
  isPdf,
  onSelectPage,
  onPreviousPage,
  onNextPage,
  sheetStatusTone,
  sheetStatusLabel,
}: SheetRailProps) {
  const pageCount = Math.max(numPages || 1, 1);

  return (
    <section className="project-sheet-strip ws-panel-flat shrink-0 overflow-hidden">
      <button
        type="button"
        onClick={onPreviousPage}
        disabled={pageNumber <= 1}
        className="sheet-nav-button"
        aria-label="Previous sheet"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="min-w-0 flex-1 overflow-x-auto dark-scrollbar">
        <div className="flex min-w-max gap-3 px-3 py-2">
          {Array.from({ length: pageCount }, (_, index) => {
            const page = index + 1;
            const status = pageStatuses[page];
            const selected = page === pageNumber;
            const tone = selected ? 'accent' : sheetStatusTone(status);
            const label = selected ? 'Selected' : sheetStatusLabel(status);

            return (
              <button
                key={page}
                type="button"
                onClick={() => onSelectPage(page)}
                className={`sheet-thumb ${selected ? 'sheet-thumb-selected' : ''}`}
                aria-current={selected ? 'page' : undefined}
              >
                <div className="sheet-thumb-preview">
                  {!isPdf && page === 1 ? (
                    <img src={fileUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="sheet-thumb-placeholder">
                      <span className="h-1.5 w-12 rounded-full bg-slate-300/70" />
                      <span className="h-1 w-20 rounded-full bg-slate-300/40" />
                      <span className="h-1 w-16 rounded-full bg-slate-300/35" />
                      <span className="mt-1 h-8 w-16 rounded border border-cyan-500/35 bg-cyan-400/10" />
                    </div>
                  )}
                  <span className="sheet-status" data-tone={tone}>{label}</span>
                </div>
                <div className="mt-1.5 min-w-0">
                  <div className="truncate text-[11px] font-semibold uppercase tracking-[0.02em] text-white">
                    {page === pageNumber ? `Sheet ${page} - Current` : `Sheet ${page}`}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--ws-text-muted)]">
                    {status?.hasAnnotationDoc ? 'Geometry loaded' : status?.visited ? 'In progress' : 'Not opened'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onNextPage}
        disabled={pageNumber >= pageCount}
        className="sheet-nav-button"
        aria-label="Next sheet"
      >
        <ChevronRight size={16} />
      </button>
    </section>
  );
}
