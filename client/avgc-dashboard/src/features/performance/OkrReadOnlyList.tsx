import type { PerformanceOkr } from './performanceTypes';

export function OkrReadOnlyList({ okrs }: { okrs: PerformanceOkr[] }) {
  if (!okrs.length) {
    return <p className="performance-okr-empty">No OKRs defined for this quarter.</p>;
  }

  return (
    <ul className="performance-okr-list">
      {okrs.map((o, idx) => (
        <li key={o.id ?? idx} className="performance-okr-card">
          <div className="performance-okr-card-head">
            <span className="performance-okr-card-num">OKR {idx + 1}</span>
            <span className="performance-okr-card-weight">{o.weightage}%</span>
            {o.status ? <span className="performance-okr-status-pill">{o.status}</span> : null}
          </div>
          <dl className="performance-okr-readonly">
            <div>
              <dt>Objective</dt>
              <dd>{o.objective}</dd>
            </div>
            <div>
              <dt>Key result</dt>
              <dd>{o.keyResult}</dd>
            </div>
            <div>
              <dt>KRA</dt>
              <dd>{o.kra}</dd>
            </div>
            <div>
              <dt>KPI</dt>
              <dd>{o.kpi}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
