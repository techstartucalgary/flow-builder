'use client';

interface RevisionStatusBarProps {
  revision: number;
  status: 'saved' | 'unsaved' | 'syncing' | 'error';
}

const STATUS_LABEL: Record<RevisionStatusBarProps['status'], string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  syncing: 'Syncing...',
  error: 'Sync failed',
};

export default function RevisionStatusBar({ revision, status }: RevisionStatusBarProps) {
  const tone =
    status === 'error'
      ? 'danger'
      : status === 'saved'
        ? 'good'
        : 'warn';

  return (
    <div className="ws-panel-elevated px-3 py-3 flex items-center justify-between gap-3">
      <div>
        <div className="ws-section-header">Document Status</div>
        <div className="mt-1 text-sm text-white font-semibold">Revision {revision}</div>
      </div>
      <span className="ws-chip" data-tone={tone}>
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
