'use client';

import { useAuth } from '@/contexts';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-6 sm:px-7">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Settings</p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Workspace Settings</h1>
        <p className="mt-2 text-sm text-slate-300">
          Keep account details and workspace defaults in one place.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-sm font-semibold text-slate-100">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#0b1120]/70 p-4">
            <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">Email</dt>
            <dd className="mt-2 text-sm text-slate-100">{user?.email ?? 'Unavailable'}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0b1120]/70 p-4">
            <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">Plan</dt>
            <dd className="mt-2 text-sm text-slate-100">Starter Workspace</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-sm font-semibold text-slate-100">Preferences</h2>
        <p className="mt-2 text-sm text-slate-400">
          More workspace controls can be added here as FlowBuildr settings expand.
        </p>
      </section>
    </div>
  );
}
