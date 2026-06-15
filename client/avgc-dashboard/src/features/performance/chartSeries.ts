export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  axis: 'rating' | 'score';
  values: (number | null)[];
};

export type QuarterPoint = {
  label: string;
  year: number;
  quarter: number;
};

export function quarterLabel(year: number, quarter: number) {
  return `Q${quarter} ${year}`;
}

function clampRating(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.min(5, Math.max(0, Number(value)));
}

function clampScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.min(100, Math.max(0, Number(value)));
}

export function sortQuarterPoints<T extends { year: number; quarter: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

export function buildEmployeeHistoryChart(quarters: {
  year: number;
  quarter: number;
  selfOverallRating: number | null;
  managerOverallRating: number | null;
  finalScore: number | null;
}[]): { labels: string[]; series: ChartSeries[] } {
  const sorted = sortQuarterPoints(quarters);
  const labels = sorted.map((q) => quarterLabel(q.year, q.quarter));
  return {
    labels,
    series: [
      {
        id: 'self',
        label: 'Self rating',
        color: '#111111',
        axis: 'rating',
        values: sorted.map((q) => clampRating(q.selfOverallRating)),
      },
      {
        id: 'manager',
        label: 'Manager rating',
        color: '#ed1d24',
        axis: 'rating',
        values: sorted.map((q) => clampRating(q.managerOverallRating)),
      },
      {
        id: 'final',
        label: 'Final score',
        color: '#64748b',
        axis: 'score',
        values: sorted.map((q) => clampScore(q.finalScore)),
      },
    ],
  };
}

export function buildTeamTrendChart(trend: {
  year: number;
  quarter: number;
  avgSelfRating: number | null;
  avgManagerRating: number | null;
  avgFinalScore: number | null;
}[]): { labels: string[]; series: ChartSeries[] } {
  const sorted = sortQuarterPoints(trend);
  const labels = sorted.map((q) => quarterLabel(q.year, q.quarter));
  return {
    labels,
    series: [
      {
        id: 'team-self',
        label: 'Team avg self',
        color: '#111111',
        axis: 'rating',
        values: sorted.map((q) => clampRating(q.avgSelfRating)),
      },
      {
        id: 'team-manager',
        label: 'Team avg manager',
        color: '#ed1d24',
        axis: 'rating',
        values: sorted.map((q) => clampRating(q.avgManagerRating)),
      },
      {
        id: 'team-final',
        label: 'Team avg final',
        color: '#64748b',
        axis: 'score',
        values: sorted.map((q) => clampScore(q.avgFinalScore)),
      },
    ],
  };
}

export function chartHasData(series: ChartSeries[]) {
  return series.some((s) => s.values.some((v) => v != null && Number.isFinite(v)));
}
