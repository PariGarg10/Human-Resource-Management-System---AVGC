/** Production API host — set via VITE_API_URL at build time. */
const API_BASE = String(import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/$/, '');

/** Resolve `/api/...` and `/uploads/...` paths against the configured API host. */
export function resolveApiUrl(path: string): string {
  if (!path) return API_BASE || '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
