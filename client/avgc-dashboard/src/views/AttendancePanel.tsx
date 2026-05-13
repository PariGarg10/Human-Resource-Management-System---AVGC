import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatDateTime } from '@/lib/datetime';
import { StatusBadge } from '@/components/ui/StatusBadge';

type RecordRow = {
  date: string;
  punchin?: string | null;
  punchout?: string | null;
  totalhours?: number | null;
  status?: string;
};

export function AttendancePanel() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState('');
  const [filter, setFilter] = useState('');
  const [todayCard, setTodayCard] = useState<RecordRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [historyData, summaryData, todayData] = await Promise.all([
        api<{ records: RecordRow[] }>(`/api/attendance/history?month=${month}&year=${year}`),
        api<{ present: number; halfday: number; absent: number; leave?: number }>(
          `/api/attendance/summary?month=${month}&year=${year}`
        ),
        api<{ record: RecordRow | null }>('/api/attendance/today'),
      ]);
      setRows(historyData.records || []);
      setSummary(
        `Present: ${summaryData.present} · Half: ${summaryData.halfday} · Leave: ${summaryData.leave || 0} · Absent: ${summaryData.absent}`
      );
      const r = todayData.record;
      setTodayCard(
        r
          ? {
              date: r.date || '',
              punchin: r.punchin,
              punchout: r.punchout,
              totalhours: r.totalhours,
              status: r.status,
            }
          : null
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load', 'error');
    }
  }, [month, year]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const filtered = rows.filter((row) => !filter || row.date.includes(filter) || row.status?.includes(filter));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatMini label="Punch in" value={todayCard?.punchin ? formatDateTime(todayCard.punchin) : '—'} />
        <StatMini label="Punch out" value={todayCard?.punchout ? formatDateTime(todayCard.punchout) : '—'} />
        <StatMini label="Total hours" value={todayCard?.totalhours != null ? String(todayCard.totalhours) : '—'} />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Status today</p>
          <div className="mt-2">
            <StatusBadge status={todayCard?.status} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium text-slate-700">
            Month
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Year
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => load().catch(() => {})}
            className="rounded-xl bg-[#1A237E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#151c68] min-h-[44px]"
          >
            Load
          </button>
        </div>

        <div className="mt-4">
          <input
            type="search"
            placeholder="Filter rows…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4 font-semibold">Date</th>
                <th className="pb-3 pr-4 font-semibold">Punch in</th>
                <th className="pb-3 pr-4 font-semibold">Punch out</th>
                <th className="pb-3 pr-4 font-semibold">Hours</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr key={row.date} className="text-slate-800">
                  <td className="py-3 pr-4">{row.date}</td>
                  <td className="py-3 pr-4">{formatDateTime(row.punchin)}</td>
                  <td className="py-3 pr-4">{formatDateTime(row.punchout)}</td>
                  <td className="py-3 pr-4">{row.totalhours ?? '—'}</td>
                  <td className="py-3">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-slate-600">{summary}</p>
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
