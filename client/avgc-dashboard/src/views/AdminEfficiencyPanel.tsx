import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { EfficiencyDailyInputsPanel } from '@/views/EfficiencyDailyInputsPanel';
import { EfficiencyProjectSetupPanel } from '@/views/EfficiencyProjectSetupPanel';

type EfficiencyProject = { id: number; name: string };

type EfficiencyEmployee = {
  employeeId: number;
  employeeName: string;
  totalMhs: number;
  totalMDs: number | null;
  wd: number | null;
  efficiencyPercent: number | null;
  rating: number | null;
  breakdown: Array<{
    projectName: string;
    taskName: string;
    versionLabel: string;
    logDate: string;
    actualOutputQty: number;
    impliedMhs: number;
  }>;
};

type EfficiencyReport = {
  period: string;
  from: string;
  to: string;
  periodLabel: string;
  wdIntegrationStatus: string;
  wdIntegrationProposal?: Record<string, unknown>;
  employees: EfficiencyEmployee[];
  rows: Array<{
    employee_id: number;
    employee_name: string;
    project_name: string;
    task_name: string;
    version_label: string;
    log_date: string;
    actual_output_qty: number;
    implied_mhs: number;
  }>;
};

function taskLabel(taskName: string, versionLabel: string) {
  const version = versionLabel?.trim();
  return version ? `${taskName} — ${version}` : taskName;
}

export function AdminEfficiencyPanel() {
  const [tab, setTab] = useState<'reports' | 'daily' | 'setup'>('reports');
  const [projects, setProjects] = useState<EfficiencyProject[]>([]);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [report, setReport] = useState<EfficiencyReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ projects: EfficiencyProject[] }>('/api/efficiency-projects')
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  const employeeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of report?.rows || []) {
      map.set(row.employee_id, row.employee_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [report?.rows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, date });
      if (employeeId) params.set('employeeId', employeeId);
      if (projectId) params.set('projectId', projectId);
      const data = await api<EfficiencyReport>(`/api/efficiency?${params.toString()}`);
      setReport(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load efficiency report', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, date, employeeId, projectId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  function exportExcel() {
    const params = new URLSearchParams({ period, date });
    if (employeeId) params.set('employeeId', employeeId);
    if (projectId) params.set('projectId', projectId);
    const token = localStorage.getItem('token');
    fetch(`/api/efficiency/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(String(body.message || 'Export failed'));
        }
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `efficiency-${period}-${date}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Export failed', 'error'));
  }

  const tableRows = report?.rows || [];

  const tabBar = (
    <div className="filters-inline" style={{ marginBottom: 12 }}>
      <button
        type="button"
        className={`btn btn-sm ${tab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setTab('reports')}
      >
        Efficiency reports
      </button>
      <button
        type="button"
        className={`btn btn-sm ${tab === 'daily' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setTab('daily')}
      >
        Daily inputs
      </button>
      <button
        type="button"
        className={`btn btn-sm ${tab === 'setup' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setTab('setup')}
      >
        Projects &amp; task standards
      </button>
    </div>
  );

  if (tab === 'daily') {
    return (
      <div>
        {tabBar}
        <EfficiencyDailyInputsPanel />
      </div>
    );
  }

  if (tab === 'setup') {
    return (
      <div>
        {tabBar}
        <EfficiencyProjectSetupPanel />
      </div>
    );
  }

  return (
    <div>
      {tabBar}
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Efficiency tracking</h2>
          <p className="stat-sub">Approved output vs working days for the selected period.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={exportExcel}>
          Export to Excel
        </button>
      </div>

      {report?.wdIntegrationStatus === 'disabled' ? (
        <p className="stat-sub" style={{ marginBottom: 12 }}>
          Working days (WDs) are turned off (EFFICIENCY_WD_INTEGRATION=disabled).
        </p>
      ) : null}

      <div className="filters-inline" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <label>
          Period{' '}
          <select value={period} onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month')}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <label>
          Date{' '}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Employee{' '}
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">All</option>
            {employeeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Project{' '}
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => load().catch(() => {})}>
          Apply
        </button>
      </div>

      {report ? (
        <p className="stat-sub" style={{ marginBottom: 12 }}>
          Showing {report.periodLabel} ({report.from} to {report.to})
        </p>
      ) : null}

      {loading ? (
        <p className="stat-sub">Loading…</p>
      ) : tableRows.length === 0 ? (
        <p className="stat-sub">No approved work logs for these filters.</p>
      ) : (
        <div className="table-wrap table-wrap--scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Project</th>
                <th>Task</th>
                <th>Date</th>
                <th>Output</th>
                <th>Implied MHs</th>
                <th>Work days (WDs)</th>
                <th>Efficiency%</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => {
                const emp = report?.employees.find((e) => e.employeeId === row.employee_id);
                return (
                  <tr key={`${row.employee_id}-${row.log_date}-${idx}`}>
                    <td>{row.employee_name}</td>
                    <td>{row.project_name}</td>
                    <td>{taskLabel(row.task_name, row.version_label)}</td>
                    <td>{row.log_date}</td>
                    <td>{row.actual_output_qty}</td>
                    <td>{Number(row.implied_mhs).toFixed(2)}</td>
                    <td>{emp?.wd ?? '—'}</td>
                    <td>{emp?.efficiencyPercent != null ? `${emp.efficiencyPercent}%` : '—'}</td>
                    <td>{emp?.rating ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  );
}
