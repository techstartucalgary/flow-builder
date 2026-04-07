const DEFAULT_LOCAL_BACKEND_URL = 'http://127.0.0.1:8000';

export function getBackendUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (configured) return configured;
  return DEFAULT_LOCAL_BACKEND_URL;
}
