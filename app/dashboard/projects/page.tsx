'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Filter,
  FolderArchive,
  FolderKanban,
  Info,
  LayoutTemplate,
  Loader2,
  Plus,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  file_mime: string;
  created_at: string;
};

type ProjectStatus = 'Ready' | 'In Progress';
type ProjectBucket = 'active' | 'archived' | 'templates';
type BuildingType = 'Residential' | 'Commercial' | 'Mixed-Use';
type StatusFilter = 'all' | 'ready' | 'in-progress';
type ValueFilter = 'all' | 'under-200k' | 'over-200k';

type ProjectActivityItem = {
  id: string;
  title: string;
  at: string;
};

type DashboardProject = {
  id: string;
  workflowId: string | null;
  name: string;
  status: ProjectStatus;
  lastUpdated: string;
  estimatedValue: number;
  buildingType: BuildingType;
  bucket: ProjectBucket;
  source: 'supabase' | 'fallback';
  fileMime: string;
  recentActivity: ProjectActivityItem[];
};

type FallbackProjectSeed = {
  id: string;
  name: string;
  bucket: ProjectBucket;
  createdAt: string;
  fileMime: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');
const CURRENCY_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const COMPACT_CURRENCY_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const FALLBACK_PROJECT_SEEDS: FallbackProjectSeed[] = [
  {
    id: 'fallback-active-a',
    name: 'Cedar Ridge Residences - B12',
    bucket: 'active',
    createdAt: '2026-04-21T16:20:00.000Z',
    fileMime: 'application/pdf',
  },
  {
    id: 'fallback-active-b',
    name: 'Northpoint Medical Annex - C04',
    bucket: 'active',
    createdAt: '2026-04-22T19:05:00.000Z',
    fileMime: 'application/pdf',
  },
  {
    id: 'fallback-active-c',
    name: 'Harbor View Mixed-Use - L2',
    bucket: 'active',
    createdAt: '2026-04-23T13:45:00.000Z',
    fileMime: 'application/pdf',
  },
  {
    id: 'fallback-archived-a',
    name: 'Maple Street Townhomes - A3',
    bucket: 'archived',
    createdAt: '2026-02-03T12:00:00.000Z',
    fileMime: 'application/pdf',
  },
  {
    id: 'fallback-template-a',
    name: 'Office Renovation Template',
    bucket: 'templates',
    createdAt: '2026-03-12T10:15:00.000Z',
    fileMime: 'application/pdf',
  },
];

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(value: string): string {
  const target = new Date(value).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const absMs = Math.abs(diffMs);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absMs < HOUR_MS) {
    return formatter.format(Math.round(diffMs / (60 * 1000)), 'minute');
  }
  if (absMs < DAY_MS) {
    return formatter.format(Math.round(diffMs / HOUR_MS), 'hour');
  }
  if (absMs < 30 * DAY_MS) {
    return formatter.format(Math.round(diffMs / DAY_MS), 'day');
  }
  if (absMs < 365 * DAY_MS) {
    return formatter.format(Math.round(diffMs / (30 * DAY_MS)), 'month');
  }
  return formatter.format(Math.round(diffMs / (365 * DAY_MS)), 'year');
}

function hashString(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function toSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
}

function pickBuildingType(seed: number): BuildingType {
  const types: BuildingType[] = ['Residential', 'Commercial', 'Mixed-Use'];
  return types[seed % types.length];
}

function deriveStatus(lastUpdated: string, seed: number): ProjectStatus {
  const ageDays = (Date.now() - new Date(lastUpdated).getTime()) / DAY_MS;
  if (ageDays <= 7) return 'In Progress';
  return seed % 4 === 0 ? 'In Progress' : 'Ready';
}

function deriveEstimatedValue(fileMime: string, seed: number): number {
  const base = fileMime === 'application/pdf' ? 180000 : 145000;
  return base + (seed % 260) * 1200;
}

