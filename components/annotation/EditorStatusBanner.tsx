'use client';

import type { ReactNode } from 'react';

interface EditorStatusBannerProps {
  saveStatus: 'saved' | 'unsaved' | 'syncing' | 'error';
  statusMessage?: string | null;
  warning?: string | null;
  error?: string | null;
  pendingRebuild?: boolean;
  onRebuild?: () => void;
  onDismissWarning?: () => void;
  children?: ReactNode;
}

function saveTone(status: EditorStatusBannerProps['saveStatus']): 'good' | 'warn' | 'accent' | 'danger' {
  if (status === 'saved') return 'good';
  if (status === 'error') return 'danger';
  if (status === 'syncing') return 'accent';
  return 'warn';
}

function saveLabel(status: EditorStatusBannerProps['saveStatus']): string {
  if (status === 'saved') return 'Saved';
  if (status === 'error') return 'Sync failed';
  if (status === 'syncing') return 'Syncing';
  return 'Unsaved changes';
}

export default function EditorStatusBanner({
  saveStatus,
  statusMessage,
  warning,
  error,
  pendingRebuild = false,
  onRebuild,
  onDismissWarning,
  children,
}: EditorStatusBannerProps) {
  const shouldShowStatus = saveStatus !== 'saved' || Boolean(statusMessage);
  const hasMessages = shouldShowStatus || Boolean(error) || Boolean(warning) || pendingRebuild || Boolean(children);
  if (!hasMessages) return null;

  return (
    <div className="space-y-2">
      {shouldShowStatus ? (
        <div className="ws-panel-flat flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <div className="text-sm text-white">{statusMessage || 'Editor status changed.'}</div>
          <span className="ws-chip" data-tone={saveTone(saveStatus)}>
            {saveLabel(saveStatus)}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
          <div className="font-medium text-white">Editor action failed</div>
          <div className="mt-1 text-rose-100/85">{error}</div>
        </div>
      ) : null}

      {warning ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium text-white">Needs attention</div>
              <div className="mt-1 text-amber-100/85">{warning}</div>
            </div>
            <div className="flex items-center gap-2">
              {pendingRebuild && onRebuild ? (
                <button
                  type="button"
                  onClick={onRebuild}
                  className="rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-50 transition hover:bg-amber-400/20"
                >
                  Rebuild geometry
                </button>
              ) : null}
              {onDismissWarning ? (
                <button
                  type="button"
                  onClick={onDismissWarning}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-200 transition hover:bg-white/5"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}
