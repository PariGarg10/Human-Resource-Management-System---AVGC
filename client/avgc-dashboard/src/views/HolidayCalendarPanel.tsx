import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { clampPortalYear, currentPortalYear, MIN_PORTAL_YEAR, MAX_PORTAL_YEAR } from '@/lib/yearMin';

type HolidayRow = {
  date: string;
  holidayName: string;
  type: string;
};

function typeLabel(type: string) {
  const t = (type || '').toLowerCase();
  if (t === 'public') return 'Public';
  if (t === 'optional') return 'Optional';
  return type || '—';
}

export function HolidayCalendarPanel() {
  const [year, setYear] = useState(() => currentPortalYear());
  const [rows, setRows] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ holidays: HolidayRow[] }>(`/api/holidays?year=${year}`);
      setRows(data.holidays || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load holidays', 'error');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <div className="panel holiday-calendar-panel">
      <div className="panel-header">
        <h2 className="panel-title">Holiday calendar</h2>
        <div className="filters-inline">
          <label>
            Year{' '}
            <input
              type="number"
              min={MIN_PORTAL_YEAR}
              max={MAX_PORTAL_YEAR}
              value={year}
              onChange={(e) => setYear(clampPortalYear(e.target.value))}
            />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => load().catch(() => {})}>
            Load
          </button>
        </div>
      </div>
      <div className="holiday-calendar-table" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Holiday</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="stat-sub">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="stat-sub">
                  No holidays found for this year.
                </td>
              </tr>
            ) : (
              rows.map((h) => (
                <tr key={`${h.date}-${h.holidayName}`}>
                  <td>{h.date}</td>
                  <td>{h.holidayName}</td>
                  <td>
                    <span className="badge">{typeLabel(h.type)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
