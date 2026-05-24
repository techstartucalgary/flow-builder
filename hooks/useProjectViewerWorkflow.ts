'use client';

import { useMemo } from 'react';

import type { TakeoffData } from '@/lib/parseTakeoff';
import type { EditorViewPreset } from '@/types/annotation';

export type WorkspaceMode = 'annotate' | 'review';
export type WorkflowStep = 'Setup' | 'Annotate' | 'Resolve Blockers' | 'Generate' | 'Review';
export type WorkflowTone = 'accent' | 'warn' | 'good' | 'danger';

export interface ProjectWorkflowReviewAction {
  key: string;
  label: string;
  description: string;
  preset: EditorViewPreset;
  elementIds: string[];
}

export interface WorkflowReadinessItem {
  id: string;
  label: string;
  value: string;
  status: 'ready' | 'missing' | 'draft';
  description: string;
}

export interface WorkflowBlocker {
  id: string;
  title: string;
  description: string;
  tone: WorkflowTone;
  actionLabel?: string;
  actionType?: 'scale' | 'ceiling' | 'save' | 'annotate' | 'review';
  actionKey?: string;
}

export interface WorkflowPrimaryAction {
  label: string;
  disabled: boolean;
  disabledReason?: string;
  actionType: 'annotate' | 'generate';
}

interface UseProjectViewerWorkflowArgs {
  workspaceMode: WorkspaceMode;
  generating: boolean;
  generated: boolean;
  hasScale: boolean;
  hasCeilingHeight: boolean;
  editorDocumentExists: boolean;
  editorPendingOpsCount: number;
  editorSaveStatus: 'saved' | 'unsaved' | 'syncing' | 'error';
  takeoffError: string | null;
  scaleValue: number | null;
  ceilingHeightValue: number | null;
  takeoff: TakeoffData;
  takeoffSourceDisplay: string;
  actionableReviewActions: ProjectWorkflowReviewAction[];
}

export interface ProjectViewerWorkflow {
  currentStep: WorkflowStep;
  readiness: WorkflowReadinessItem[];
  blockers: WorkflowBlocker[];
  primaryAction: WorkflowPrimaryAction;
  blockerCount: number;
}