function deriveActivityFeed(projectName: string, status: ProjectStatus, lastUpdated: string, seed: number): ProjectActivityItem[] {
  const readyTitles = [
    `${projectName} estimate package finalized`,
    'Plan annotations synced',
    'Material output verified',
    'Team review completed',
  ];
  const activeTitles = [
    `${projectName} takeoff run in progress`,
    'Scope checklist updated',
    'Openings verification pending',
    'Material assumptions recalculated',
  ];

  const titles = status === 'Ready' ? readyTitles : activeTitles;
  const offsetHours = 10 + (seed % 8);
  const updatedTs = new Date(lastUpdated).getTime();

  return titles.map((title, index) => ({
    id: `${projectName}-${index}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    title,
    at: new Date(updatedTs - index * offsetHours * HOUR_MS).toISOString(),
  }));
}

function buildStarterPlanSvg(projectName: string): string {
  const safeTitle = projectName.replace(/[<>&'"]/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1100">
  <rect width="1600" height="1100" fill="#040a16"/>
  <g stroke="#3b82f6" stroke-opacity="0.24" fill="none">
    <path d="M80 120h1440v820H80z" stroke-width="6"/>
    <path d="M80 360h860M940 360h580M700 120v560M980 120v820M1230 360v580M80 680h900" stroke-width="4"/>
    <path d="M300 360c0-64 52-116 116-116M560 680c0-72 58-130 130-130M980 680c0-62 50-112 112-112" stroke-width="3"/>
  </g>
  <g fill="#60a5fa" fill-opacity="0.6" font-family="Arial, sans-serif">
    <text x="140" y="240" font-size="44" font-weight="700">FlowBuildr Starter Plan</text>
    <text x="140" y="290" font-size="30">${safeTitle || 'New Project'}</text>
    <text x="1200" y="1000" font-size="24">Scale: Demo Sheet</text>
  </g>
</svg>`;
}

function buildDashboardProject(params: {
  id: string;
  name: string;
  lastUpdated: string;
  fileMime: string;
  bucket: ProjectBucket;
  source: DashboardProject['source'];
  workflowId: string | null;
  override?: { buildingType: BuildingType; status: ProjectStatus; estimatedValue: number };
}): DashboardProject {
  const seed = hashString(`${params.id}:${params.name}:${params.lastUpdated}`);
  const status = params.override?.status ?? deriveStatus(params.lastUpdated, seed);
  const buildingType = params.override?.buildingType ?? pickBuildingType(seed);
  const estimatedValue = params.override?.estimatedValue ?? deriveEstimatedValue(params.fileMime, seed);

  return {
    id: params.id,
    workflowId: params.workflowId,
    name: params.name,
    status,
    lastUpdated: params.lastUpdated,
    estimatedValue,
    buildingType,
    bucket: params.bucket,
    source: params.source,
    fileMime: params.fileMime,
    recentActivity: deriveActivityFeed(params.name, status, params.lastUpdated, seed),
  };
}

function buildProjectQuickStats(project: DashboardProject) {
  const seed = hashString(project.id);
  const planFiles = project.fileMime === 'application/pdf' ? 1 : 1;
  const activeTakeoffs = project.status === 'In Progress' ? 1 : 0;
  const revisionCount = Math.max(1, project.recentActivity.length + (seed % 4));

  return [
    { label: 'Plan Files', value: NUMBER_FORMAT.format(planFiles) },
    { label: 'Est. Value', value: COMPACT_CURRENCY_FORMAT.format(project.estimatedValue) },
    { label: 'Revisions', value: NUMBER_FORMAT.format(revisionCount) },
    { label: 'Active Takeoffs', value: NUMBER_FORMAT.format(activeTakeoffs) },
  ];
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [scope, setScope] = useState<ProjectBucket>('active');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [valueFilter, setValueFilter] = useState<ValueFilter>('all');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [detailsProjectId, setDetailsProjectId] = useState<string | null>(null);
  const [launchingProjectId, setLaunchingProjectId] = useState<string | null>(null);

  const [projectOverrides, setProjectOverrides] = useState<
    Record<string, { buildingType: BuildingType; status: ProjectStatus; estimatedValue: number }>
  >({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [buildingType, setBuildingType] = useState<BuildingType>('Residential');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    void fetchProjects(user.id);
  }, [user?.id]);

  const supabaseProjects = useMemo<DashboardProject[]>(() => {
    return projects.map((project) =>
      buildDashboardProject({
        id: project.id,
        name: project.name,
        lastUpdated: project.created_at,
        fileMime: project.file_mime,
        bucket: 'active',
        source: 'supabase',
        workflowId: project.id,
        override: projectOverrides[project.id],
      }),
    );
  }, [projectOverrides, projects]);

  const fallbackProjects = useMemo<DashboardProject[]>(
    () =>
      FALLBACK_PROJECT_SEEDS.map((seed) =>
        buildDashboardProject({
          id: seed.id,
          name: seed.name,
          lastUpdated: seed.createdAt,
          fileMime: seed.fileMime,
          bucket: seed.bucket,
          source: 'fallback',
          workflowId: null,
        }),
      ),
    [],
  );

  const dashboardProjects = useMemo(() => {
    const activeSupabase = supabaseProjects.filter((project) => project.bucket === 'active');
    const fallbackActive = fallbackProjects
      .filter((project) => project.bucket === 'active')
      .slice(0, Math.max(0, 3 - activeSupabase.length));
    const fallbackStatic = fallbackProjects.filter((project) => project.bucket !== 'active');

    return [...supabaseProjects, ...fallbackActive, ...fallbackStatic];
  }, [fallbackProjects, supabaseProjects]);

  const filteredProjects = useMemo(() => {
    return dashboardProjects
      .filter((project) => project.bucket === scope)
      .filter((project) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'ready') return project.status === 'Ready';
        return project.status === 'In Progress';
      })
      .filter((project) => {
        if (valueFilter === 'all') return true;
        if (valueFilter === 'under-200k') return project.estimatedValue < 200000;
        return project.estimatedValue >= 200000;
      })
      .filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  }, [dashboardProjects, query, scope, statusFilter, valueFilter]);

  const selectedRowProject = useMemo(
    () => filteredProjects.find((project) => project.id === selectedRowId) ?? filteredProjects[0] ?? null,
    [filteredProjects, selectedRowId],
  );

  const detailsProject = useMemo(
    () => dashboardProjects.find((project) => project.id === detailsProjectId) ?? null,
    [dashboardProjects, detailsProjectId],
  );

  const quickStats = useMemo(() => {
    const activeProjects = dashboardProjects.filter((project) => project.bucket === 'active');
    const readyCount = activeProjects.filter((project) => project.status === 'Ready').length;
    const inProgressCount = activeProjects.filter((project) => project.status === 'In Progress').length;
    const totalValue = activeProjects.reduce((sum, project) => sum + project.estimatedValue, 0);
    const recentUpdates = activeProjects.filter(
      (project) => Date.now() - new Date(project.lastUpdated).getTime() < 7 * DAY_MS,
    ).length;

    return {
      totalProjects: activeProjects.length,
      readyCount,
      inProgressCount,
      totalValue,
      activeTakeoffs: Math.max(1, inProgressCount),
      recentUpdates,
    };
  }, [dashboardProjects]);

  const detailsQuickStats = useMemo(
    () => (detailsProject ? buildProjectQuickStats(detailsProject) : []),
    [detailsProject],
  );

  useEffect(() => {
    if (filteredProjects.length === 0) {
      setSelectedRowId(null);
      return;
    }
    if (!selectedRowId || !filteredProjects.some((project) => project.id === selectedRowId)) {
      setSelectedRowId(filteredProjects[0].id);
    }
  }, [filteredProjects, selectedRowId]);

  useEffect(() => {
    if (!detailsProjectId) return;
    if (!dashboardProjects.some((project) => project.id === detailsProjectId)) {
      setDetailsProjectId(null);
    }
  }, [dashboardProjects, detailsProjectId]);

  async function fetchProjects(userId: string) {
    try {
      setLoadingProjects(true);
      setProjectsError(null);

      const { data, error } = await supabase
        .from('projects')
        .select('id,user_id,name,file_path,file_mime,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data ?? []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load projects.';
      setProjectsError(message);
    } finally {
      setLoadingProjects(false);
    }
  }

  function resetModalFields() {
    setProjectName('');
    setBuildingType('Residential');
    setUploadFile(null);
    setDragOver(false);
    setCreateError(null);
  }

  function openCreateModal() {
    resetModalFields();
    setIsModalOpen(true);
  }

  function closeCreateModal() {
    if (creating) return;
    setIsModalOpen(false);
  }

  async function uploadAsset(projectId: string, userId: string, name: string, file: File | null) {
    let sourceFile = file;
    if (!sourceFile) {
      const starterSvg = buildStarterPlanSvg(name);
      const starterBlob = new Blob([starterSvg], { type: 'image/svg+xml' });
      sourceFile = new File([starterBlob], 'starter-plan.svg', { type: 'image/svg+xml' });
    }

    const safeName = toSlug(sourceFile.name || 'starter-plan.svg');
    const filePath = `${userId}/${projectId}/${safeName}`;
    const fileMime = sourceFile.type || 'application/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(filePath, sourceFile, { upsert: false, contentType: fileMime });

    if (uploadError) throw uploadError;

    return {
      filePath,
      fileMime,
    };
  }

  async function createProjectRecord(options: {
    name: string;
    buildingTypeValue: BuildingType;
    file: File | null;
    openAfterCreate?: boolean;
    statusOverride?: ProjectStatus;
    valueOverride?: number;
  }) {
    if (!user?.id) throw new Error('You must be signed in to create a project.');

    const createdProjectId = crypto.randomUUID();
    const normalizedName = options.name.trim();
    const { filePath, fileMime } = await uploadAsset(createdProjectId, user.id, normalizedName, options.file);

    const { error: insertError } = await supabase.from('projects').insert({
      id: createdProjectId,
      user_id: user.id,
      name: normalizedName,
      file_path: filePath,
      file_mime: fileMime,
    });

    if (insertError) throw insertError;

    setProjectOverrides((current) => ({
      ...current,
      [createdProjectId]: {
        buildingType: options.buildingTypeValue,
        status: options.statusOverride ?? 'In Progress',
        estimatedValue: options.valueOverride ?? deriveEstimatedValue(fileMime, hashString(createdProjectId)),
      },
    }));

    await fetchProjects(user.id);
    setSelectedRowId(createdProjectId);
    setDetailsProjectId(createdProjectId);

    if (options.openAfterCreate) {
      router.push(`/dashboard/projects/${createdProjectId}`);
    }
  }

  async function handleCreateProject() {
    try {
      if (!projectName.trim()) {
        throw new Error('Project name is required.');
      }
      setCreating(true);
      setCreateError(null);

      await createProjectRecord({
        name: projectName,
        buildingTypeValue: buildingType,
        file: uploadFile,
      });

      setIsModalOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create project.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenWorkspace(project: DashboardProject) {
    if (project.workflowId) {
      router.push(`/dashboard/projects/${project.workflowId}`);
      return;
    }

    try {
      setLaunchingProjectId(project.id);
      setProjectsError(null);
      await createProjectRecord({
        name: project.name,
        buildingTypeValue: project.buildingType,
        file: null,
        openAfterCreate: true,
        statusOverride: project.status,
        valueOverride: project.estimatedValue,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to open this project.';
      setProjectsError(message);
    } finally {
      setLaunchingProjectId(null);
    }
  }

  return (
    <div className="mx-auto h-full w-full max-w-[1900px] min-h-0">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px] 2xl:grid-cols-[235px_minmax(0,1fr)_320px]">
        <aside className="ws-panel-flat flex min-h-0 flex-col p-4 xl:max-h-[calc(100dvh-8.5rem)] xl:sticky xl:top-4 xl:overflow-y-auto dark-scrollbar">
          <h1 className="text-lg font-semibold text-white">Projects</h1>

          <nav className="mt-4 space-y-1.5">
            <SidebarItem
              label="Active Projects"
              icon={<FolderKanban size={16} />}
              count={quickStats.totalProjects}
              active={scope === 'active'}
              onClick={() => setScope('active')}
            />
            <SidebarItem
              label="Archived"
              icon={<FolderArchive size={16} />}
              count={dashboardProjects.filter((project) => project.bucket === 'archived').length}
              active={scope === 'archived'}
              onClick={() => setScope('archived')}
            />
            <SidebarItem
              label="Templates"
              icon={<LayoutTemplate size={16} />}
              count={dashboardProjects.filter((project) => project.bucket === 'templates').length}
              active={scope === 'templates'}
              onClick={() => setScope('templates')}
            />
          </nav>

          <div className="my-4 h-px bg-white/10" />

          <div className="space-y-3">
            <h2 className="text-xs uppercase tracking-[0.14em] text-slate-400">Filters</h2>

            <SelectField
              label="Status"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'ready', label: 'Ready' },
                { value: 'in-progress', label: 'In Progress' },
              ]}
            />

            <SelectField
              label="Estimated Value"
              value={valueFilter}
              onChange={(value) => setValueFilter(value as ValueFilter)}
              options={[
                { value: 'all', label: 'All Values' },
                { value: 'under-200k', label: 'Under $200K' },
                { value: 'over-200k', label: '$200K and above' },
              ]}
            />
          </div>

          <div className="mt-auto pt-4">
            <p className="text-xs text-slate-500">
              Use the Create Project action in the Project Pipeline header.
            </p>
          </div>
        </aside>

        <section className="ws-panel-flat flex min-h-0 flex-col overflow-hidden xl:max-h-[calc(100dvh-8.5rem)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Workflow Dashboard</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Project Pipeline</h2>
            </div>

            <button
              onClick={openCreateModal}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
            >
              <Plus size={15} />
              Create Project
            </button>
          </div>

          <div className="grid gap-3 border-b border-white/10 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects"
                className="h-10 w-full rounded-lg border border-white/10 bg-[#0b1120]/70 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
              />
            </div>
            <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#0b1120]/70 px-3 text-sm text-slate-300">
              <Filter size={14} />
              {scope === 'active' ? 'Active Projects' : scope === 'archived' ? 'Archived' : 'Templates'}
            </div>
          </div>

          {projectsError ? (
            <div className="border-b border-white/10 px-5 py-3 text-sm text-rose-200">{projectsError}</div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto dark-scrollbar">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-10 bg-[#090f1d]/95 backdrop-blur">
                <tr className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  <th className="border-b border-white/10 px-5 py-3 font-medium">Project Name</th>
                  <th className="border-b border-white/10 px-4 py-3 font-medium">Status</th>
                  <th className="border-b border-white/10 px-4 py-3 font-medium">Last Updated</th>
                  <th className="border-b border-white/10 px-4 py-3 font-medium">Estimated Value</th>
                  <th className="border-b border-white/10 px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingProjects ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-9 text-sm text-slate-300">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading projects...
                      </span>
                    </td>
                  </tr>
                ) : filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                      No projects match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((project) => {
                    const isSelected = selectedRowProject?.id === project.id;
                    const isViewingDetails = detailsProject?.id === project.id;
                    const isLaunching = launchingProjectId === project.id;

                    return (
                      <tr
                        key={project.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelectedRowId(project.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedRowId(project.id);
                          }
                        }}
                        className={[
                          'cursor-pointer border-b border-white/5 text-sm text-slate-200 transition',
                          isSelected
                            ? 'bg-[linear-gradient(90deg,rgba(37,99,235,0.20),rgba(30,58,138,0.12))]'
                            : 'hover:bg-white/[0.03]',
                        ].join(' ')}
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-100">{project.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{project.buildingType}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={project.status} />
                        </td>
                        <td className="px-4 py-3.5 text-slate-300">{formatTimestamp(project.lastUpdated)}</td>
                        <td className="px-4 py-3.5 text-slate-100">{CURRENCY_FORMAT.format(project.estimatedValue)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setDetailsProjectId(project.id);
                                setSelectedRowId(project.id);
                              }}
                              className={[
                                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition',
                                isViewingDetails
                                  ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
                                  : 'border-white/12 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]',
                              ].join(' ')}
                              aria-label={`View project details for ${project.name}`}
                              title="View details"
                            >
                              <Info size={13} />
                              Details
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleOpenWorkspace(project);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/12 bg-white/[0.03] text-slate-200 transition hover:bg-white/[0.08]"
                              aria-label={`Open workspace for ${project.name}`}
                              title="Open workspace"
                            >
                              {isLaunching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="ws-panel-flat flex min-h-0 flex-col gap-2.5 p-3.5 xl:max-h-[calc(100dvh-8.5rem)] xl:sticky xl:top-4 xl:overflow-y-auto dark-scrollbar">
          <div>
            <h3 className="text-xl font-semibold text-white">Project Details</h3>
            <p className="mt-1 text-xs text-slate-400">
              {detailsProject
                ? `${detailsProject.buildingType} • ${detailsProject.status} • ${formatTimestamp(detailsProject.lastUpdated)}`
                : 'Select a row, then click Details to load this panel.'}
            </p>
          </div>

          <section className="rounded-xl border border-white/10 bg-[#090f1d]/80 p-3">
            <h4 className="text-sm font-semibold text-slate-100">Recent Activity</h4>
            <div className="mt-2 border-t border-white/10 pt-2">
              {detailsProject ? (
                <ul className="space-y-2.5">
                  {detailsProject.recentActivity.slice(0, 4).map((item, index, list) => (
                    <li key={item.id} className="relative flex gap-2.5">
                      {index !== list.length - 1 ? (
                        <span className="absolute left-[8px] top-[17px] h-[calc(100%+0.65rem)] w-px bg-emerald-300/20" />
                      ) : null}
                      <span className="mt-0.5 inline-flex h-[16px] w-[16px] items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/20 text-emerald-100">
                        <Check size={10} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.95rem] leading-tight text-slate-100">{item.title}</span>
                        <span className="mt-0.5 block text-[0.82rem] text-slate-400">{formatRelativeTime(item.at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No project details loaded yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#090f1d]/80 p-3">
            <h4 className="text-sm font-semibold text-slate-100">Quick Stats</h4>
            <div className="mt-2 border-t border-white/10 pt-2">
              {detailsProject ? (
                <div className="grid grid-cols-2 text-sm">
                  {detailsQuickStats.map((stat, index) => (
                    <QuickStatCell
                      key={stat.label}
                      value={stat.value}
                      label={stat.label}
                      borderedRight={index % 2 === 0}
                      borderedBottom={index < 2}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <QuickStatCell value={NUMBER_FORMAT.format(quickStats.totalProjects)} label="Plan Files" />
                  <QuickStatCell value={COMPACT_CURRENCY_FORMAT.format(quickStats.totalValue)} label="Est. Value" />
                  <QuickStatCell value={NUMBER_FORMAT.format(quickStats.recentUpdates)} label="Revisions" />
                  <QuickStatCell value={NUMBER_FORMAT.format(quickStats.activeTakeoffs)} label="Active Takeoffs" />
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/75" onClick={closeCreateModal} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[radial-gradient(120%_180%_at_0%_0%,rgba(26,67,122,0.34),#070f1f_55%,#050a14_100%)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-7 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Create Project</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">Start New Workflow</h3>
              </div>
              <button
                onClick={closeCreateModal}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Close create project modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-7 py-5">
              {createError ? (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {createError}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm text-slate-300">Project Name</label>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="e.g. Midtown Studio Renovation"
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Building Type</label>
                <div className="relative">
                  <select
                    value={buildingType}
                    onChange={(event) => setBuildingType(event.target.value as BuildingType)}
                    className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-4 pr-10 text-sm text-white focus:border-cyan-400/40 focus:outline-none"
                  >
                    <option value="Residential" className="bg-[#081224] text-slate-100">Residential</option>
                    <option value="Commercial" className="bg-[#081224] text-slate-100">Commercial</option>
                    <option value="Mixed-Use" className="bg-[#081224] text-slate-100">Mixed-Use</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Plan Upload (Simulated)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.svg,application/pdf,image/jpeg,image/png,image/svg+xml"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    const dropped = event.dataTransfer.files?.[0] ?? null;
                    setUploadFile(dropped);
                  }}
                  className={[
                    'w-full rounded-xl border border-dashed px-6 py-9 text-center transition',
                    dragOver
                      ? 'border-cyan-400/70 bg-cyan-500/10'
                      : 'border-white/20 bg-[#061021] hover:border-cyan-400/35 hover:bg-cyan-500/[0.06]',
                  ].join(' ')}
                >
                  <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/5 text-slate-300">
                    <UploadCloud size={20} />
                  </div>
                  <div className="text-lg font-semibold text-slate-100">
                    {uploadFile ? uploadFile.name : 'Drop a plan file or click to upload'}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {uploadFile
                      ? 'File attached. This project will use it as the starter sheet.'
                      : 'If skipped, FlowBuildr will attach a starter blueprint automatically.'}
                  </div>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-white/10 px-7 py-5">
              <button
                onClick={() => void handleCreateProject()}
                disabled={creating || !projectName.trim()}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/20 px-6 text-base font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {creating ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  'Create Project'
                )}
              </button>
              <button
                onClick={closeCreateModal}
                disabled={creating}
                className="h-11 min-w-[140px] rounded-full border border-white/15 bg-white/[0.03] px-6 text-sm text-slate-200 transition hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarItem({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition',
        active
          ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100'
          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]',
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">{count}</span>
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-slate-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-lg border border-white/10 bg-[#0b1120]/70 px-3 pr-9 text-sm text-slate-200 focus:border-cyan-400/35 focus:outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#081224] text-slate-100">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
      </div>
    </label>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const badgeClass =
    status === 'Ready'
      ? 'border-emerald-400/35 bg-emerald-500/16 text-emerald-100'
      : 'border-amber-400/35 bg-amber-500/16 text-amber-100';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass}`}>
      {status}
    </span>
  );
}

function QuickStatCell({
  label,
  value,
  borderedRight = false,
  borderedBottom = false,
}: {
  label: string;
  value: string;
  borderedRight?: boolean;
  borderedBottom?: boolean;
}) {
  return (
    <div
      className={[
        'px-2 py-2.5',
        borderedRight ? 'border-r border-white/10' : '',
        borderedBottom ? 'border-b border-white/10' : '',
      ].join(' ')}
    >
      <div className="truncate text-[1.35rem] font-semibold leading-none text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}
