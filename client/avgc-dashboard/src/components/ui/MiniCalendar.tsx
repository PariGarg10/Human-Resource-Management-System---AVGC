import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatAttendanceStatus, monthName } from '@/lib/attendanceLabels';
import { cn } from '@/lib/cn';

type RecordRow = { date: string; status?: string; reason?: string | null };

type Props = {
  onOpenCalendar?: () => void;
};

function mondayIndex(jsDay: number) {
  return (jsDay + 6) % 7;
}

function dotColor(status: string) {
  if (status === 'present') return '#697279';
  if (status === 'halfday') return '#ebebec';
  if (status === 'leave') return '#ed1d24';
  if (status === 'absent') return '#ed1d24';
  return 'transparent';
}

function cellClass(status: string) {
  if (status === 'present') return 'is-present';
  if (status === 'halfday') return 'is-halfday';
  if (status === 'leave') return 'is-leave';
  if (status === 'absent') return 'is-absent';
  return '';
}

export function MiniCalendar({ onOpenCalendar }: Props) {
  const now = new Date();
  const [month] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const [recordsByDate, setRecordsByDate] = useState<Map<string, RecordRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ records: RecordRow[] }>(`/api/attendance/history?month=${month}&year=${year}`);
      setRecordsByDate(new Map((data.records || []).map((r) => [r.date, r])));
    } catch {
      setRecordsByDate(new Map());
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const first = new Date(year, month - 1, 1);
  const startPad = mondayIndex(first.getDay());
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const cells: { day: number; dateStr: string }[] = [];
  for (let i = 0; i < startPad; i += 1) cells.push({ day: 0, dateStr: '' });
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ day: 0, dateStr: '' });

  return (
    <button
      type="button"
      className="dashboard-mini-cal"
      onClick={() => onOpenCalendar?.()}
      aria-label={`Open full calendar for ${monthName(month)} ${year}`}
    >
      <div className="dashboard-mini-cal-head">
        <div>
          <h3 className="dashboard-home-card-title">My attendance</h3>
          <p className="dashboard-home-card-sub">
            {monthName(month)} {year}
            {loading ? ' · Loading…' : ' · Tap for full calendar'}
          </p>
        </div>
        <div className="dashboard-mini-cal-legend dashboard-mini-cal-legend--top" aria-hidden="true">
          <span><i className="dot-present" /> Present</span>
          <span><i className="dot-absent" /> Absent</span>
          <span><i className="dot-halfday" /> Half Day</span>
          <span><i className="dot-holiday" /> Holiday</span>
          <span><i className="dot-leave" /> Leave</span>
        </div>
      </div>

      <div className="dashboard-mini-cal-weekdays" aria-hidden="true">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>

      <div className="dashboard-mini-cal-grid">
        {cells.map((c, idx) => {
          if (!c.day) return <span key={`pad-${idx}`} className="dashboard-mini-cal-pad" />;
          const record = recordsByDate.get(c.dateStr);
          const status = (record?.status || '').toLowerCase();
          const label = status
            ? formatAttendanceStatus(status, record?.reason)
            : 'No record';
          return (
            <span
              key={c.dateStr}
              title={`${c.day} ${monthName(month)}: ${label}`}
              className={cn('dashboard-mini-cal-day', cellClass(status), c.dateStr === todayStr && 'is-today')}
            >
              <span className="dashboard-mini-cal-day-num">{c.day}</span>
              {status ? (
                <span
                  className="dashboard-mini-cal-dot"
                  style={{ background: dotColor(status) }}
                  aria-hidden="true"
                />
              ) : (
                <span className="dashboard-mini-cal-dot is-empty" aria-hidden="true" />
              )}
            </span>
          );
        })}
      </div>
    </button>
  );
}
