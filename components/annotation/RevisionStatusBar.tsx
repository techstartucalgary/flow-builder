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
    <div className="ws-panel-flat flex items-center justify-between gap-3 px-3 py-3">
      <div className="text-sm font-semibold text-white">Revision {revision}</div>
      <span className="ws-chip" data-tone={tone}>
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
