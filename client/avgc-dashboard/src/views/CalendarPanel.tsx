import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { clampPortalYear, currentPortalYear, MIN_PORTAL_YEAR } from '@/lib/yearMin';
import { api } from '@/lib/api';
import { calendarDayAbbrev } from '@/lib/attendanceLabels';
import { toast } from '@/lib/toast';
import { formatTime } from '@/lib/datetime';
import { CALENDAR_COLORS as C } from '@/lib/calendarColors';
type HistoryRecord = {
  date: string;
  status?: string;
  punchin?: string | null;
  punchout?: string | null;
  totalhours?: number | null;
};

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
  punchin?: string | null;
  punchout?: string | null;
  totalhours?: number | null;
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

function CalendarDayTooltip({ cell }: { cell: Cell }) {
  return (
    <div className="attendance-calendar-tooltip" role="tooltip">
      {cell.holidayLabel ? <p className="attendance-calendar-tooltip-holiday">{cell.holidayLabel}</p> : null}
      <p>
        Check-in:{' '}
        {cell.punchin ? (
          <span>{formatTime(cell.punchin)}</span>
        ) : (
          <span className="attendance-calendar-missing">Not checked in</span>
        )}
      </p>
      <p>
        Check-out:{' '}
        {cell.punchout ? (
          <span>{formatTime(cell.punchout)}</span>
        ) : (
          <span className="attendance-calendar-missing">Not checked out</span>
        )}
      </p>
      {cell.totalhours != null ? <p className="attendance-calendar-tooltip-hours">{cell.totalhours}h logged</p> : null}
    </div>
  );
}

