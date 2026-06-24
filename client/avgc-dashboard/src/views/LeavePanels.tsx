import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { monthName } from '@/lib/attendanceLabels';
import { MIN_PORTAL_YEAR, MAX_PORTAL_YEAR } from '@/lib/yearMin';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useUser } from '@/context/UserContext';
import { hasEmployeeAccess } from '@/lib/roles';

type LeaveRow = {
  id?: number;
  leavetype: string;
  fromdate: string;
  todate: string;
  status: string;
  reason?: string;
};

type TeamLeadOption = {
  id: number;
  name: string;
  employeecode?: string;
  designation?: string | null;
};

const LEAVE_TYPES = ['Paid Leave', 'Work From Home'] as const;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function dateOnly(value: string) {
  return value ? value.slice(0, 10) : '—';
}

function dateRangeIncludesSunday(from: string, to: string) {
  if (!from || !to) return false;
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return false;
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 0) return true;
  }
  return false;
}

export function LeaveApplyPanel() {
  const { user } = useUser();
  const showTeamLeadReporting = hasEmployeeAccess(user?.role);
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]>('Paid Leave');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [reportingToId, setReportingToId] = useState('');
  const [teamLeads, setTeamLeads] = useState<TeamLeadOption[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadTeamLeads = useCallback(async () => {
    if (!showTeamLeadReporting) {
      setTeamLeads([]);
      setLoadingLeads(false);
      return;
    }
    setLoadingLeads(true);
    try {
      const data = await api<{ teamLeads: TeamLeadOption[] }>('/api/users/team-leads');
      const leads = data.teamLeads || [];
      setTeamLeads(leads);
      const saved = user?.reportingToId;
      if (saved && leads.some((l) => l.id === saved)) {
        setReportingToId(String(saved));
      } else if (leads.length === 1) {
        setReportingToId(String(leads[0].id));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load team leads', 'error');
      setTeamLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  }, [showTeamLeadReporting, user?.reportingToId]);

  useEffect(() => {
    loadTeamLeads().catch(() => {});
  }, [loadTeamLeads]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
    if (showTeamLeadReporting && teamLeads.length > 0 && !reportingToId) {
      toast('Please select your reporting team lead', 'error');
      return;
    }
    if (from && to && from > to) {
      toast('End date must be on or after start date', 'error');
      return;
    }
    if (dateRangeIncludesSunday(from, to)) {
      toast('Leave cannot include Sundays. Please choose dates that exclude Sunday.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/leaves/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leavetype: leaveType,
          fromdate: from,
          todate: to,
          reason,
          reportingToId: reportingToId ? Number(reportingToId) : undefined,
        }),
      });
      setSuccessMsg(
        'Leave applied successfully. Your team lead and manager have been notified. It will appear in Leave history with status Pending until approved.'
      );
      toast('Leave applied successfully ✓', 'success');
      setReason('');
      setFrom('');
      setTo('');
      window.dispatchEvent(new CustomEvent('avgc-refresh-leaves'));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Leave management</h2>
      <p className="stat-sub">
        {showTeamLeadReporting
          ? 'Submit a new leave request. Your reporting team lead will be notified.'
          : 'Submit a new leave request for review.'}
      </p>
      {successMsg && (
        <p className="message" style={{ marginTop: 12, color: 'var(--brand)' }} role="status">
          {successMsg}
        </p>
      )}
      <form onSubmit={onSubmit} className="leave-apply-form" style={{ marginTop: 16 }}>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Leave type</label>
          <div className="leave-type-row">
            {LEAVE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`leave-type-chip${leaveType === type ? ' is-selected' : ''}`}
                onClick={() => setLeaveType(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="leave-apply-grid">
          <div className="form-group">
            <label htmlFor="leave-from">From date</label>
            <input
              id="leave-from"
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="When does your leave start?"
            />
          </div>
          <div className="form-group">
            <label htmlFor="leave-to">To date</label>
            <input
              id="leave-to"
              type="date"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="When do you return?"
            />
          </div>
          <div className="form-group">
            <label htmlFor="leave-reason">Reason</label>
            <input
              id="leave-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief reason for your time away"
            />
          </div>
          {showTeamLeadReporting ? (
            <div className="form-group">
              <label htmlFor="leave-reporting">Reporting to</label>
              <select
                id="leave-reporting"
                required={teamLeads.length > 0}
                value={reportingToId}
                onChange={(e) => setReportingToId(e.target.value)}
                disabled={loadingLeads}
              >
                <option value="">{loadingLeads ? 'Loading team leads…' : 'Choose your team lead'}</option>
                {teamLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                    {lead.designation ? ` — ${lead.designation}` : ''}
                    {lead.employeecode ? ` (${lead.employeecode})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {showTeamLeadReporting && !loadingLeads && teamLeads.length === 0 && (
          <p className="stat-sub" style={{ margin: '0 0 12px' }}>
            No team leads are configured yet. Ask admin to set designation (e.g. Team Lead) on the right people.
          </p>
        )}

        <div className="leave-apply-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingLeads}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function LeaveHistoryPanel() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [searchMonth, setSearchMonth] = useState('');
  const [searchYear, setSearchYear] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ leaves: LeaveRow[] }>('/api/leaves/my-leaves');
      setRows(data.leaves || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    const fn = () => {
      load().catch(() => {});
    };
    window.addEventListener('avgc-refresh-leaves', fn);
    return () => window.removeEventListener('avgc-refresh-leaves', fn);
  }, [load]);

  async function cancelLeave(leave: LeaveRow) {
    if (!leave.id) return;
    const ok = window.confirm('Cancel this leave request?');
    if (!ok) return;

    setCancellingId(leave.id);
    try {
      await api(`/api/leaves/${leave.id}/cancel`, { method: 'PATCH' });
      toast('Leave cancelled successfully ✓', 'success');
      await load();
      window.dispatchEvent(new CustomEvent('avgc-refresh-leaves'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to cancel leave', 'error');
    } finally {
      setCancellingId(null);
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const from = dateOnly(r.fromdate);
      if (!from || from === '—') return !searchMonth && !searchYear;
      const [, m] = from.split('-').map(Number);
      const y = Number(from.slice(0, 4));
      if (searchMonth && m !== Number(searchMonth)) return false;
      if (searchYear && y !== Number(searchYear)) return false;
      return true;
    });
  }, [rows, searchMonth, searchYear]);

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <h2 className="panel-title">Leave history</h2>
        <div className="filters-inline">
          <label>
            Month{' '}
            <select value={searchMonth} onChange={(e) => setSearchMonth(e.target.value)}>
              <option value="">All</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Year{' '}
            <input
              type="number"
              min={MIN_PORTAL_YEAR}
              max={MAX_PORTAL_YEAR}
              placeholder="e.g. 2026"
              value={searchYear}
              onChange={(e) => setSearchYear(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="table-wrap table-wrap--scroll" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Sr. No.</th>
              <th>Type</th>
              <th>From</th>
              <th>To</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="employeeLeaveHistoryBody">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="stat-sub">
                  No leave requests yet. Apply above and they will show here.
                </td>
              </tr>
            ) : (
              filtered.map((leave, index) => {
                const canCancel = ['pending', 'approved'].includes(leave.status.toLowerCase());
                return (
                  <tr key={leave.id ?? `${leave.fromdate}-${leave.todate}-${leave.leavetype}`}>
                    <td>{index + 1}</td>
                    <td>{leave.leavetype}</td>
                    <td>{dateOnly(leave.fromdate)}</td>
                    <td>{dateOnly(leave.todate)}</td>
                    <td>
                      <StatusBadge status={leave.status} />
                    </td>
                    <td>{leave.reason || '—'}</td>
                    <td>
                      {canCancel && leave.id ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => cancelLeave(leave)}
                          disabled={cancellingId === leave.id}
                        >
                          {cancellingId === leave.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
