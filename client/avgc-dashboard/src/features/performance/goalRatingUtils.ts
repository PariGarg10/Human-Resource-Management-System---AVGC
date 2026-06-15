export type OkrRatingEntry = {
  okrId: number;
  rating?: number;
  score?: number;
  progress?: number;
  feedback?: string;
};

export function ratingForEntry(ratings: OkrRatingEntry[] | undefined, okrId: number): number | null {
  const hit = (ratings || []).find((r) => Number(r.okrId) === okrId);
  if (!hit) return null;
  const v = hit.rating ?? hit.score;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

export function feedbackForEntry(ratings: OkrRatingEntry[] | undefined, okrId: number): string {
  const hit = (ratings || []).find((r) => Number(r.okrId) === okrId);
  return hit?.feedback?.trim() || '';
}

export function progressForEntry(
  ratings: OkrRatingEntry[] | undefined,
  okrId: number,
  fallback = 0
): number {
  const hit = (ratings || []).find((r) => Number(r.okrId) === okrId);
  if (hit?.progress != null) return Number(hit.progress);
  return fallback;
}
