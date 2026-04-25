'use client';

import { BrickWall, ChevronDown, DoorOpen, Layers3, MoreVertical, Search, Square, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AnnotationDocument, AnnotationElement, RoomRelations, WallRelations } from '@/types/annotation';

interface MeasurementGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: Array<{
    id: string;
    label: string;
    count: number;
    elementIds: string[];
  }>;
}

interface MeasurementsRailProps {
  document: AnnotationDocument | null;
  pageNumber: number;
  onFocusElements: (elementIds: string[]) => void;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function elementLabel(element: AnnotationElement): string {
  if (element.attrs.name?.trim()) return element.attrs.name.trim();
  if (element.type === 'wall') {
    const relations = element.relations as WallRelations | undefined;
    if (relations?.surfaceClass === 'perimeter') return 'Exterior';
    if (relations?.surfaceClass === 'partition') {
      return relations.boardSides === 1 ? 'Interior 1-sided' : 'Interior 2-sided';
    }
    return 'Unclassified';
  }
  if (element.type === 'door') return 'Door';
  if (element.type === 'window') return 'Window';
  const relations = element.relations as RoomRelations | undefined;
  return relations?.material ? titleCase(relations.material) : 'Room / Area';
}

function buildItems(elements: AnnotationElement[]): MeasurementGroup['items'] {
  const grouped = new Map<string, { label: string; elementIds: string[] }>();
  for (const element of elements) {
    const label = elementLabel(element);
    const key = label.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.elementIds.push(element.id);
    } else {
      grouped.set(key, { label, elementIds: [element.id] });
    }
  }
  return Array.from(grouped.values()).map((item) => ({
    id: item.label,
    label: item.label,
    count: item.elementIds.length,
    elementIds: item.elementIds,
  }));
}

export default function MeasurementsRail({ document, pageNumber, onFocusElements }: MeasurementsRailProps) {
  const [query, setQuery] = useState('');

  const groups = useMemo<MeasurementGroup[]>(() => {
    const elements = document?.elements ?? [];
    return [
      {
        id: 'walls',
        label: 'Walls',
        icon: BrickWall,
        items: buildItems(elements.filter((element) => element.type === 'wall')),
      },
      {
        id: 'doors',
        label: 'Doors',
        icon: DoorOpen,
        items: buildItems(elements.filter((element) => element.type === 'door')),
      },
      {
        id: 'windows',
        label: 'Windows',
        icon: Square,
        items: buildItems(elements.filter((element) => element.type === 'window')),
      },
      {
        id: 'rooms',
        label: 'Rooms/Areas',
        icon: Layers3,
        items: buildItems(elements.filter((element) => element.type === 'room')),
      },
    ];
  }, [document?.elements]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = groups.map((group) => ({
    ...group,
    items: normalizedQuery
      ? group.items.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
      : group.items,
  }));

  return (
    <aside className="project-measurements-rail ws-panel-flat flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--ws-divider)] px-3.5 py-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Measurements</h2>
          <div className="mt-1 text-[11px] text-[var(--ws-text-muted)]">Current page</div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ws-text-secondary)] transition hover:bg-white/10 hover:text-white"
          aria-label="Measurement options"
        >
          <MoreVertical size={16} />
        </button>
      </div>

      <div className="border-b border-[var(--ws-divider)] px-3 py-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-[var(--ws-border)] bg-white/[0.035] px-3 py-2 text-sm text-white"
        >
          <span>Sheet {pageNumber}</span>
          <ChevronDown size={15} className="text-[var(--ws-text-muted)]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 dark-scrollbar">
        <div className="mb-3 flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.16em] text-[var(--ws-text-muted)]">
          <Workflow size={13} />
          <span>Groups</span>
        </div>
        <div className="space-y-1.5">
          {visibleGroups.map((group) => {
            const Icon = group.icon;
            const total = group.items.reduce((sum, item) => sum + item.count, 0);
            return (
              <div key={group.id}>
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.055] px-2.5 py-2 text-sm font-medium text-white">
                  <ChevronDown size={14} className="text-[var(--ws-text-muted)]" />
                  <Icon size={15} className="text-cyan-200" />
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <span className="measurement-count">{total}</span>
                </div>
                <div className="mt-1 space-y-0.5 pl-8">
                  {group.items.length ? group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onFocusElements(item.elementIds)}
                      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--ws-text-secondary)] transition hover:bg-white/[0.055] hover:text-white"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="measurement-count">{item.count}</span>
                    </button>
                  )) : (
                    <div className="px-2 py-1.5 text-xs text-[var(--ws-text-muted)]">No items</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--ws-divider)] p-2.5">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ws-text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search in measurements"
            className="w-full rounded-lg border border-[var(--ws-border)] bg-white/[0.035] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-[var(--ws-text-muted)] focus:border-cyan-400/45"
          />
        </label>
      </div>
    </aside>
  );
}
