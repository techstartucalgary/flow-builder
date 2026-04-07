'use client';

import { useMemo, useState } from 'react';

import { filterRoomSummaries, summarizeRooms, type RoomTakeoffFilter } from '@/lib/roomTakeoffSelectors';
import type { FlooringMaterial, RoomElement, RoomRelations } from '@/types/annotation';

interface RoomTakeoffPanelProps {
  rooms: RoomElement[];
  selectedRoomId?: string | null;
  onFocusRoom?: (roomId: string) => void;
}

const MATERIALS: FlooringMaterial[] = ['hardwood', 'carpet', 'tile', 'vinyl', 'laminate'];
const FILTERS: Array<{ id: RoomTakeoffFilter; label: string }> = [
  { id: 'needs_material', label: 'Needs Material' },
  { id: 'counted', label: 'Counted' },
  { id: 'non_countable', label: 'Display Only' },
  { id: 'ambiguous', label: 'Ambiguous' },
  { id: 'all', label: 'All' },
];

function roomRelations(room: RoomElement): RoomRelations | undefined {
  return room.relations as RoomRelations | undefined;
}

export default function RoomTakeoffPanel({
  rooms,
  selectedRoomId,
  onFocusRoom,
}: RoomTakeoffPanelProps) {
  const [filter, setFilter] = useState<RoomTakeoffFilter>('needs_material');
  const summaries = useMemo(() => summarizeRooms(rooms), [rooms]);
  const visibleRooms = useMemo(() => filterRoomSummaries(summaries, filter), [filter, summaries]);
  const ambiguousRooms = visibleRooms.filter((summary) => summary.relations?.extractionStatus === 'ambiguous');
  const countedRooms = visibleRooms.filter((summary) => (
    summary.countInRoomSchedule && summary.relations?.extractionStatus !== 'ambiguous'
  ));
  const displayOnlyRooms = visibleRooms.filter((summary) => (
    !summary.countInRoomSchedule && summary.relations?.extractionStatus !== 'ambiguous'
  ));

  const totals = MATERIALS.map((material) => {
    const quantity = summaries.reduce((sum, summary) => {
      if (!summary.countInRoomSchedule) return sum;
      return summary.relations?.material === material
        ? sum + Number(summary.relations.quantityRequired ?? summary.relations.areaSqFt ?? 0)
        : sum;
    }, 0);
    return { material, quantity };
  }).filter((entry) => entry.quantity > 0);

  const countedSummary = summaries.filter((summary) => summary.countInRoomSchedule);
  const unassignedCount = countedSummary.filter((summary) => !summary.relations?.material).length;
  const ambiguousCount = summaries.filter((summary) => summary.relations?.extractionStatus === 'ambiguous').length;
  const displayOnlyCount = summaries.filter((summary) => !summary.countInRoomSchedule).length;
  const countedAreaSqFt = countedSummary.reduce((sum, summary) => (
    sum + Number(summary.relations?.quantityRequired ?? summary.relations?.areaSqFt ?? 0)
  ), 0);

  function renderRoomCards(
    title: string,
    entries: typeof visibleRooms,
    emptyMessage: string,
  ) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">{title}</div>
        {entries.length === 0 ? (
          <div className="text-gray-500">{emptyMessage}</div>
        ) : (
          entries.map(({ room, relations, countInRoomSchedule, spaceType }) => {
            const isSelected = room.id === selectedRoomId;
            const badgeTone = countInRoomSchedule
              ? (relations?.extractionStatus === 'ambiguous' ? 'text-amber-200' : 'text-emerald-200')
              : 'text-slate-300';
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => onFocusRoom?.(room.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  isSelected
                    ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100'
                    : 'border-white/10 bg-black/10 text-gray-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{room.attrs.name || room.id}</span>
                  <span className="text-[11px]">
                    {countInRoomSchedule
                      ? `${Number(relations?.quantityRequired ?? relations?.areaSqFt ?? 0).toFixed(1)} sq ft`
                      : `${Number(relations?.areaSqFt ?? 0).toFixed(1)} sq ft`}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="capitalize text-gray-400">
                    {(spaceType || 'counted_room').replaceAll('_', ' ')}
                  </span>
                  <span className={badgeTone}>
                    {countInRoomSchedule ? (relations?.material ?? 'Unassigned') : 'Display only'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="ws-panel p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="ws-section-header">Room Flooring</div>
        {rooms.length ? (
          <span className="ws-chip" data-tone={unassignedCount > 0 || ambiguousCount > 0 ? 'warn' : 'good'}>
            {unassignedCount > 0 ? `${unassignedCount} unassigned` : 'Ready'}
          </span>
        ) : null}
      </div>
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 space-y-2 text-gray-300">
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Counted Rooms</span>
          <span className="text-gray-100">{countedSummary.length}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Display Only</span>
          <span className={displayOnlyCount > 0 ? 'text-slate-200' : 'text-gray-100'}>{displayOnlyCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Counted Area</span>
          <span className="text-gray-100">{countedAreaSqFt.toFixed(1)} sq ft</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Unassigned</span>
          <span className={unassignedCount > 0 ? 'text-amber-200' : 'text-gray-100'}>{unassignedCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-wide text-gray-500">Ambiguous</span>
          <span className={ambiguousCount > 0 ? 'text-amber-200' : 'text-gray-100'}>{ambiguousCount}</span>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">Focus List</div>
        <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-black/20 p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition ${
                filter === item.id
                  ? 'border border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-300">Material Totals</div>
        {totals.length === 0 ? (
          <div className="text-gray-500">Assign flooring materials to counted rooms to populate takeoff quantities.</div>
        ) : (
          totals.map((entry) => (
            <div key={entry.material} className="flex items-center justify-between gap-2 text-gray-300">
              <span className="capitalize">{entry.material}</span>
              <span>{entry.quantity.toFixed(2)} sq ft</span>
            </div>
          ))
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-gray-500">
          No extracted rooms yet. Refresh rooms after the walls and openings look correct.
        </div>
      ) : visibleRooms.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-gray-500">
          No rooms match the current filter.
        </div>
      ) : (
        <>
          {renderRoomCards('Counted Rooms', countedRooms, 'No counted rooms in the current filter.')}
          {renderRoomCards('Open / Display Only', displayOnlyRooms, 'No display-only spaces in the current filter.')}
          {renderRoomCards('Needs Review', ambiguousRooms, 'No ambiguous spaces in the current filter.')}
        </>
      )}
    </div>
  );
}
