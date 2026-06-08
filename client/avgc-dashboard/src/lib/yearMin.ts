export const MIN_PORTAL_YEAR = 2026;
export const MAX_PORTAL_YEAR = 2100;

export function clampPortalYear(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(new Date().getFullYear(), MIN_PORTAL_YEAR);
  return Math.min(MAX_PORTAL_YEAR, Math.max(MIN_PORTAL_YEAR, Math.floor(n)));
}

export function currentPortalYear(): number {
  return Math.max(new Date().getFullYear(), MIN_PORTAL_YEAR);
}
