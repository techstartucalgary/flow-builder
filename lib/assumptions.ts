import { getBackendUrl } from '@/lib/backendUrl';
import { DEFAULT_ASSUMPTIONS } from '@/types/assumptions';
import type { AssumptionsSnapshot } from '@/types/assumptions';

const BACKEND_URL = getBackendUrl();

export async function fetchAssumptions(
  projectId: string,
  pageNumber: number,
): Promise<AssumptionsSnapshot> {
  const res = await fetch(
    `${BACKEND_URL}/api/assumptions/${projectId}?page=${pageNumber}`,
  );
  if (!res.ok) return { ...DEFAULT_ASSUMPTIONS };
  const data = await res.json();
  return data as AssumptionsSnapshot;
}

export async function saveAssumptions(
  projectId: string,
  pageNumber: number,
  overrides: Partial<AssumptionsSnapshot>,
): Promise<AssumptionsSnapshot> {
  const res = await fetch(
    `${BACKEND_URL}/api/assumptions/${projectId}?page=${pageNumber}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to save assumptions (${res.status})`);
  }
  return res.json() as Promise<AssumptionsSnapshot>;
}