export function CalendarPanel() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => currentPortalYear());
  const [cells, setCells] = useState<Cell[]>([]);
  const [hovered, setHovered] = useState<Cell | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const build = useCallback(async (m: number, y: number) => {
    try {
      const historyData = await api<{
        records: HistoryRecord[];
        saturdayConfig?: SaturdayEntry[];
        holidays?: HolidayRow[];
      }>(`/api/attendance/history?month=${m}&year=${y}`);
      const recordByDate = new Map((historyData.records || []).map((r) => [r.date, r]));
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
        const rec = recordByDate.get(dateStr);
        const holRows = holidayByDate.get(dateStr);
        if (holRows?.length) {
          const holidayLabel = holRows.map((r) => `${r.holidayName} (${holidayTypeLabel(r.type)})`).join(' · ');
          list.push({
            day,
            dateStr,
            kind: holidayCellKind(holRows),
            status: rec?.status || 'absent',
            holidayLabel,
            punchin: rec?.punchin,
            punchout: rec?.punchout,
            totalhours: rec?.totalhours,
          });
          continue;
        }

        const isSunday = dow === 0;
        const isSaturday = dow === 6;
        const satCfg = isSaturday ? saturdayStatus.get(dateStr) ?? 'off' : null;
        const weekend = isSunday || (isSaturday && satCfg === 'off');
        const raw = (rec?.status || 'absent').toLowerCase();
        let kind: CellKind;
        if (weekend) kind = 'weekend';
        else if (raw === 'present') kind = 'present';
        else if (raw === 'leave') kind = 'leave';
        else if (raw === 'halfday') kind = 'halfday';
        else kind = 'absent';
        list.push({
          day,
          dateStr,
          kind,
          status: raw,
          punchin: rec?.punchin,
          punchout: rec?.punchout,
          totalhours: rec?.totalhours,
        });
      }
      const totalSlots = Math.ceil(list.length / 7) * 7;
      while (list.length < totalSlots) {
        list.push({ day: 0, dateStr: '', kind: 'empty', status: '' });
      }
      setCells(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load calendar', 'error');
    }
  }, []);

  useEffect(() => {
    build(month, year).catch(() => {});
  }, [build, month, year]);

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long' });

  function cellClasses(c: Cell) {
    if (c.kind === 'empty') return 'attendance-calendar-day bg-transparent pointer-events-none';
    if (c.kind === 'weekend') {
      return 'attendance-calendar-day opacity-30 border border-transparent';
    }
    if (c.kind === 'holiday_national' || c.kind === 'holiday_festival' || c.kind === 'holiday_optional') {
      return 'attendance-calendar-day cal-day-holiday';
    }
    if (c.kind === 'present') return 'attendance-calendar-day cal-day-present';
    if (c.kind === 'halfday') return 'attendance-calendar-day cal-day-halfday';
    if (c.kind === 'leave') return 'attendance-calendar-day cal-day-leave';
    return 'attendance-calendar-day cal-day-absent';
  }

  function dotColor(c: Cell) {
    if (c.kind === 'holiday_national' || c.kind === 'holiday_festival' || c.kind === 'holiday_optional') {
      return '#697279';
    }
    if (c.kind === 'present') return C.present;
    if (c.kind === 'halfday') return C.halfday;
    if (c.kind === 'leave') return C.leave;
    if (c.kind === 'absent') return C.absent;
    return 'transparent';
  }

  function label(c: Cell) {
    if (c.kind === 'empty' || c.kind === 'weekend') return '';
    if (c.kind === 'holiday_national') return 'National';
    if (c.kind === 'holiday_festival') return 'Festival';
    if (c.kind === 'holiday_optional') return 'Optional';
    if (c.kind === 'present' || c.kind === 'halfday' || c.kind === 'absent' || c.kind === 'leave') {
      return calendarDayAbbrev(c.kind);
    }
    return '';
  }

  function showTooltip(e: MouseEvent<HTMLDivElement>, c: Cell) {
    if (c.kind === 'empty' || c.kind === 'weekend') return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHovered(c);
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
  }

  function hideTooltip() {
    setHovered(null);
  }

  const atMinMonth =
    year < MIN_PORTAL_YEAR || (year === MIN_PORTAL_YEAR && month <= 1);

  function prevMonth() {
    if (atMinMonth) return;
    if (month <= 1) {
      setMonth(12);
      setYear((y) => clampPortalYear(y - 1));
    } else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month >= 12) {
      setMonth(1);
      setYear((y) => clampPortalYear(y + 1));
    } else setMonth((m) => m + 1);
  }

  return (
    <div className="attendance-calendar-viewport">
      <div className="attendance-calendar-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            className="calendar-nav-btn"
            aria-label="Previous month"
            onClick={prevMonth}
            disabled={atMinMonth}
          >
            ‹
          </button>
          <h2 className="calendar-month-title">
            {monthLabel} {year}
          </h2>
          <button type="button" className="calendar-nav-btn" aria-label="Next month" onClick={nextMonth}>
            ›
          </button>
        </div>
        <div className="attendance-calendar-legend attendance-calendar-legend--toolbar">
          <span>
            <span className="legend-dot" style={{ background: C.present }} /> Present
          </span>
          <span>
            <span className="legend-dot" style={{ background: C.absent }} /> Absent
          </span>
          <span>
            <span className="legend-dot" style={{ background: C.halfday, boxShadow: `inset 0 0 0 1px ${C.halfdayBorder}` }} /> Half day
          </span>
          <span>
            <span className="legend-dot" style={{ background: '#9ca3af' }} /> Holiday
          </span>
          <span>
            <span className="legend-dot" style={{ background: C.leave }} /> Leave
          </span>
        </div>
      </div>

      <div className="attendance-calendar-weekdays">
        {WEEK_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="attendance-calendar-grid">
        {cells.map((c, idx) =>
          c.kind === 'empty' ? (
            <div key={`pad-${idx}`} className="attendance-calendar-day bg-transparent" aria-hidden />
          ) : (
            <div
              key={c.dateStr || `w-${idx}`}
              className={cellClasses(c)}
              onMouseEnter={(e) => showTooltip(e, c)}
              onMouseLeave={hideTooltip}
            >
              <span className="day-num">{c.day}</span>
              {c.kind !== 'weekend' && (
                <span className="day-meta" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span className="day-dot" style={{ background: dotColor(c) }} />
                    <span className="day-label">{label(c)}</span>
                  </span>
                </span>
              )}
            </div>
          )
        )}
      </div>

      {hovered ? (
        <div
          className="attendance-calendar-tooltip-portal"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <CalendarDayTooltip cell={hovered} />
        </div>
      ) : null}

      <p className="attendance-calendar-hint">Hover a day for check-in and check-out times.</p>
    </div>
  );
}
