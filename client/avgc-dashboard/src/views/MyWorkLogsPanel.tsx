import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type WorkLog = {
  id: number;
  project_id: number;
  task_baseline_id: number;
  project_name: string;
  task_name: string;
  version_label: string;
  unit_label: string;
  log_date: string;
  actual_output_qty: number;
  actual_manhours_spent: number | null;
  remarks: string | null;
  status: string;
  manager_remarks: string | null;
};

function formatDate(value: string) {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function taskLabel(log: WorkLog) {
  const version = log.version_label?.trim();
  return version ? `${log.task_name} — ${version}` : log.task_name;
}

function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  return 'Pending approval';
}

export function MyWorkLogsPanel() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'project' | 'status'>('date-desc');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<WorkLog | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editMh, setEditMh] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (statusFilter) params.set('status', statusFilter);
      const data = await api<{ workLogs: WorkLog[] }>(`/api/work-logs/mine?${params.toString()}`);
      setLogs(data.workLogs || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load your work logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, statusFilter]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const sortedLogs = useMemo(() => {
    const copy = [...logs];
    copy.sort((a, b) => {
      if (sortBy === 'date-asc') return a.log_date.localeCompare(b.log_date);
      if (sortBy === 'project') return a.project_name.localeCompare(b.project_name);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return b.log_date.localeCompare(a.log_date);
    });
    return copy;
  }, [logs, sortBy]);

  function openEdit(log: WorkLog) {
    setEditing(log);
    setEditQty(String(log.actual_output_qty));
    setEditMh(String(log.actual_manhours_spent ?? ''));
    setEditRemarks(log.remarks || '');
  }

  async function saveEdit(resubmit: boolean) {
    if (!editing) return;
    const qty = Number(editQty);
    const mh = Number(editMh);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast('Quantity must be greater than 0', 'error');
      return;
    }
    if (!Number.isFinite(mh) || mh <= 0) {
      toast('Actual man hours must be greater than 0', 'error');
      return;
    }
    setBusyId(editing.id);
    try {
      await api(`/api/work-logs/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualOutputQty: qty,
          actualManhoursSpent: mh,
          remarks: editRemarks.trim() || undefined,
          resubmit,
        }),
      });
      toast(resubmit ? 'Resubmitted for manager approval' : 'Work log updated', 'success');
      setEditing(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeLog(id: number) {
    if (!window.confirm('Remove this work log entry?')) return;
    setBusyId(id);
    try {
      await api(`/api/work-logs/${id}`, { method: 'DELETE' });
      toast('Work log removed', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const canEdit = (log: WorkLog) => {
    const s = log.status.toLowerCase();
    return s === 'pending' || s === 'rejected';
  };

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Logged outputs</h2>
          <p className="stat-sub">
            Your daily work log entries. Edit or remove pending logs; fix and resubmit rejected ones.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => load().catch(() => {})}>
          Refresh
        </button>
      </div>

      <div className="filters-inline" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <label>
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Status{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          Sort{' '}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date-desc">Date (newest)</option>
            <option value="date-asc">Date (oldest)</option>
            <option value="project">Project</option>
            <option value="status">Status</option>
          </select>
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => load().catch(() => {})}>
          Apply
        </button>
      </div>

      {loading ? (
        <p className="stat-sub">Loading…</p>
      ) : sortedLogs.length === 0 ? (
        <p className="stat-sub">No work logs for these filters.</p>
      ) : (
        <div className="table-wrap table-wrap--scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Task</th>
                <th>Quantity</th>
                <th>Actual MH</th>
                <th>Status</th>
                <th>Manager note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedLogs.map((log) => {
                const busy = busyId === log.id;
                const editable = canEdit(log);
                return (
                  <tr key={log.id}>
                    <td>{formatDate(log.log_date)}</td>
                    <td>{log.project_name}</td>
                    <td>{taskLabel(log)}</td>
                    <td>
                      {log.actual_output_qty}
                      {log.unit_label ? ` ${log.unit_label}` : ''}
                    </td>
                    <td>{log.actual_manhours_spent != null ? Number(log.actual_manhours_spent).toFixed(2) : '—'}</td>
                    <td>{statusLabel(log.status)}</td>
                    <td>{log.manager_remarks?.trim() || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {editable ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => openEdit(log)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => removeLog(log.id)}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="stat-sub">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div className="manager-modal-backdrop" style={{ zIndex: 12000 }} role="presentation">
          <div className="manager-modal" role="dialog" aria-modal="true" style={{ zIndex: 12001 }}>
            <div className="manager-modal-head">
              <h3>Edit work log</h3>
              <button type="button" className="manager-modal-close" aria-label="Close" onClick={() => setEditing(null)}>
                ×
              </button>
            </div>
            <div className="manager-modal-body">
              <p className="stat-sub" style={{ marginBottom: 12 }}>
                {editing.project_name} — {taskLabel(editing)} ({formatDate(editing.log_date)})
              </p>
              {editing.status.toLowerCase() === 'rejected' && editing.manager_remarks ? (
                <p className="stat-sub" style={{ marginBottom: 12, color: '#b91c1c' }}>
                  Rejection reason: {editing.manager_remarks}
                </p>
              ) : null}
              <label className="form-group">
                Quantity
                <input type="number" min="0" step="any" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
              </label>
              <label className="form-group">
                Actual man hours spent
                <input type="number" min="0" step="any" value={editMh} onChange={(e) => setEditMh(e.target.value)} />
              </label>
              <label className="form-group">
                Remarks
                <textarea rows={3} value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} />
              </label>
            </div>
            <div className="manager-modal-foot">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {editing.status.toLowerCase() === 'rejected' ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busyId === editing.id}
                  onClick={() => saveEdit(true)}
                >
                  Fix &amp; resubmit
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busyId === editing.id}
                  onClick={() => saveEdit(false)}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
