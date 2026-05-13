import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

type HistoryRecord = { date: string; status?: string };

export function CalendarPanel() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [cells, setCells] = useState<{ day: number; status: string; dateStr: string }[]>([]);

  const build = useCallback(
    async (m: number, y: number) => {
      try {
        const historyData = await api<{ records: HistoryRecord[] }>(
          `/api/attendance/history?month=${m}&year=${y}`
        );
        const statusByDate = new Map((historyData.records || []).map((r) => [r.date, r.status || 'absent']));
        const daysInMonth = new Date(y, m, 0).getDate();
        const first = new Date(y, m - 1, 1);
        const startPad = first.getDay();
        const list: { day: number; status: string; dateStr: string }[] = [];
        for (let i = 0; i < startPad; i += 1) list.push({ day: 0, status: '', dateStr: '' });
        for (let day = 1; day <= daysInMonth; day += 1) {
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          list.push({
            day,
            status: statusByDate.get(dateStr) || 'absent',
            dateStr,
          });
        }
        setCells(list);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Failed to load calendar', 'error');
      }
    },
    []
  );

  useEffect(() => {
    build(month, year).catch(() => {});
  }, [build, month, year]);

  const statusStyle = (status: string) => {
    const s = (status || 'absent').toLowerCase();
    if (s === 'present') return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    if (s === 'halfday') return 'bg-amber-100 text-amber-900 border-amber-200';
    if (s === 'leave') return 'bg-blue-100 text-blue-900 border-blue-200';
    return 'bg-red-50 text-red-900 border-red-100';
  };

  return (
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
          onClick={() => build(month, year)}
          className="rounded-xl bg-[#1A237E] px-5 py-2.5 text-sm font-semibold text-white min-h-[44px]"
        >
          Load
        </button>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-slate-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c, idx) =>
          c.day === 0 ? (
            <div key={`pad-${idx}`} className="aspect-square rounded-lg bg-transparent" />
          ) : (
            <div
              key={c.dateStr}
              title={`${c.dateStr}: ${c.status}`}
              className={cn(
                'flex aspect-square flex-col items-center justify-center rounded-lg border p-1 text-xs font-medium',
                statusStyle(c.status)
              )}
            >
              <span className="text-sm font-bold">{c.day}</span>
              <span className="truncate text-[10px] capitalize">{c.status}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
