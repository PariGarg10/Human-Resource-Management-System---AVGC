import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatTime } from '@/lib/datetime';
import {
  formatAttendanceStatus,
  formatLiveDate,
  getMonday,
  monthName,
  weeksInMonth,
} from '@/lib/attendanceLabels';
import { clampPortalYear, currentPortalYear, MIN_PORTAL_YEAR } from '@/lib/yearMin';

type RecordRow = {
  date: string;
  punchin?: string | null;
  punchout?: string | null;
  totalhours?: number | null;
  status?: string;
  reason?: string | null;
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function AttendancePanel() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => currentPortalYear());
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState('');
  const [todayCard, setTodayCard] = useState<RecordRow | null>(null);
  const [weekKey, setWeekKey] = useState('');

  const load = useCallback(async () => {
    try {
      const [historyData, summaryData, todayData] = await Promise.all([
        api<{ records: RecordRow[] }>(`/api/attendance/history?month=${month}&year=${year}`),
        api<{ present: number; halfday: number; absent: number; leave?: number; holidays?: number }>(
          `/api/attendance/summary?month=${month}&year=${year}`
        ),
        api<{ record: RecordRow | null }>('/api/attendance/today'),
      ]);
      setRows(historyData.records || []);
      setSummary(
        `Present: ${summaryData.present} · Half Day: ${summaryData.halfday} · Leave: ${summaryData.leave || 0} · Absent: ${summaryData.absent}`
      );
      const r = todayData.record;
      setTodayCard(r ? { ...r, date: r.date || '' } : null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load', 'error');
    }
  }, [month, year]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const weekOptions = useMemo(() => weeksInMonth(month, year), [month, year]);

  useEffect(() => {
    if (weekOptions.length && !weekOptions.some((w) => w.key === weekKey)) {
      const today = new Date();
      const key = getMonday(today).toISOString().slice(0, 10);
      const match = weekOptions.find((w) => w.key === key);
      setWeekKey(match?.key || weekOptions[0].key);
    }
  }, [weekOptions, weekKey]);

  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const yesterdayRow = rows.find((r) => r.date === yesterday);

  const grouped = useMemo(() => {
    const filtered = weekKey
      ? rows.filter((row) => {
          const mon = getMonday(new Date(row.date));
          return mon.toISOString().slice(0, 10) === weekKey;
        })
      : rows;
    const map = new Map<string, RecordRow[]>();
    for (const row of filtered) {
      const mon = getMonday(new Date(row.date));
      const key = mon.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, weekKey]);

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 className="panel-title">Check In Today — {formatLiveDate()}</h2>
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="stat-card">
            <p className="stat-label">Check in</p>
            <p className="stat-value" style={{ fontSize: '1rem' }}>
              {todayCard?.punchin ? formatTime(todayCard.punchin) : '—'}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Check out</p>
            <p className="stat-value" style={{ fontSize: '1rem' }}>
              {todayCard?.punchout ? formatTime(todayCard.punchout) : '—'}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Total hours</p>
            <p className="stat-value" style={{ fontSize: '1rem' }}>
              {todayCard?.totalhours != null ? String(todayCard.totalhours) : '—'}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Status yesterday</p>
            <p className="stat-value" style={{ fontSize: '1rem' }}>
              {yesterdayRow
                ? formatAttendanceStatus(yesterdayRow.status, yesterdayRow.reason)
                : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="panel panel--scroll">
        <div className="panel-header">
          <h2 className="panel-title">Attendance history</h2>
          <div className="filters-inline">
            <label>
              Month{' '}
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
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
                max={2100}
                value={year}
                onChange={(e) => setYear(clampPortalYear(e.target.value))}
              />
            </label>
            <label>
              Week{' '}
              <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)}>
                {weekOptions.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => load().catch(() => {})}>
              Submit
            </button>
          </div>
        </div>
        <p className="stat-sub" style={{ marginTop: 8 }}>
          {summary || 'Select month and year, then submit.'}
        </p>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          {grouped.length === 0 ? (
            <p className="stat-sub">No records for this period.</p>
          ) : (
            grouped.map(([key, weekRows]) => (
              <div key={key} style={{ marginBottom: 20 }}>
                <h3 className="stat-label" style={{ marginBottom: 8 }}>
                  Week of {weekOptions.find((w) => w.key === key)?.label || key}
                </h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th>Total hours</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekRows.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{row.punchin ? formatTime(row.punchin) : '—'}</td>
                        <td>{row.punchout ? formatTime(row.punchout) : '—'}</td>
                        <td>{row.totalhours != null ? row.totalhours : '—'}</td>
                        <td>{formatAttendanceStatus(row.status, row.reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
