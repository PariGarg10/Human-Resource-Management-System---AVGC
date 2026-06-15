import type { ChartSeries } from './chartSeries';

type Props = {
  title?: string;
  subtitle?: string;
  labels: string[];
  series: ChartSeries[];
  height?: number;
};

const VIEW_W = 400;
const PADDING = { top: 12, right: 36, bottom: 28, left: 32 };

function axisRange(axis: 'rating' | 'score') {
  return axis === 'rating' ? { min: 0, max: 5 } : { min: 0, max: 100 };
}

function clampToAxis(value: number, axis: 'rating' | 'score') {
  const { min, max } = axisRange(axis);
  return Math.min(max, Math.max(min, value));
}

function scaleY(value: number, axis: 'rating' | 'score', height: number) {
  const { min, max } = axisRange(axis);
  const plotH = height - PADDING.top - PADDING.bottom;
  const clamped = clampToAxis(value, axis);
  const t = (clamped - min) / (max - min || 1);
  return PADDING.top + plotH * (1 - t);
}

function scaleX(index: number, count: number, width: number) {
  const plotW = width - PADDING.left - PADDING.right;
  if (count <= 1) return PADDING.left + plotW / 2;
  return PADDING.left + (plotW * index) / (count - 1);
}

function linePath(
  values: (number | null)[],
  axis: 'rating' | 'score',
  width: number,
  height: number
) {
  const segments: string[] = [];
  let current: string[] = [];

  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      if (current.length) {
        segments.push(current.join(' '));
        current = [];
      }
      return;
    }
    const cmd = current.length ? 'L' : 'M';
    const x = scaleX(index, values.length, width).toFixed(2);
    const y = scaleY(value, axis, height).toFixed(2);
    current.push(`${cmd}${x},${y}`);
  });
  if (current.length) segments.push(current.join(' '));
  return segments;
}

export function PerformanceLineChart({ title, subtitle, labels, series, height = 156 }: Props) {
  const activeSeries = series.filter((s) => s.values.some((v) => v != null && Number.isFinite(v)));
  const hasRating = activeSeries.some((s) => s.axis === 'rating');
  const hasScore = activeSeries.some((s) => s.axis === 'score');

  if (!activeSeries.length) {
    return (
      <div className="perf-line-chart perf-line-chart--empty panel">
        {title ? <p className="perf-goal-eyebrow">{title}</p> : null}
        <p className="stat-sub">Not enough data to plot a trend yet.</p>
      </div>
    );
  }

  const ratingTicks = [0, 1, 2, 3, 4, 5];
  const scoreTicks = [0, 25, 50, 75, 100];

  return (
    <div className="perf-line-chart panel perf-line-chart--widget">
      {title ? <p className="perf-goal-eyebrow">{title}</p> : null}
      {subtitle ? <p className="stat-sub perf-line-chart-sub">{subtitle}</p> : null}
      <div className="perf-line-chart-frame">
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          className="perf-line-chart-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title || 'Performance trend chart'}
        >
          {/* Rating grid + left axis (0–5) */}
          {hasRating
            ? ratingTicks.map((tick) => {
                const y = scaleY(tick, 'rating', height);
                return (
                  <g key={`r-${tick}`}>
                    <line
                      x1={PADDING.left}
                      y1={y}
                      x2={VIEW_W - PADDING.right}
                      y2={y}
                      className="perf-line-chart-grid"
                    />
                    <text
                      x={PADDING.left - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="perf-line-chart-axis-label"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })
            : null}

          {/* Score grid when no rating series — uses full 0–100 scale */}
          {!hasRating && hasScore
            ? scoreTicks.map((tick) => {
                const y = scaleY(tick, 'score', height);
                return (
                  <g key={`s-grid-${tick}`}>
                    <line
                      x1={PADDING.left}
                      y1={y}
                      x2={VIEW_W - PADDING.right}
                      y2={y}
                      className="perf-line-chart-grid"
                    />
                    <text
                      x={PADDING.left - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="perf-line-chart-axis-label"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })
            : null}

          {/* Right axis for score when dual-axis */}
          {hasRating && hasScore
            ? scoreTicks.map((tick) => {
                const y = scaleY(tick, 'score', height);
                return (
                  <text
                    key={`s-${tick}`}
                    x={VIEW_W - PADDING.right + 6}
                    y={y + 3}
                    textAnchor="start"
                    className="perf-line-chart-axis-label perf-line-chart-axis-label--right"
                  >
                    {tick}
                  </text>
                );
              })
            : null}

          {labels.map((label, index) => {
            const x = scaleX(index, labels.length, VIEW_W);
            return (
              <text
                key={`${label}-${index}`}
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="perf-line-chart-x-label"
              >
                {label.replace(' ', '\u00a0')}
              </text>
            );
          })}

          {activeSeries.flatMap((s) =>
            linePath(s.values, s.axis, VIEW_W, height).map((path, idx) => (
              <path
                key={`${s.id}-${idx}`}
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          )}

          {activeSeries.flatMap((s) =>
            s.values.map((value, index) => {
              if (value == null || !Number.isFinite(value)) return null;
              return (
                <circle
                  key={`${s.id}-dot-${index}`}
                  cx={scaleX(index, labels.length, VIEW_W)}
                  cy={scaleY(value, s.axis, height)}
                  r={3.5}
                  fill={s.color}
                />
              );
            })
          )}
        </svg>
      </div>
      <div className="perf-line-chart-legend">
        {activeSeries.map((s) => (
          <span key={s.id} className="perf-line-chart-legend-item">
            <span className="perf-line-chart-swatch" style={{ background: s.color }} />
            {s.label}
            <span className="perf-line-chart-legend-axis">
              {s.axis === 'rating' ? '0–5' : '0–100'}
            </span>
          </span>
        ))}
      </div>
      {hasRating && hasScore ? (
        <p className="stat-sub perf-line-chart-note">Left: ratings (0–5). Right: scores (0–100).</p>
      ) : null}
    </div>
  );
}
