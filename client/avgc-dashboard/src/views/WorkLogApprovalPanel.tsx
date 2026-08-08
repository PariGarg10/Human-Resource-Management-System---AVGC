import { useCallback, useEffect, useState } from 'react';
import { api, readEmployee } from '@/lib/api';
import { toast } from '@/lib/toast';

type PendingWorkLog = {
  id: number;
  employee_name: string;
  employeecode?: string;
  project_name: string;
  task_name: string;
  version_label: string;
  unit_label: string;
  log_date: string;
  actual_output_qty: number;
  actual_manhours_spent?: number | null;
  remarks?: string | null;
  status: string;
};

function formatDate(value: string) {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function taskLabel(log: PendingWorkLog) {
  const version = log.version_label?.trim();
  return version ? `${log.task_name} — ${version}` : log.task_name;
}

export function WorkLogApprovalPanel() {
  const manager = readEmployee();
  const [logs, setLogs] = useState<PendingWorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [remarks, setRemarks] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!manager?.id) return;
    setLoading(true);
    try {
      const data = await api<{ workLogs: PendingWorkLog[] }>(
        `/api/work-logs/pending?managerId=${manager.id}`
      );
      setLogs(data.workLogs || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load pending work logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [manager?.id]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function approve(id: number) {
    setBusyId(id);
    try {
      await api(`/api/work-logs/${id}/approve`, { method: 'PATCH' });
      toast('Work log approved', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Approve failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    if (!window.confirm('Reject this work log?')) return;
    setBusyId(id);
    try {
      await api(`/api/work-logs/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerRemarks: remarks[id] || '' }),
      });
      toast('Work log rejected', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Reject failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Work log approvals</h2>
          <p className="stat-sub">Review and approve output logs submitted by your reportees.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => load().catch(() => {})}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="stat-sub">Loading pending work logs…</p>
      ) : logs.length === 0 ? (
        <p className="stat-sub">No pending work logs from your team.</p>
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
                <th>Actual MH</th>
                <th>Employee remarks</th>
                <th>Manager remarks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const busy = busyId === log.id;
                return (
                  <tr key={log.id}>
                    <td>
                      <strong>{log.employee_name}</strong>
                      {log.employeecode ? <div className="stat-sub">{log.employeecode}</div> : null}
                    </td>
                    <td>{log.project_name}</td>
                    <td>{taskLabel(log)}</td>
                    <td>{formatDate(log.log_date)}</td>
                    <td>
                      {log.actual_output_qty}
                      {log.unit_label ? ` ${log.unit_label}` : ''}
                    </td>
                    <td>
                      {log.actual_manhours_spent != null ? Number(log.actual_manhours_spent).toFixed(2) : '—'}
                    </td>
                    <td>{log.remarks?.trim() || '—'}</td>
                    <td>
                      <input
                        type="text"
                        placeholder="Optional on reject"
                        value={remarks[log.id] || ''}
                        onChange={(e) => setRemarks((prev) => ({ ...prev, [log.id]: e.target.value }))}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy}
                          onClick={() => approve(log.id)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() => reject(log.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
