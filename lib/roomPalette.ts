import type { AnnotationElement } from '@/types/annotation';

export const ROOM_PALETTE = [
  { stroke: '#22d3ee', fill: 'rgba(34,211,238,0.18)' },
  { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.18)' },
  { stroke: '#fb7185', fill: 'rgba(251,113,133,0.16)' },
  { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.16)' },
  { stroke: '#34d399', fill: 'rgba(52,211,153,0.17)' },
  { stroke: '#60a5fa', fill: 'rgba(96,165,250,0.17)' },
  { stroke: '#f472b6', fill: 'rgba(244,114,182,0.16)' },
  { stroke: '#fb923c', fill: 'rgba(251,146,60,0.16)' },
  { stroke: '#2dd4bf', fill: 'rgba(45,212,191,0.17)' },
  { stroke: '#c084fc', fill: 'rgba(192,132,252,0.16)' },
  { stroke: '#bef264', fill: 'rgba(190,242,100,0.13)' },
  { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.17)' },
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function roomPaletteForElement(element: Pick<AnnotationElement, 'id' | 'attrs'>) {
  const key = `${element.attrs.name || ''}:${element.id}`;
  return ROOM_PALETTE[hashString(key) % ROOM_PALETTE.length];
}
