'use client';

import type { RoomElement, RoomRelations } from '@/types/annotation';

export type RoomTakeoffFilter = 'needs_material' | 'ambiguous' | 'all';

export interface RoomTakeoffSummary {
  room: RoomElement;
  relations: RoomRelations | undefined;
}

function relationsForRoom(room: RoomElement): RoomRelations | undefined {
  return room.relations as RoomRelations | undefined;
}

function sortScore(summary: RoomTakeoffSummary): number {
  const relations = summary.relations;
  if (!relations?.material) return 0;
  if (relations.extractionStatus === 'ambiguous') return 1;
  return 2;
}

export function summarizeRooms(rooms: RoomElement[]): RoomTakeoffSummary[] {
  return rooms
    .map((room) => ({ room, relations: relationsForRoom(room) }))
    .sort((left, right) => {
      const scoreDelta = sortScore(left) - sortScore(right);
      if (scoreDelta !== 0) return scoreDelta;
      const areaDelta = Number(right.relations?.areaSqFt ?? 0) - Number(left.relations?.areaSqFt ?? 0);
      if (areaDelta !== 0) return areaDelta;
      return (left.room.attrs.name || left.room.id).localeCompare(right.room.attrs.name || right.room.id);
    });
}

export function filterRoomSummaries(
  summaries: RoomTakeoffSummary[],
  filter: RoomTakeoffFilter,
): RoomTakeoffSummary[] {
  if (filter === 'needs_material') {
    return summaries.filter((summary) => !summary.relations?.material);
  }
  if (filter === 'ambiguous') {
    return summaries.filter((summary) => summary.relations?.extractionStatus === 'ambiguous');
  }
  return summaries;
}
