'use client';

import type { AnnotationIssue } from '@/types/annotation';

interface IssueHighlighterProps {
  issues: AnnotationIssue[];
  onSelectIssue: (issue: AnnotationIssue) => void;
}

export default function IssueHighlighter({ issues, onSelectIssue }: IssueHighlighterProps) {
  if (!issues.length) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-gray-400">
        No detected issues.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2 max-h-40 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Issues</div>
      {issues.map((issue) => (
        <button
          key={issue.id}
          type="button"
          onClick={() => onSelectIssue(issue)}
          className="w-full text-left rounded border border-red-500/20 bg-red-500/5 px-2 py-1.5 text-xs text-red-200"
        >
          <div className="font-semibold">{issue.code}</div>
          <div className="text-red-300/80">{issue.message}</div>
        </button>
      ))}
    </div>
  );
}
