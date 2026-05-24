'use client';

import type { RoomElement, RoomRelations, RoomSpaceType } from '@/types/annotation';

export type RoomTakeoffFilter = 'needs_material' | 'ambiguous' | 'counted' | 'non_countable' | 'all';

export interface RoomTakeoffSummary {
  room: RoomElement;
  relations: RoomRelations | undefined;
  spaceType: RoomSpaceType;
  countInRoomSchedule: boolean;
}

function relationsForRoom(room: RoomElement): RoomRelations | undefined {
  return room.relations as RoomRelations | undefined;
}

export function roomSpaceType(room: RoomElement): RoomSpaceType {
  const relations = relationsForRoom(room);
  return relations?.spaceType ?? 'counted_room';
}

export function roomCountsInSchedule(room: RoomElement): boolean {
  const relations = relationsForRoom(room);
  if (typeof relations?.countInRoomSchedule === 'boolean') return relations.countInRoomSchedule;
  return roomSpaceType(room) === 'counted_room';
}

function sortScore(summary: RoomTakeoffSummary): number {
  const relations = summary.relations;
  if (summary.countInRoomSchedule && !relations?.material) return 0;
  if (relations?.extractionStatus === 'ambiguous') return 1;
  if (!summary.countInRoomSchedule) return 2;
  return 3;
}

export function summarizeRooms(rooms: RoomElement[]): RoomTakeoffSummary[] {
  return rooms
    .map((room) => ({
      room,
      relations: relationsForRoom(room),
      spaceType: roomSpaceType(room),
      countInRoomSchedule: roomCountsInSchedule(room),
    }))
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
    return summaries.filter((summary) => summary.countInRoomSchedule && !summary.relations?.material);
  }
  if (filter === 'ambiguous') {
    return summaries.filter((summary) => summary.relations?.extractionStatus === 'ambiguous');
  }
  if (filter === 'counted') {
    return summaries.filter((summary) => summary.countInRoomSchedule);
  }
  if (filter === 'non_countable') {
    return summaries.filter((summary) => !summary.countInRoomSchedule);
  }
  return summaries;
}
