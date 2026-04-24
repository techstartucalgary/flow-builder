'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';

type SettingsSectionId =
  | 'account'
  | 'workspace'
  | 'estimate-defaults'
  | 'notifications'
  | 'security';

type EstimateDefaults = {
  markupPercent: number;
  currency: 'CAD' | 'USD';
  measurementSystem: 'Imperial' | 'Metric';
  defaultProjectStatus: 'In Progress' | 'Ready';
  laborPreset: 'Standard Crew' | 'Accelerated Crew' | 'Value Crew';
};

type NotificationSettings = {
  runCompletions: boolean;
  revisionAlerts: boolean;
};

const SETTINGS_NAV: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'account', label: 'Account' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'estimate-defaults', label: 'Estimate Defaults' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
];

const INITIAL_ESTIMATE_DEFAULTS: EstimateDefaults = {
  markupPercent: 15,
  currency: 'CAD',
  measurementSystem: 'Imperial',
  defaultProjectStatus: 'In Progress',
  laborPreset: 'Standard Crew',
};

const INITIAL_NOTIFICATION_SETTINGS: NotificationSettings = {
  runCompletions: true,
  revisionAlerts: true,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account');
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [projectCountError, setProjectCountError] = useState<string | null>(null);
  const [estimateDefaults, setEstimateDefaults] = useState<EstimateDefaults>(
    INITIAL_ESTIMATE_DEFAULTS,
  );
  const [notifications, setNotifications] = useState<NotificationSettings>(
    INITIAL_NOTIFICATION_SETTINGS,
  );
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const hasChangesRef = useRef(false);

  useEffect(() => {
    async function loadProjectCount(currentUserId: string) {
      const { count, error } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUserId);

      if (error) {
        setProjectCountError('Unable to load project count.');
        return;
      }

      setProjectCount(count ?? 0);
      setProjectCountError(null);
    }

    if (!user?.id) return;
    void loadProjectCount(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!hasChangesRef.current) {
      hasChangesRef.current = true;
      return;
    }

    setSaveState('saving');
    const saveTimer = setTimeout(() => setSaveState('saved'), 220);
    const idleTimer = setTimeout(() => setSaveState('idle'), 1900);

    return () => {
      clearTimeout(saveTimer);
      clearTimeout(idleTimer);
    };
  }, [estimateDefaults, notifications]);

  const workspaceName = useMemo(() => {
    const fallbackPrefix = user?.email?.split('@')[0] ?? 'FlowBuildr';
    return `${fallbackPrefix} Workspace`;
  }, [user?.email]);

  const role = 'Workspace Owner';
  const plan = 'Starter Workspace';

  const accountDetails = [
    { label: 'Email', value: user?.email ?? 'Unavailable' },
    { label: 'Plan', value: plan },
    { label: 'Workspace Name', value: workspaceName },
    { label: 'Role', value: role },
    {
      label: 'Project Count',
      value: projectCountError ? 'Unavailable' : projectCount === null ? 'Loading...' : String(projectCount),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-2">
      <header className="ws-panel-flat px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Settings</p>
            <h1 className="mt-1.5 text-2xl font-semibold text-white sm:text-[2rem]">
              Workspace Settings
            </h1>
            <p className="mt-1.5 text-sm text-slate-300">
              Configure account, estimating defaults, and workspace preferences.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/projects"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/[0.08]"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="ws-panel-flat h-fit p-3">
          <p className="px-2 pb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            Sections
          </p>
          <nav className="space-y-1.5">
            {SETTINGS_NAV.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setActiveSection(section.id)}
                className={[
                  'flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition',
                  activeSection === section.id
                    ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                    : 'border border-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white',
                ].join(' ')}
              >
                <span>{section.label}</span>
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-4">
          <section id="account" className="ws-panel-flat p-5">
            <div className="flex items-center gap-2">
              <UserRound size={16} className="text-cyan-300" />
              <h2 className="text-base font-semibold text-slate-100">Account</h2>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {accountDetails.map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-[#0b1120]/78 px-3.5 py-3">
                  <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    {item.label}
                  </dt>
                  <dd className="mt-1.5 text-sm text-slate-100">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="workspace" className="ws-panel-flat p-5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-cyan-300" />
              <h2 className="text-base font-semibold text-slate-100">Workspace</h2>
            </div>
            <p className="mt-1.5 text-sm text-slate-300">
              Core workflow defaults used when new projects are created.
            </p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <dt className="text-xs uppercase tracking-[0.1em] text-slate-400">Default Markup</dt>
                <dd className="mt-1 text-sm text-slate-100">{estimateDefaults.markupPercent}%</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <dt className="text-xs uppercase tracking-[0.1em] text-slate-400">Currency</dt>
                <dd className="mt-1 text-sm text-slate-100">{estimateDefaults.currency}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <dt className="text-xs uppercase tracking-[0.1em] text-slate-400">Measurement System</dt>
                <dd className="mt-1 text-sm text-slate-100">{estimateDefaults.measurementSystem}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <dt className="text-xs uppercase tracking-[0.1em] text-slate-400">Default Project Status</dt>
                <dd className="mt-1 text-sm text-slate-100">{estimateDefaults.defaultProjectStatus}</dd>
              </div>
            </dl>
          </section>

          <section id="estimate-defaults" className="ws-panel-flat p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-cyan-300" />
                <h2 className="text-base font-semibold text-slate-100">Estimate Defaults</h2>
              </div>
              <div className="text-xs text-slate-400">
                {saveState === 'saving' ? 'Saving locally...' : null}
                {saveState === 'saved' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 size={12} />
                    Saved
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.1em] text-slate-400">Default Markup</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={estimateDefaults.markupPercent}
                    onChange={(event) =>
                      setEstimateDefaults((prev) => ({
                        ...prev,
                        markupPercent: Number.isNaN(Number(event.target.value))
                          ? prev.markupPercent
                          : Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-white/15 bg-[#081224] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-500/20"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                </div>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.1em] text-slate-400">Currency</span>
                <select
                  value={estimateDefaults.currency}
                  onChange={(event) =>
                    setEstimateDefaults((prev) => ({
                      ...prev,
                      currency: event.target.value as EstimateDefaults['currency'],
                    }))
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#081224] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.1em] text-slate-400">Measurement Units</span>
                <select
                  value={estimateDefaults.measurementSystem}
                  onChange={(event) =>
                    setEstimateDefaults((prev) => ({
                      ...prev,
                      measurementSystem: event.target.value as EstimateDefaults['measurementSystem'],
                    }))
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#081224] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option value="Imperial">Imperial</option>
                  <option value="Metric">Metric</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-[0.1em] text-slate-400">Labor Preset</span>
                <select
                  value={estimateDefaults.laborPreset}
                  onChange={(event) =>
                    setEstimateDefaults((prev) => ({
                      ...prev,
                      laborPreset: event.target.value as EstimateDefaults['laborPreset'],
                    }))
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#081224] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option value="Standard Crew">Standard Crew</option>
                  <option value="Accelerated Crew">Accelerated Crew</option>
                  <option value="Value Crew">Value Crew</option>
                </select>
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.1em] text-slate-400">Default Project Status</span>
                <select
                  value={estimateDefaults.defaultProjectStatus}
                  onChange={(event) =>
                    setEstimateDefaults((prev) => ({
                      ...prev,
                      defaultProjectStatus: event.target.value as EstimateDefaults['defaultProjectStatus'],
                    }))
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#081224] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Ready">Ready</option>
                </select>
              </label>
            </div>
          </section>

          <section id="notifications" className="ws-panel-flat p-5">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-cyan-300" />
              <h2 className="text-base font-semibold text-slate-100">Notifications</h2>
            </div>
            <div className="mt-3 space-y-2.5">
              <label className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <span className="text-sm text-slate-200">Takeoff run completion alerts</span>
                <input
                  type="checkbox"
                  checked={notifications.runCompletions}
                  onChange={(event) =>
                    setNotifications((prev) => ({ ...prev, runCompletions: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-400 focus:ring-cyan-500/30"
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <span className="text-sm text-slate-200">Revision-ready update alerts</span>
                <input
                  type="checkbox"
                  checked={notifications.revisionAlerts}
                  onChange={(event) =>
                    setNotifications((prev) => ({ ...prev, revisionAlerts: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-400 focus:ring-cyan-500/30"
                />
              </label>
            </div>
          </section>

          <section id="security" className="ws-panel-flat p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-cyan-300" />
              <h2 className="text-base font-semibold text-slate-100">Security</h2>
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <dt className="text-xs uppercase tracking-[0.1em] text-slate-400">Sign-In Provider</dt>
                <dd className="mt-1 text-sm text-slate-100">Supabase Email Password</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0b1120]/70 px-3.5 py-2.5">
                <dt className="text-xs uppercase tracking-[0.1em] text-slate-400">Session</dt>
                <dd className="mt-1 text-sm text-slate-100">Managed on this device</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
