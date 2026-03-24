import type {
  AnnotationElement,
  AnnotationIssue,
  OpeningRelations,
  WallElement,
  WallRelations,
} from '@/types/annotation';

export type TrustCardTone = 'accent' | 'good' | 'warn' | 'danger';

export interface TrustCardField {
  label: string;
  value: string;
  tone?: TrustCardTone;
}

export interface TrustCardModel {
  id: string;
  kind: 'wall' | 'door' | 'window';
  title: string;
  label: string;
  statusLabel: string;
  statusTone: TrustCardTone;
  summary: string;
  issueCount: number;
  fields: TrustCardField[];
  detailNote?: string;
}

function formatStatusTone(status: AnnotationElement['attrs']['status']): TrustCardTone {
  if (status === 'edited') return 'good';
  if (status === 'new') return 'accent';
  return 'warn';
}

function formatStatusLabel(status: AnnotationElement['attrs']['status']): string {
  if (status === 'edited') return 'Edited';
  if (status === 'new') return 'New';
  return 'Auto';
}

function formatPercent(value: number | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function formatFeetFromPx(valuePx: number, scalePxPerFt: number | undefined): string | null {
  if (typeof scalePxPerFt !== 'number' || !Number.isFinite(scalePxPerFt) || scalePxPerFt <= 0) return null;
  return `${(valuePx / scalePxPerFt).toFixed(1)} ft`;
}

function labelForWallSurface(surfaceClass: WallRelations['surfaceClass']): string {
  if (surfaceClass === 'perimeter') return 'Perimeter';
  if (surfaceClass === 'partition') return 'Partition';
  return 'Unknown';
}

function titleForElement(element: AnnotationElement): string {
  return element.attrs.name?.trim() || element.id;
}

export function isTrustElement(
  element: AnnotationElement | null | undefined,
): element is Extract<AnnotationElement, { type: 'wall' | 'door' | 'window' }> {
  return Boolean(element && (element.type === 'wall' || element.type === 'door' || element.type === 'window'));
}

export function buildTrustCardModel(params: {
  element: AnnotationElement | null | undefined;
  wallsById: Record<string, AnnotationElement>;
  issues: AnnotationIssue[];
  scalePxPerFt?: number;
}): TrustCardModel | null {
  const { element, wallsById, issues, scalePxPerFt } = params;
  if (!isTrustElement(element)) return null;

  const base = {
    id: element.id,
    title: titleForElement(element),
    label: element.type === 'wall' ? 'Wall trust' : `${element.type === 'door' ? 'Door' : 'Window'} trust`,
    statusLabel: formatStatusLabel(element.attrs.status),
    statusTone: formatStatusTone(element.attrs.status),
    issueCount: issues.length,
  } as const;

  if (element.type === 'wall' && element.geometry.kind === 'segment') {
    const relations = (element.relations as WallRelations | undefined) ?? {};
    const lengthPx = Math.hypot(
      element.geometry.x2 - element.geometry.x1,
      element.geometry.y2 - element.geometry.y1,
    );
    const lengthLabel = formatFeetFromPx(lengthPx, scalePxPerFt) ?? `${Math.round(lengthPx)} px`;
    const confidence = formatPercent(element.attrs.confidence);
    const boardSides = relations.boardSides ?? (relations.surfaceClass === 'partition' ? 2 : 1);
    const excluded = relations.excludeFromTakeoff ?? false;

    return {
      ...base,
      kind: 'wall',
      summary: excluded
        ? 'Excluded from the takeoff until you include it again.'
        : `${labelForWallSurface(relations.surfaceClass)} wall with ${boardSides} board side${boardSides === 1 ? '' : 's'}.`,
      fields: [
        { label: 'Length', value: lengthLabel },
        { label: 'Surface', value: labelForWallSurface(relations.surfaceClass) },
        { label: 'Board sides', value: `${boardSides}` },
        { label: 'Takeoff', value: excluded ? 'Excluded' : 'Included', tone: excluded ? 'warn' : 'good' },
        { label: 'Confidence', value: confidence ?? 'Not scored', tone: confidence ? 'accent' : undefined },
        { label: 'Issues', value: issues.length ? `${issues.length} flagged` : 'Clear', tone: issues.length ? 'warn' : 'good' },
      ],
      detailNote: excluded
        ? 'This wall is currently ignored by downstream board calculations.'
        : 'Length, side count, and surface class are feeding the takeoff.',
    };
  }

  if (element.geometry.kind !== 'rect') return null;

  const relations = (element.relations as OpeningRelations | undefined) ?? {};
  const hostWall = relations.hostWallId ? wallsById[relations.hostWallId] : null;
  const widthPx = Math.max(element.geometry.width, element.geometry.height);
  const openingSpan = formatFeetFromPx(widthPx, scalePxPerFt) ?? `${Math.round(widthPx)} px`;
  const confidence = formatPercent(relations.confidence ?? element.attrs.confidence);
  const verificationParts = [
    formatScore(relations.verification?.wallBreakScore)
      ? `Break ${formatScore(relations.verification?.wallBreakScore)}`
      : null,
    formatScore(relations.verification?.openingPixelsScore)
      ? `Pixels ${formatScore(relations.verification?.openingPixelsScore)}`
      : null,
    formatScore(relations.verification?.classificationScore)
      ? `Class ${formatScore(relations.verification?.classificationScore)}`
      : null,
  ].filter((value): value is string => Boolean(value));
  const hosted = Boolean(hostWall);

  return {
    ...base,
    kind: element.type,
    summary: hosted
      ? `${element.type === 'door' ? 'Opening deduction' : 'Window deduction'} is anchored to ${hostWall?.attrs.name?.trim() || hostWall?.id}.`
      : 'No host wall is attached, so this opening cannot contribute a reliable deduction yet.',
    fields: [
      { label: 'Host wall', value: hostWall?.attrs.name?.trim() || hostWall?.id || 'Missing', tone: hosted ? 'good' : 'warn' },
      { label: 'Source', value: relations.source || 'Manual', tone: relations.source ? 'accent' : undefined },
      { label: 'Span', value: openingSpan },
      { label: 'Confidence', value: confidence ?? 'Not scored', tone: confidence ? 'accent' : undefined },
      { label: 'Verification', value: verificationParts[0] || relations.verification?.verificationMode || 'No verification', tone: verificationParts.length ? 'good' : hosted ? 'accent' : 'warn' },
      { label: 'Deduction', value: hosted ? 'Eligible' : 'Blocked', tone: hosted ? 'good' : 'warn' },
    ],
    detailNote: verificationParts.length > 1
      ? verificationParts.slice(1).join(' · ')
      : hosted
        ? 'Hosted openings stay tied to their parent wall for deductions.'
        : 'Attach this opening to a host wall before trusting deductions.',
  };
}
