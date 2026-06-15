import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmployeePerformanceWorkspace } from '@/features/performance/EmployeePerformanceWorkspace';
import { buildTeamTrendChart, chartHasData } from '@/features/performance/chartSeries';
import { PerformanceLineChart } from '@/features/performance/PerformanceLineChart';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type TeamMember = {
  id: number;
  name: string;
  employeecode?: string;
  okrCount: number;
  okrsLocked: boolean;
  reviewStatus: string;
};

type TeamAnalysis = {
  members: AnalysisMember[];
  quarterlyTrend?: {
    year: number;
    quarter: number;
    avgSelfRating: number | null;
    avgManagerRating: number | null;
    avgFinalScore: number | null;
    completedCount: number;
  }[];
  summary: {
    total: number;
    okrsPending: number;
    selfPending: number;
    managerPending: number;
    completed: number;
    avgManagerRating: number | null;
  };
};

type TeamSubTab = 'team-kras' | 'quarterly-review' | 'team-analysis';

function statusBadge(status: string, okrsLocked: boolean, okrCount: number) {
  if (!okrCount) return <span className="perf-status-pill perf-status-pill--muted">Not started</span>;
  if (!okrsLocked) return <span className="perf-status-pill perf-status-pill--warn">KRAs pending</span>;
  if (status === 'SELF SUBMITTED') return <span className="perf-status-pill perf-status-pill--warn">Awaiting review</span>;
  if (status === 'MANAGER SUBMITTED') return <span className="perf-status-pill perf-status-pill--info">Review submitted</span>;
  if (status === 'LOCKED') return <span className="perf-status-pill perf-status-pill--done">Completed</span>;
  return <span className="perf-status-pill perf-status-pill--muted">Self assessment</span>;
}

type AnalysisMember = TeamMember & {
  department?: string;
  selfOverallRating?: number | null;
  managerOverallRating?: number | null;
  finalScore?: number | null;
};

export function TeamPerformanceSection({ year, quarter }: { year: number; quarter: number }) {
  const [subTab, setSubTab] = useState<TeamSubTab>('team-kras');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [analysis, setAnalysis] = useState<TeamAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTeam = useCallback(async () => {
    const data = await api<{ members: TeamMember[] }>(
      `/api/performance/manager/team?year=${year}&quarter=${quarter}`
    );
    setTeam(data.members || []);
  }, [year, quarter]);

  const loadAnalysis = useCallback(async () => {
    const data = await api<TeamAnalysis>(
      `/api/performance/manager/team-analysis?year=${year}&quarter=${quarter}`
    );
    setAnalysis(data);
  }, [year, quarter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (subTab === 'team-analysis') await loadAnalysis();
      else await loadTeam();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [subTab, loadTeam, loadAnalysis]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamChart = useMemo(
    () => buildTeamTrendChart(analysis?.quarterlyTrend || []),
    [analysis?.quarterlyTrend]
  );

  if (selectedId != null) {
    return (
      <div className="perf-team-employee-workspace panel">
        <EmployeePerformanceWorkspace
          mode="manager"
          employeeId={selectedId}
          employeeName={selectedName}
          year={year}
          quarter={quarter}
          onBack={() => {
            setSelectedId(null);
            void load();
          }}
          onUpdated={() => void load()}
          initialTab={subTab === 'quarterly-review' ? 'review' : 'okrs'}
        />
      </div>
    );
  }

  const filteredTeam =
    subTab === 'quarterly-review'
      ? team.filter((m) => m.okrsLocked && ['SELF SUBMITTED', 'MANAGER SUBMITTED', 'LOCKED'].includes(m.reviewStatus))
      : team;

  return (
    <div className="perf-team-section">
      <div className="perf-subtabs" role="tablist">
        {(
          [
            ['team-kras', 'Team KRAs'],
            ['quarterly-review', 'Quarterly review'],
            ['team-analysis', 'Overall analysis'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={subTab === id}
            className={`perf-subtab${subTab === id ? ' is-active' : ''}`}
            onClick={() => setSubTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="stat-sub">Loading team data…</p>
      ) : subTab === 'team-analysis' && analysis ? (
        <div className="perf-team-analysis">
          <div className="perf-admin-kpi-row perf-admin-kpi-row--compact">
            <div className="perf-admin-kpi">
              <strong>{analysis.summary.total}</strong>
              <span>Direct reports</span>
            </div>
            <div className="perf-admin-kpi">
              <strong>{analysis.summary.okrsPending}</strong>
              <span>KRAs to approve</span>
            </div>
            <div className="perf-admin-kpi">
              <strong>{analysis.summary.managerPending}</strong>
              <span>Awaiting your review</span>
            </div>
            <div className="perf-admin-kpi perf-admin-kpi--accent">
              <strong>{analysis.summary.avgManagerRating ?? '—'}</strong>
              <span>Avg manager rating</span>
            </div>
          </div>
          {chartHasData(teamChart.series) ? (
            <PerformanceLineChart
              title="Team performance trend"
              subtitle="Average ratings and final scores across your direct reports by quarter"
              labels={teamChart.labels}
              series={teamChart.series}
            />
          ) : null}
          <div className="perf-team-table-wrap">
            <table className="data-table perf-team-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>KRAs</th>
                  <th>Status</th>
                  <th>Self</th>
                  <th>Your rating</th>
                  <th>Final</th>
                </tr>
              </thead>
              <tbody>
                {analysis.members.map((m) => (
                  <tr
                    key={m.id}
                    className="perf-admin-row-click"
                    onClick={() => {
                      setSelectedId(m.id);
                      setSelectedName(m.name);
                    }}
                  >
                    <td>
                      <strong>{m.name}</strong>
                      {m.department ? <span className="stat-sub"> · {m.department}</span> : null}
                    </td>
                    <td>{m.okrCount}</td>
                    <td>{statusBadge(m.reviewStatus, m.okrsLocked, m.okrCount)}</td>
                    <td>{m.selfOverallRating ?? '—'}</td>
                    <td>{m.managerOverallRating ?? '—'}</td>
                    <td>{m.finalScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredTeam.length === 0 ? (
        <p className="performance-okr-empty">No direct reports in your team for this quarter.</p>
      ) : (
        <div className="perf-team-list">
          {filteredTeam.map((m) => (
            <button
              key={m.id}
              type="button"
              className="perf-team-row"
              onClick={() => {
                setSelectedId(m.id);
                setSelectedName(m.name);
              }}
            >
              <div>
                <strong>{m.name}</strong>
                {m.employeecode ? <span className="stat-sub"> · {m.employeecode}</span> : null}
                <p className="stat-sub">{m.okrCount} goal{m.okrCount === 1 ? '' : 's'}</p>
              </div>
              {statusBadge(m.reviewStatus, m.okrsLocked, m.okrCount)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
