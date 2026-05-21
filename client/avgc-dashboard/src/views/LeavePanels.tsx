import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { StatusBadge } from '@/components/ui/StatusBadge';

type LeaveRow = {
  id?: number;
  leavetype: string;
  fromdate: string;
  todate: string;
  status: string;
  reason?: string;
};

export function LeaveApplyPanel() {
  const [leaveType, setLeaveType] = useState('Casual Leave');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
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
        }),
      });
      setSuccessMsg('Leave applied successfully. It will appear in Leave history with status Pending until your manager reviews it.');
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Apply for leave</h2>
      {successMsg && (
        <div
          className="mt-4 rounded-md border border-[#ed1d24]/30 bg-[rgba(237,29,36,0.08)] px-4 py-3 text-sm font-semibold text-[#ed1d24]"
          role="status"
        >
          {successMsg}
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Leave type
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
          >
            <option>Sick Leave</option>
            <option>Casual Leave</option>
            <option>Paid Leave</option>
            <option>Work From Home</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          From
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          To
          <input
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-h-[44px]"
          />
        </label>
        <label className="sm:col-span-2 text-sm font-medium text-slate-700">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-avgc-brand px-6 py-3 text-sm font-semibold text-white sm:col-span-2 min-h-[44px] disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </form>
    </div>
  );
}

export function LeaveHistoryPanel() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [q, setQ] = useState('');
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

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (
      r.leavetype.toLowerCase().includes(t) ||
      r.status.toLowerCase().includes(t) ||
      (r.reason || '').toLowerCase().includes(t)
    );
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Leave history</h2>
        <input
          type="search"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-3 font-semibold">Type</th>
              <th className="pb-3 font-semibold">From</th>
              <th className="pb-3 font-semibold">To</th>
              <th className="pb-3 font-semibold">Status</th>
              <th className="pb-3 font-semibold">Reason</th>
              <th className="pb-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-500 sm:col-span-6" colSpan={6}>
                  No leave requests yet. Apply above and they will show here.
                </td>
              </tr>
            ) : (
              filtered.map((leave) => {
                const canCancel = ['pending', 'approved'].includes(leave.status.toLowerCase());
                return (
                  <tr key={leave.id ?? `${leave.fromdate}-${leave.todate}-${leave.leavetype}`}>
                    <td className="py-3">{leave.leavetype}</td>
                    <td className="py-3">{leave.fromdate}</td>
                    <td className="py-3">{leave.todate}</td>
                    <td className="py-3">
                      <StatusBadge status={leave.status} />
                    </td>
                    <td className="py-3 text-slate-600">{leave.reason || '—'}</td>
                    <td className="py-3">
                      {canCancel && leave.id ? (
                        <button
                          type="button"
                          onClick={() => cancelLeave(leave)}
                          disabled={cancellingId === leave.id}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {cancellingId === leave.id ? 'Cancelling…' : 'Cancel Leave'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
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