export function useProjectViewerWorkflow({
  workspaceMode,
  generating,
  generated,
  hasScale,
  hasCeilingHeight,
  editorDocumentExists,
  editorPendingOpsCount,
  editorSaveStatus,
  takeoffError,
  scaleValue,
  ceilingHeightValue,
  takeoff,
  takeoffSourceDisplay,
  actionableReviewActions,
}: UseProjectViewerWorkflowArgs): ProjectViewerWorkflow {
  return useMemo(() => {
    const readiness: WorkflowReadinessItem[] = [
      {
        id: 'scale',
        label: 'Scale',
        value: hasScale && scaleValue ? `${scaleValue} px/ft` : 'Missing',
        status: hasScale ? 'ready' : 'missing',
        description: hasScale
          ? 'Measured and ready for area and length calculations.'
          : 'Required for reliable floor area, wall length, and deductions.',
      },
      {
        id: 'ceiling',
        label: 'Ceiling height',
        value: hasCeilingHeight && ceilingHeightValue ? `${ceilingHeightValue} ft` : 'Missing',
        status: hasCeilingHeight ? 'ready' : 'missing',
        description: hasCeilingHeight
          ? 'Used for wall board and sheet count.'
          : 'Required before trusting final material output.',
      },
      {
        id: 'geometry',
        label: 'Geometry',
        value: editorDocumentExists ? 'Saved annotation document' : 'No document',
        status: editorDocumentExists ? 'ready' : 'draft',
        description: editorDocumentExists
          ? `Current source: ${takeoffSourceDisplay}.`
          : 'Start annotating to create an editable geometry document.',
      },
      {
        id: 'save',
        label: 'Save state',
        value: editorSaveStatus === 'saved'
          ? 'Saved'
          : editorSaveStatus === 'syncing'
            ? 'Syncing'
            : editorSaveStatus === 'error'
              ? 'Attention'
              : 'Unsaved',
        status: editorSaveStatus === 'saved' ? 'ready' : editorSaveStatus === 'error' ? 'missing' : 'draft',
        description: editorPendingOpsCount > 0
          ? `${editorPendingOpsCount} change${editorPendingOpsCount === 1 ? '' : 's'} pending sync.`
          : editorSaveStatus === 'saved'
            ? 'Document is in sync.'
            : 'Save state should be clean before generate.',
      },
    ];

    const reviewActionMap = new Map(actionableReviewActions.map((action) => [action.key, action]));
    const blockers: WorkflowBlocker[] = [];

    if (editorSaveStatus === 'error') {
      blockers.push({
        id: 'save-error',
        title: 'Save changes',
        description: 'The annotation document failed to sync. Resolve this before running takeoff.',
        tone: 'danger',
        actionLabel: 'Return to annotate',
        actionType: 'annotate',
      });
    } else if (editorSaveStatus !== 'saved' || editorPendingOpsCount > 0) {
      blockers.push({
        id: 'unsaved',
        title: 'Save changes',
        description: 'Generate will save the current geometry first. Wait for sync or review pending edits.',
        tone: 'warn',
        actionLabel: 'Return to annotate',
        actionType: 'annotate',
      });
    }

    if (!hasScale) {
      blockers.push({
        id: 'missing-scale',
        title: 'Capture scale',
        description: 'Scale is required before area and board totals can be trusted.',
        tone: 'warn',
        actionLabel: 'Calibrate on plan',
        actionType: 'scale',
      });
    }

    if (!hasCeilingHeight) {
      blockers.push({
        id: 'missing-ceiling',
        title: 'Add ceiling height',
        description: 'Ceiling height drives wall board and sheet count.',
        tone: 'warn',
        actionLabel: 'Enter ceiling height',
        actionType: 'ceiling',
      });
    }

    const boundaryAction = reviewActionMap.get('closure');
    if (generated && takeoff.roomClosureStatus !== 'closed') {
      blockers.push({
        id: 'boundary-closure',
        title: 'Review room closure',
        description: `Room closure is ${takeoff.roomClosureStatus}. Floor area remains provisional until the boundary is stable.`,
        tone: 'warn',
        actionLabel: boundaryAction ? 'Review boundary' : 'Return to annotate',
        actionType: boundaryAction ? 'review' : 'annotate',
        actionKey: boundaryAction?.key,
      });
    }

    const wallsAction = reviewActionMap.get('walls');
    if (generated && takeoff.unknownWallCount > 0) {
      blockers.push({
        id: 'unknown-walls',
        title: 'Classify unknown walls',
        description: `${takeoff.unknownWallCount} wall${takeoff.unknownWallCount === 1 ? '' : 's'} still need a perimeter or partition decision.`,
        tone: 'warn',
        actionLabel: wallsAction ? 'Open wall QA' : 'Return to annotate',
        actionType: wallsAction ? 'review' : 'annotate',
        actionKey: wallsAction?.key,
      });
    }

    const openingsAction = reviewActionMap.get('unhosted-openings');
    if (generated && takeoff.unmatchedOpeningCount > 0) {
      blockers.push({
        id: 'unmatched-openings',
        title: 'Host unmatched openings',
        description: `${takeoff.unmatchedOpeningCount} opening${takeoff.unmatchedOpeningCount === 1 ? '' : 's'} are excluded from deductions until they have a host wall.`,
        tone: 'warn',
        actionLabel: openingsAction ? 'Open openings QA' : 'Return to annotate',
        actionType: openingsAction ? 'review' : 'annotate',
        actionKey: openingsAction?.key,
      });
    }

    const fallbackAction = reviewActionMap.get('fallback-openings');
    if (generated && takeoff.fallbackOpeningCount > 0) {
      blockers.push({
        id: 'fallback-openings',
        title: 'Review fallback openings',
        description: `${takeoff.fallbackOpeningCount} opening${takeoff.fallbackOpeningCount === 1 ? ' was' : 's were'} inferred from fallback evidence and should be verified.`,
        tone: 'accent',
        actionLabel: fallbackAction ? 'Review openings' : 'Return to annotate',
        actionType: fallbackAction ? 'review' : 'annotate',
        actionKey: fallbackAction?.key,
      });
    }

    if (generated && takeoff.totalCostUsd === null && takeoff.sheetsRequired > 0) {
      blockers.push({
        id: 'missing-pricing',
        title: 'Set material pricing',
        description: 'Unit cost not configured — cost estimate unavailable. Set drywall price to unlock the total.',
        tone: 'accent',
      });
    }

    if (takeoffError) {
      blockers.unshift({
        id: 'takeoff-error',
        title: 'Takeoff run failed',
        description: takeoffError,
        tone: 'danger',
      });
    }

    let currentStep: WorkflowStep = 'Setup';
    if (generating) currentStep = 'Generate';
    else if (workspaceMode === 'review' && generated) currentStep = 'Review';
    else if (generated && blockers.length > 0) currentStep = 'Resolve Blockers';
    else if (!hasScale || !hasCeilingHeight || !editorDocumentExists) currentStep = 'Setup';
    else if (generated && workspaceMode === 'annotate') currentStep = 'Annotate';
    else if (!generated) currentStep = 'Annotate';

    const primaryAction: WorkflowPrimaryAction = editorDocumentExists
      ? {
          label: generating ? 'Running Takeoff' : 'Run Takeoff',
          disabled: generating || !hasScale || !hasCeilingHeight || editorSaveStatus === 'error',
          disabledReason: generating
            ? 'Takeoff is currently running.'
            : !hasScale
              ? 'Add a valid scale or use plan calibration first.'
              : !hasCeilingHeight
                ? 'Enter a ceiling height before running takeoff.'
                : editorSaveStatus === 'error'
                  ? 'Resolve the document save error before running takeoff.'
                  : undefined,
          actionType: 'generate',
        }
      : {
          label: 'Start Annotating',
          disabled: false,
          actionType: 'annotate',
        };

    return {
      currentStep,
      readiness,
      blockers,
      primaryAction,
      blockerCount: blockers.length,
    };
  }, [
    actionableReviewActions,
    ceilingHeightValue,
    editorDocumentExists,
    editorPendingOpsCount,
    editorSaveStatus,
    generated,
    generating,
    hasCeilingHeight,
    hasScale,
    scaleValue,
    takeoff,
    takeoffError,
    takeoffSourceDisplay,
    workspaceMode,
  ]);
}
