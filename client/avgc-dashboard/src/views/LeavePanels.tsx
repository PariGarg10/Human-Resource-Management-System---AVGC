import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { StatusBadge } from '@/components/ui/StatusBadge';

type LeaveRow = {
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      toast('Leave request submitted', 'success');
      setReason('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Apply for leave</h2>
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
          className="rounded-xl bg-[#1A237E] px-6 py-3 text-sm font-semibold text-white sm:col-span-2 min-h-[44px]"
        >
          Submit request
        </button>
      </form>
    </div>
  );
}

export function LeaveHistoryPanel() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [q, setQ] = useState('');

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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((leave, i) => (
              <tr key={`${leave.fromdate}-${i}`}>
                <td className="py-3">{leave.leavetype}</td>
                <td className="py-3">{leave.fromdate}</td>
                <td className="py-3">{leave.todate}</td>
                <td className="py-3">
                  <StatusBadge status={leave.status} />
                </td>
                <td className="py-3 text-slate-600">{leave.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
