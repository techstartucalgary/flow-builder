'use client';

import type { AnnotationIssue } from '@/types/annotation';

interface IssueHighlighterProps {
  issues: AnnotationIssue[];
  onSelectIssue: (issue: AnnotationIssue) => void;
}

export default function IssueHighlighter({ issues, onSelectIssue }: IssueHighlighterProps) {
  const grouped = {
    error: issues.filter((issue) => issue.severity === 'error'),
    warning: issues.filter((issue) => issue.severity === 'warning'),
    info: issues.filter((issue) => issue.severity === 'info'),
  };

  if (!issues.length) {
    return (
      <div className="ws-panel p-3 text-xs text-gray-400">
        <div className="ws-section-header mb-2">Issues</div>
        No detected issues.
      </div>
    );
  }

  return (
    <div className="ws-panel p-3 space-y-3 max-h-56 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="ws-section-header">Issues</div>
        <span className="ws-chip" data-tone={grouped.error.length ? 'danger' : grouped.warning.length ? 'warn' : 'accent'}>
          {issues.length} total
        </span>
      </div>

      {(['error', 'warning', 'info'] as const).map((severity) => {
        const rows = grouped[severity];
        if (!rows.length) return null;

        const tone = severity === 'error' ? 'danger' : severity === 'warning' ? 'warn' : 'accent';
        return (
          <div key={severity} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                {severity}
              </div>
              <span className="ws-chip" data-tone={tone}>
                {rows.length}
              </span>
            </div>
            {rows.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => onSelectIssue(issue)}
                className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition ${
                  severity === 'error'
                    ? 'border-rose-400/25 bg-rose-500/8 text-rose-100 hover:bg-rose-500/12'
                    : severity === 'warning'
                      ? 'border-amber-400/25 bg-amber-500/8 text-amber-100 hover:bg-amber-500/12'
                      : 'border-cyan-400/20 bg-cyan-500/8 text-cyan-100 hover:bg-cyan-500/12'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{issue.code}</div>
                  <span className="text-[10px] uppercase tracking-[0.14em] opacity-70">Jump to issue</span>
                </div>
                <div className="mt-1 opacity-80">{issue.message}</div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
