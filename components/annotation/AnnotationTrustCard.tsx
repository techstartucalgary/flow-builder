'use client';

import type { TrustCardModel } from '@/lib/annotationTrust';

interface AnnotationTrustCardProps {
  model: TrustCardModel;
  variant?: 'overlay' | 'panel';
  pinned?: boolean;
  onClear?: () => void;
}

export default function AnnotationTrustCard({
  model,
  variant = 'panel',
  pinned = false,
  onClear,
}: AnnotationTrustCardProps) {
  const overlay = variant === 'overlay';
  const toneClass = (tone?: TrustCardModel['statusTone']) => {
    if (tone === 'good') return 'text-emerald-200';
    if (tone === 'warn') return 'text-amber-200';
    if (tone === 'danger') return 'text-rose-200';
    if (tone === 'accent') return 'text-cyan-200';
    return 'text-white';
  };

  return (
    <div
      className={
        overlay
          ? 'w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-[var(--ws-border-strong)] bg-[rgba(8,15,29,0.96)] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.48)] backdrop-blur-xl'
          : 'rounded-2xl border border-[var(--ws-border)] bg-white/[0.03] p-4'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ws-section-header">{model.label}</div>
          <div className="mt-2 truncate text-base font-semibold text-white">{model.title}</div>
          <div className="mt-1 text-sm text-[var(--ws-text-secondary)]">{model.summary}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="ws-chip" data-tone={model.statusTone}>{model.statusLabel}</span>
          {model.issueCount ? (
            <span className="ws-chip" data-tone="warn">{model.issueCount} issue{model.issueCount === 1 ? '' : 's'}</span>
          ) : null}
          {pinned && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-[var(--ws-text-secondary)] transition hover:bg-white/5 hover:text-white"
              aria-label="Clear trust card"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {model.fields.map((field) => (
          <div key={field.label} className="rounded-xl border border-white/8 bg-black/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ws-text-muted)]">{field.label}</div>
            <div className={`mt-1 text-sm ${toneClass(field.tone)}`}>{field.value}</div>
          </div>
        ))}
      </div>

      {model.detailNote ? (
        <div className="mt-3 text-xs text-[var(--ws-text-secondary)]">
          {model.detailNote}
        </div>
      ) : null}

      {pinned ? (
        <div className="mt-3 text-[11px] text-[var(--ws-text-muted)]">
          Selection details stay available in the right rail.
        </div>
      ) : null}
    </div>
  );
}
