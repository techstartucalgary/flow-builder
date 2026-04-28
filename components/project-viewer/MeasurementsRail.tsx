'use client';

import { BrickWall, ChevronDown, DoorOpen, Layers3, MoreVertical, Search, Square, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { roomPaletteForElement } from '@/lib/roomPalette';
import type { AnnotationDocument, AnnotationElement, RoomRelations, WallRelations } from '@/types/annotation';

interface MeasurementGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: Array<{
    id: string;
    label: string;
    detail?: string;
    count: number;
    elementIds: string[];
    color?: string;
    fill?: string;
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

function itemDetail(element: AnnotationElement): string | undefined {
  if (element.type === 'room') {
    const relations = element.relations as RoomRelations | undefined;
    const area = Number(relations?.areaSqFt ?? 0);
    if (area > 0) return `${area.toFixed(0)} sf`;
  }

  const confidence = Number(element.attrs.confidence ?? 0);
  if (confidence > 0 && confidence < 1) return `${Math.round(confidence * 100)}%`;
  return undefined;
}

function buildItems(elements: AnnotationElement[]): MeasurementGroup['items'] {
  const typeCounts = new Map<string, number>();

  return elements.map((element) => {
    const baseLabel = elementLabel(element);
    const nextIndex = (typeCounts.get(baseLabel) ?? 0) + 1;
    typeCounts.set(baseLabel, nextIndex);
    const roomColor = element.type === 'room' ? roomPaletteForElement(element) : null;

    return {
      id: element.id,
      label: `${baseLabel} ${nextIndex}`,
      detail: itemDetail(element),
      count: 1,
      elementIds: [element.id],
      color: roomColor?.stroke,
      fill: roomColor?.fill,
    };
  });
}

export default function MeasurementsRail({ document, pageNumber, onFocusElements }: MeasurementsRailProps) {
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    walls: true,
    doors: true,
    windows: true,
    rooms: true,
  });

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
            const allElementIds = group.items.flatMap((item) => item.elementIds);
            const expanded = expandedGroups[group.id] ?? true;
            return (
              <div key={group.id}>
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.055] px-2.5 py-2 text-sm font-medium text-white">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedGroups((current) => ({ ...current, [group.id]: !expanded }));
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:text-cyan-100"
                    aria-expanded={expanded}
                  >
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-[var(--ws-text-muted)] transition-transform ${expanded ? '' : '-rotate-90'}`}
                    />
                    <Icon size={15} className="shrink-0 text-cyan-200" />
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  </button>
                  <button
                    type="button"
                    className="measurement-count transition hover:bg-cyan-400/20 hover:text-white"
                    title={`Jump to all ${group.label.toLowerCase()}`}
                    onClick={() => {
                      if (allElementIds.length) onFocusElements(allElementIds);
                    }}
                  >
                    {total}
                  </button>
                </div>
                {expanded ? (
                  <div className="mt-1 space-y-0.5 pl-8">
                    {group.items.length ? group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onFocusElements(item.elementIds)}
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--ws-text-secondary)] transition hover:bg-white/[0.055] hover:text-white"
                      >
                        {item.color ? (
                          <span
                            className="h-3 w-3 shrink-0 rounded-[3px] border"
                            style={{ borderColor: item.color, background: item.fill }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.detail ? (
                          <span className="shrink-0 text-[11px] text-[var(--ws-text-muted)]">{item.detail}</span>
                        ) : null}
                        <span className="measurement-count">{item.count}</span>
                      </button>
                    )) : (
                      <div className="px-2 py-1.5 text-xs text-[var(--ws-text-muted)]">No items</div>
                    )}
                  </div>
                ) : null}
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
