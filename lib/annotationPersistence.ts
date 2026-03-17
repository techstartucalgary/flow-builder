import { toPersistencePayload } from '@/lib/annotationAdapters';
import { getBackendUrl } from '@/lib/backendUrl';
import type {
  AnnotationDocument,
  AnnotationStorePayload,
  RevisionBatchPayload,
  RevisionsResponse,
} from '@/types/annotation';

const BACKEND_URL = getBackendUrl();
const MAX_CONFLICT_RETRIES = 6;

let annotationWriteQueue: Promise<void> = Promise.resolve();

function runSerializedAnnotationWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = annotationWriteQueue.then(operation, operation);
  annotationWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function waitForAnnotationWritesToDrain(): Promise<void> {
  return annotationWriteQueue;
}

export async function fetchAnnotationStorePayload(
  projectId: string,
  pageNumber: number,
): Promise<AnnotationStorePayload> {
  const res = await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to load annotation doc (${res.status})`);
  }
  return res.json() as Promise<AnnotationStorePayload>;
}

export async function saveAnnotationDocumentWithConflictRetry({
  projectId,
  pageNumber,
  document,
  onConflictRevision,
}: {
  projectId: string;
  pageNumber: number;
  document: AnnotationDocument;
  onConflictRevision?: (revision: number) => void;
}): Promise<AnnotationStorePayload> {
  return runSerializedAnnotationWrite(async () => {
    let revision = document.meta.revision;
    let res: Response | null = null;

    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt += 1) {
      const payload = toPersistencePayload({
        ...document,
        meta: {
          ...document.meta,
          revision,
        },
      });
      payload.base_revision = revision;

      res = await fetch(`${BACKEND_URL}/api/annotations/${projectId}?page=${pageNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status !== 409) break;

      const latest = await fetchAnnotationStorePayload(projectId, pageNumber);
      revision = latest.latest_revision;
      onConflictRevision?.(latest.latest_revision);
    }

    if (!res) {
      throw new Error('Failed to save annotation document');
    }

    if (!res.ok) {
      if (res.status === 409) {
        throw new Error('Annotation revision kept changing while saving. Please retry.');
      }
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Failed to save annotation document (${res.status})`);
    }

    return res.json() as Promise<AnnotationStorePayload>;
  });
}

export async function postAnnotationRevisionsWithConflictRetry({
  projectId,
  pageNumber,
  payload,
  onConflictRevision,
}: {
  projectId: string;
  pageNumber: number;
  payload: RevisionBatchPayload;
  onConflictRevision?: (revision: number) => void;
}): Promise<RevisionsResponse> {
  return runSerializedAnnotationWrite(async () => {
    let parentRevisionId = payload.parent_revision_id;
    let response: Response | null = null;

    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt += 1) {
      response = await fetch(`${BACKEND_URL}/api/annotations/${projectId}/revisions?page=${pageNumber}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          parent_revision_id: parentRevisionId,
        }),
      });

      if (response.status !== 409) break;

      const latest = await fetchAnnotationStorePayload(projectId, pageNumber);
      parentRevisionId = latest.latest_revision;
      onConflictRevision?.(latest.latest_revision);
    }

    if (!response || !response.ok) {
      if (response?.status === 409) {
        throw new Error('Annotation revision kept changing during sync. Please retry.');
      }
      throw new Error('Revision sync failed');
    }

    return response.json() as Promise<RevisionsResponse>;
  });
}
