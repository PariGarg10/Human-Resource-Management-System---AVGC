import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

type HistoryRecord = { date: string; status?: string };

type SaturdayEntry = { date: string; status: 'working' | 'off'; createdBy?: number | null };

type HolidayRow = { id: number; holidayName: string; date: string; type: 'national' | 'festival' | 'optional' };

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type CellKind =
  | 'empty'
  | 'weekend'
  | 'present'
  | 'absent'
  | 'leave'
  | 'halfday'
  | 'holiday_national'
  | 'holiday_festival'
  | 'holiday_optional';

type Cell = {
  day: number;
  dateStr: string;
  kind: CellKind;
  status: string;
  holidayLabel?: string;
};

function mondayIndex(jsDay: number) {
  return (jsDay + 6) % 7;
}

function holidayCellKind(rows: HolidayRow[]): CellKind {
  const types = new Set(rows.map((r) => r.type));
  if (types.has('national')) return 'holiday_national';
  if (types.has('festival')) return 'holiday_festival';
  return 'holiday_optional';
}

function holidayTypeLabel(type: HolidayRow['type']) {
  if (type === 'national') return 'National Holiday';
  if (type === 'festival') return 'Festival';
  return 'Optional';
}

export function CalendarPanel() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [cells, setCells] = useState<Cell[]>([]);

  const build = useCallback(async (m: number, y: number) => {
    try {
      const historyData = await api<{
        records: HistoryRecord[];
        saturdayConfig?: SaturdayEntry[];
        holidays?: HolidayRow[];
      }>(`/api/attendance/history?month=${m}&year=${y}`);
      const statusByDate = new Map((historyData.records || []).map((r) => [r.date, (r.status || 'absent').toLowerCase()]));
      const saturdayStatus = new Map((historyData.saturdayConfig || []).map((e) => [e.date, e.status]));
      const holidayByDate = new Map<string, HolidayRow[]>();
      for (const h of historyData.holidays || []) {
        const list = holidayByDate.get(h.date) || [];
        list.push(h);
        holidayByDate.set(h.date, list);
      }

      const daysInMonth = new Date(y, m, 0).getDate();
      const first = new Date(y, m - 1, 1);
      const startPad = mondayIndex(first.getDay());
      const list: Cell[] = [];
      for (let i = 0; i < startPad; i += 1) list.push({ day: 0, dateStr: '', kind: 'empty', status: '' });
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dow = new Date(y, m - 1, day).getDay();
        const holRows = holidayByDate.get(dateStr);
        if (holRows?.length) {
          const holidayLabel = holRows.map((r) => `${r.holidayName} (${holidayTypeLabel(r.type)})`).join(' · ');
          list.push({
            day,
            dateStr,
            kind: holidayCellKind(holRows),
            status: statusByDate.get(dateStr) || 'absent',
            holidayLabel,
          });
          continue;
        }

        const isSunday = dow === 0;
        const isSaturday = dow === 6;
        const satCfg = isSaturday ? saturdayStatus.get(dateStr) ?? 'off' : null;
        const weekend = isSunday || (isSaturday && satCfg === 'off');
        const raw = statusByDate.get(dateStr) || 'absent';
        let kind: CellKind;
        if (weekend) kind = 'weekend';
        else if (raw === 'present') kind = 'present';
        else if (raw === 'leave') kind = 'leave';
        else if (raw === 'halfday') kind = 'halfday';
        else kind = 'absent';
        list.push({ day, dateStr, kind, status: raw });
      }
      setCells(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load calendar', 'error');
    }
  }, []);

  useEffect(() => {
    build(month, year).catch(() => {});
  }, [build, month, year]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    let holiday = 0;
    for (const c of cells) {
      if (c.kind === 'holiday_national' || c.kind === 'holiday_festival' || c.kind === 'holiday_optional') {
        holiday += 1;
      } else if (c.kind === 'present' || c.kind === 'halfday') present += 1;
      else if (c.kind === 'leave') leave += 1;
      else if (c.kind === 'absent') absent += 1;
    }
    return { present, absent, leave, holiday };
  }, [cells]);

  const todayStr = new Date().toISOString().slice(0, 10);

  function cellClasses(c: Cell) {
    const isToday = c.dateStr === todayStr;
    if (c.kind === 'empty') return 'aspect-square bg-transparent';
    if (c.kind === 'weekend') {
      return cn(
        'relative flex aspect-square flex-col justify-between rounded-md border border-transparent p-1.5 text-left opacity-30',
        isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
      );
    }
    if (c.kind === 'holiday_national') {
      return cn(
        'relative flex aspect-square flex-col justify-between rounded-md border-l-[3px] border-l-[#2563eb] bg-[rgba(37,99,235,0.14)] p-1.5 text-left font-["DM_Sans",sans-serif] text-[11px]',
        isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
      );
    }
    if (c.kind === 'holiday_festival') {
      return cn(
        'relative flex aspect-square flex-col justify-between rounded-md border-l-[3px] border-l-[#9333ea] bg-[rgba(147,51,234,0.14)] p-1.5 text-left font-["DM_Sans",sans-serif] text-[11px]',
        isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
      );
    }
    if (c.kind === 'holiday_optional') {
      return cn(
        'relative flex aspect-square flex-col justify-between rounded-md border-l-[3px] border-l-[#64748b] bg-[rgba(100,116,139,0.16)] p-1.5 text-left font-["DM_Sans",sans-serif] text-[11px]',
        isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
      );
    }
    const base =
      'relative flex aspect-square flex-col justify-between rounded-md border-l-[3px] p-1.5 text-left font-["DM_Sans",sans-serif] text-[11px]';
    if (c.kind === 'present') {
      return cn(
        base,
        'border-l-[#22c55e] bg-[rgba(34,197,94,0.12)] text-[var(--text-primary,#000)]',
        isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
      );
    }
    if (c.kind === 'halfday') {
      return cn(
        base,
        'border-l-[#eab308] bg-[rgba(234,179,8,0.12)] text-[var(--text-primary,#000)]',
        isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
      );
    }
    if (c.kind === 'leave') {
      return cn(
        base,
        'border-l-[#eab308] bg-[rgba(234,179,8,0.12)] text-[var(--text-primary,#000)]',
        isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
      );
    }
    return cn(
      base,
      'border-l-[#ed1d24] bg-[rgba(237,29,36,0.12)] text-[var(--text-primary,#000)]',
      isToday && 'outline outline-2 outline-offset-[-2px] outline-[#ed1d24]'
    );
  }

  function dotColor(c: Cell) {
    if (c.kind === 'holiday_national') return '#2563eb';
    if (c.kind === 'holiday_festival') return '#9333ea';
    if (c.kind === 'holiday_optional') return '#64748b';
    if (c.kind === 'present') return '#22c55e';
    if (c.kind === 'leave' || c.kind === 'halfday') return '#eab308';
    if (c.kind === 'absent') return '#ed1d24';
    return 'transparent';
  }

  function label(c: Cell) {
    if (c.kind === 'empty') return '';
    if (c.kind === 'weekend') return '';
    if (c.kind === 'holiday_national') return 'National';
    if (c.kind === 'holiday_festival') return 'Festival';
    if (c.kind === 'holiday_optional') return 'Optional';
    if (c.kind === 'present') return 'P';
    if (c.kind === 'absent') return 'A';
    if (c.kind === 'leave') return 'L';
    if (c.kind === 'halfday') return '½';
    return '';
  }

  function cellTitle(c: Cell) {
    if (c.kind === 'empty') return '';
    if (c.holidayLabel) return `${c.dateStr}: ${c.holidayLabel}`;
    return `${c.dateStr}: ${c.status}`;
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-lg text-[#ed1d24]"
            aria-label="Previous month"
            onClick={() => {
              if (month <= 1) {
                setMonth(12);
                setYear((y) => y - 1);
              } else setMonth((m) => m - 1);
            }}
          >
            ‹
          </button>
          <h2 className="font-['Bebas_Neue',sans-serif] text-[28px] tracking-wide text-[var(--text-primary)]">
            {new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long' })} {year}
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-lg text-[#ed1d24]"
            aria-label="Next month"
            onClick={() => {
              if (month >= 12) {
                setMonth(1);
                setYear((y) => y + 1);
              } else setMonth((m) => m + 1);
            }}
          >
            ›
          </button>
        </div>
        <div className="flex flex-wrap gap-2 font-['DM_Sans',sans-serif] text-xs">
          <span
            className="rounded-full px-2 py-1 font-semibold"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
          >
            Full Day: {summary.present}
          </span>
          <span
            className="rounded-full px-2 py-1 font-semibold"
            style={{ background: 'rgba(237,29,36,0.15)', color: '#ed1d24' }}
          >
            Absent: {summary.absent}
          </span>
          <span
            className="rounded-full px-2 py-1 font-semibold"
            style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}
          >
            Leave: {summary.leave}
          </span>
          <span
            className="rounded-full px-2 py-1 font-semibold"
            style={{ background: 'rgba(37,99,235,0.12)', color: '#2563eb' }}
          >
            Holiday: {summary.holiday}
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="font-['DM_Sans',sans-serif] text-sm font-medium text-[var(--text-primary)]">
          Month
          <input
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="mt-1 block min-h-[44px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </label>
        <label className="font-['DM_Sans',sans-serif] text-sm font-medium text-[var(--text-primary)]">
          Year
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 block min-h-[44px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </label>
        <button
          type="button"
          onClick={() => build(month, year)}
          className="min-h-[44px] rounded-md bg-[#ed1d24] px-5 py-2.5 font-['DM_Sans',sans-serif] text-sm font-semibold text-white"
        >
          Load
        </button>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-1 text-center font-['DM_Sans',sans-serif] text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {WEEK_LABELS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c, idx) =>
          c.kind === 'empty' ? (
            <div key={`pad-${idx}`} className="aspect-square bg-transparent" />
          ) : (
            <div key={c.dateStr || `w-${idx}`} title={cellTitle(c)} className={cellClasses(c)}>
              <span className="text-sm font-bold text-[var(--text-primary)]">{c.day}</span>
              <span className="flex items-center gap-1">
                {c.kind !== 'weekend' && (
                  <>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: dotColor(c) }} />
                    <span className="font-bold leading-tight">{label(c)}</span>
                  </>
                )}
                {c.holidayLabel && (
                  <span className="mt-1 block max-w-full truncate text-[10px] font-semibold text-[var(--text-primary)]">
                    {c.holidayLabel}
                  </span>
                )}
              </span>
            </div>
          )
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-4 font-['DM_Sans',sans-serif] text-xs text-[var(--text-primary)]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Full Day
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#ed1d24]" /> Absent
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#eab308]" /> Leave
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#2563eb]" /> National
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#9333ea]" /> Festival
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#64748b]" /> Optional
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[rgba(255,255,255,0.35)]" /> Off / Sun
        </span>
        <span className="flex items-center gap-1 text-[var(--text-muted)]">
          <span className="inline-block h-2 w-2 rounded border border-dashed border-[var(--text-muted)]" /> Working Sat
        </span>
      </div>
    </div>
  );
}
