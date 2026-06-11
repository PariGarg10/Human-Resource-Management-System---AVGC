import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatAttendanceStatus, formatLiveDate, monthName } from '@/lib/attendanceLabels';
import { clampPortalYear, currentPortalYear, MIN_PORTAL_YEAR } from '@/lib/yearMin';
import { toast } from '@/lib/toast';

type DashboardSummary = {
  date: string;
  totalemployees: number;
  pendingleaves: number;
  todaysummary: {
    present: number;
    halfday: number;
    leave: number;
    absent: number;
    holidays: number;
  };
};

type DailyRecord = {
  employeeid: number;
  employeecode?: string;
  name: string;
  department?: string | null;
  date: string;
  punchin?: string | null;
  punchout?: string | null;
  totalhours?: number | null;
  status: string;
};

type MonthRow = {
  employeeid: number;
  employeecode?: string;
  name: string;
  presentdays: number;
  halfdays: number;
  leavedays: number;
  absentdays: number;
};

export function ManagerTeamAttendancePanel() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => currentPortalYear());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, dailyData, monthlyData] = await Promise.all([
        api<DashboardSummary>(`/api/manager/dashboard-summary?date=${date}`),
        api<{ records: DailyRecord[] }>(`/api/manager/attendance/daily?date=${date}`),
        api<{ rows: MonthRow[] }>(`/api/manager/team-summary?month=${month}&year=${year}`),
      ]);
      setSummary(summaryData);
      setDaily(dailyData.records || []);
      setMonthly(monthlyData.rows || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load team attendance', 'error');
    } finally {
      setLoading(false);
    }
  }, [date, month, year]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const todayStats = summary?.todaysummary;

  return (
    <div className="panel panel--scroll">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Team attendance</h2>
          <p className="stat-sub">Attendance stats for employees assigned to you.</p>
        </div>
        <div className="filters-inline">
          <label>
            Day{' '}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Month{' '}
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
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
              value={year}
              onChange={(e) => setYear(clampPortalYear(e.target.value))}
            />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => load().catch(() => {})}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="stat-sub">Loading team attendance…</p>
      ) : (
        <>
          <div className="stat-grid manager-team-stat-grid">
            <div className="stat-card">
              <div className="stat-label">Team size</div>
              <div className="stat-value">{summary?.totalemployees ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Present today</div>
              <div className="stat-value">{todayStats?.present ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Half day</div>
              <div className="stat-value">{todayStats?.halfday ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">On leave</div>
              <div className="stat-value">{todayStats?.leave ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Absent</div>
              <div className="stat-value">{todayStats?.absent ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pending leaves</div>
              <div className="stat-value">{summary?.pendingleaves ?? 0}</div>
            </div>
          </div>

          <h3 className="panel-title" style={{ fontSize: '1.05rem', marginBottom: 12 }}>
            Daily attendance — {formatLiveDate(new Date(date + 'T12:00:00'))}
          </h3>
          <div className="table-wrap table-wrap--scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Punch in</th>
                  <th>Punch out</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {daily.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="stat-sub">
                      No employees assigned to you yet.
                    </td>
                  </tr>
                ) : (
                  daily.map((row) => (
                    <tr key={row.employeeid}>
                      <td>
                        <strong>{row.name}</strong>
                        {row.employeecode ? <div className="stat-sub">{row.employeecode}</div> : null}
                      </td>
                      <td>{row.department || '—'}</td>
                      <td>{formatAttendanceStatus(row.status)}</td>
                      <td>{row.punchin || '—'}</td>
                      <td>{row.punchout || '—'}</td>
                      <td>{row.totalhours != null ? Number(row.totalhours).toFixed(1) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 className="panel-title" style={{ fontSize: '1.05rem', margin: '24px 0 12px' }}>
            Monthly summary — {monthName(month)} {year}
          </h3>
          <div className="table-wrap table-wrap--scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Present</th>
                  <th>Half day</th>
                  <th>Leave</th>
                  <th>Absent</th>
                </tr>
              </thead>
              <tbody>
                {monthly.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="stat-sub">
                      No monthly data for your team.
                    </td>
                  </tr>
                ) : (
                  monthly.map((row) => (
                    <tr key={row.employeeid}>
                      <td>
                        <strong>{row.name}</strong>
                        {row.employeecode ? <div className="stat-sub">{row.employeecode}</div> : null}
                      </td>
                      <td>{row.presentdays}</td>
                      <td>{row.halfdays}</td>
                      <td>{row.leavedays}</td>
                      <td>{row.absentdays}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
