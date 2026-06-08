import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

type TeamLeave = {
  id: number;
  employeeid: number;
  name: string;
  employeecode?: string;
  department?: string | null;
  leavetype: string;
  fromdate: string;
  todate: string;
  reason?: string | null;
  status: string;
  createdat?: string;
};

function formatDate(value: string) {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'cancelled') return 'Cancelled';
  return status || '—';
}

export function LeaveApprovalPanel() {
  const [leaves, setLeaves] = useState<TeamLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ leaves: TeamLeave[] }>('/api/leaves/team');
      setLeaves(data.leaves || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load team leaves', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'all') return leaves;
    return leaves.filter((l) => String(l.status).toLowerCase() === 'pending');
  }, [leaves, filter]);

  async function approve(id: number) {
    setBusyId(id);
    try {
      await api(`/api/leaves/team/${id}/approve`, { method: 'PUT' });
      toast('Leave approved', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Approve failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    if (!window.confirm('Reject this leave request?')) return;
    setBusyId(id);
    try {
      await api(`/api/leaves/team/${id}/reject`, { method: 'PUT' });
      toast('Leave rejected', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Reject failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = leaves.filter((l) => String(l.status).toLowerCase() === 'pending').length;

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Leave approval</h2>
          <p className="stat-sub">Review and approve leave requests from your assigned team.</p>
        </div>
        <div className="filters-inline">
          <label>
            Show{' '}
            <select value={filter} onChange={(e) => setFilter(e.target.value as 'pending' | 'all')}>
              <option value="pending">Pending only ({pendingCount})</option>
              <option value="all">All requests</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => load().catch(() => {})}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="stat-sub">Loading leave requests…</p>
      ) : visible.length === 0 ? (
        <p className="stat-sub">
          {filter === 'pending' ? 'No pending leave requests from your team.' : 'No leave requests found.'}
        </p>
      ) : (
        <div className="table-wrap table-wrap--scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((leave) => {
                const isPending = String(leave.status).toLowerCase() === 'pending';
                const busy = busyId === leave.id;
                return (
                  <tr key={leave.id}>
                    <td>
                      <strong>{leave.name}</strong>
                      {leave.employeecode ? <div className="stat-sub">{leave.employeecode}</div> : null}
                      {leave.department ? <div className="stat-sub">{leave.department}</div> : null}
                    </td>
                    <td>{leave.leavetype}</td>
                    <td>{formatDate(leave.fromdate)}</td>
                    <td>{formatDate(leave.todate)}</td>
                    <td>{leave.reason?.trim() || '—'}</td>
                    <td>{statusLabel(leave.status)}</td>
                    <td>
                      {isPending ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => approve(leave.id).catch(() => {})}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={busy}
                            onClick={() => reject(leave.id).catch(() => {})}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
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
