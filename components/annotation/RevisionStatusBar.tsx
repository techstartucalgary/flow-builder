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
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-gray-300 flex items-center justify-between">
      <span>Revision: {revision}</span>
      <span
        className={
          status === 'error'
            ? 'text-red-300'
            : status === 'saved'
              ? 'text-emerald-300'
              : 'text-amber-300'
        }
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
