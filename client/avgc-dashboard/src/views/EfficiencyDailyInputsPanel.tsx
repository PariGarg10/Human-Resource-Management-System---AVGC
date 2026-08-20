import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type DailyInputRow = {
  workLogId: number;
  projectId: number;
  projectName: string;
  taskName: string;
  versionLabel: string;
  unitLabel: string;
  logDate: string;
  actualOutputQty: number;
  actualManhoursSpent?: number | null;
  remarks?: string | null;
  outputHours: number;
  rawOutputHours: number;
  attendanceHours: number | null;
  outputCapped: boolean;
};

type DailyEmployee = {
  employeeId: number;
  employeeName: string;
  workDays: number | null;
  workDaysSource: string;
  totalOutputHours: number;
  rows: DailyInputRow[];
};

type DailyReport = {
  date: string;
  employees: DailyEmployee[];
};

type EfficiencyProject = { id: number; name: string };

type Props = {
  title?: string;
};

export function EfficiencyDailyInputsPanel({
  title = 'Daily project inputs',
}: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [projects, setProjects] = useState<EfficiencyProject[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [wdDraft, setWdDraft] = useState<Record<number, string>>({});
  const [savingWd, setSavingWd] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'employee' | 'project' | 'task' | 'date'>('employee');
  const [taskFilter, setTaskFilter] = useState('');

  useEffect(() => {
    api<{ projects: EfficiencyProject[] }>('/api/efficiency-projects')
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (projectId) params.set('projectId', projectId);
      if (employeeId) params.set('employeeId', employeeId);
      const data = await api<DailyReport>(`/api/efficiency/daily-inputs?${params.toString()}`);
      setReport(data);
      const nextDraft: Record<number, string> = {};
      for (const emp of data.employees || []) {
        nextDraft[emp.employeeId] = emp.workDays != null ? String(emp.workDays) : '';
      }
      setWdDraft(nextDraft);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load daily inputs', 'error');
    } finally {
      setLoading(false);
    }
  }, [date, projectId, employeeId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const employeeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const emp of report?.employees || []) {
      map.set(emp.employeeId, emp.employeeName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [report?.employees]);

  const flatRows = useMemo(() => {
    const out: Array<DailyInputRow & { employeeId: number; employeeName: string }> = [];
    for (const emp of report?.employees || []) {
      for (const row of emp.rows) {
        out.push({ ...row, employeeId: emp.employeeId, employeeName: emp.employeeName });
      }
    }
    const taskQ = taskFilter.trim().toLowerCase();
    const filtered = taskQ
      ? out.filter(
          (r) =>
            r.taskName.toLowerCase().includes(taskQ) ||
            r.projectName.toLowerCase().includes(taskQ) ||
            r.employeeName.toLowerCase().includes(taskQ)
        )
      : out;
    filtered.sort((a, b) => {
      if (sortBy === 'project') return a.projectName.localeCompare(b.projectName);
      if (sortBy === 'task') return a.taskName.localeCompare(b.taskName);
      if (sortBy === 'date') return b.logDate.localeCompare(a.logDate);
      return a.employeeName.localeCompare(b.employeeName);
    });
    return filtered;
  }, [report?.employees, sortBy, taskFilter]);

  async function saveWorkDays(empId: number) {
    const wd = Number(wdDraft[empId]);
    if (!Number.isFinite(wd) || wd < 0) {
      toast('Work days (WDs) must be a number >= 0', 'error');
      return;
    }
    setSavingWd(empId);
    try {
      await api('/api/efficiency/wd-overrides', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: empId,
          periodFrom: date,
          periodTo: date,
          wd,
        }),
      });
      toast('Work days (WDs) saved', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save WDs', 'error');
    } finally {
      setSavingWd(null);
    }
  }

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{title}</h2>
          <p className="stat-sub">
            Approved daily output per employee and project. Output hours are capped at 8 when they exceed attendance
            hours minus 1.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => load().catch(() => {})}>
          Refresh
        </button>
      </div>

      <div className="filters-inline" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
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
        <label>
          Sort by{' '}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="employee">Employee</option>
            <option value="project">Project</option>
            <option value="task">Task</option>
            <option value="date">Date</option>
          </select>
        </label>
        <label>
          Search{' '}
          <input
            type="search"
            placeholder="Employee, project, or task"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <p className="stat-sub">Loading…</p>
      ) : flatRows.length === 0 ? (
        <p className="stat-sub">No approved work logs for this date and filters.</p>
      ) : (
        <div className="table-wrap table-wrap--scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Project</th>
                <th>Task</th>
                <th>Version</th>
                <th>Date</th>
                <th>Quantity</th>
                <th>Actual MH</th>
                <th>Remarks</th>
                <th>Output hours</th>
                <th>Attendance hrs</th>
                <th>Work days (WDs)</th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row) => (
                <tr key={row.workLogId}>
                  <td>{row.employeeName}</td>
                  <td>{row.projectName}</td>
                  <td>{row.taskName}</td>
                  <td>{row.versionLabel || '—'}</td>
                  <td>{row.logDate}</td>
                  <td>
                    {row.actualOutputQty}
                    {row.unitLabel ? ` ${row.unitLabel}` : ''}
                  </td>
                  <td>
                    {row.actualManhoursSpent != null ? row.actualManhoursSpent.toFixed(2) : '—'}
                  </td>
                  <td>{row.remarks?.trim() || '—'}</td>
                  <td>{row.outputHours.toFixed(2)}</td>
                  <td>{row.attendanceHours != null ? row.attendanceHours.toFixed(2) : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        style={{ width: 72 }}
                        value={wdDraft[row.employeeId] ?? ''}
                        onChange={(e) =>
                          setWdDraft((prev) => ({ ...prev, [row.employeeId]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={savingWd === row.employeeId}
                        onClick={() => saveWorkDays(row.employeeId)}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
